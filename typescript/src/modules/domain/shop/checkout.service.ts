import { Injectable } from "@nestjs/common"
import { Database, PgCode, brokenRuleOf, type Tx } from "../../../platform/database"
import { ShopError, ShopErrorCode } from "./errors/shop.error"
import type { CheckoutInput, PlacedOrder, VoucherOutcome } from "./shop.contracts"

/** The constraints of db/migrations whose refusal is the customer's to fix; any other refusal is the shop's fault (500). */
const STOCK_RULE = "stock_qty_not_negative"
const WALLET_RULE = "wallets_balance_not_negative"
const VOUCHER_ONCE_RULE = "voucher_redemptions_code_once"

@Injectable()
/**
 * Places an order. The five writes (order, lines, voucher redemption, wallet debit, stock) run in one transaction on one
 * connection, opened here and nowhere else:
 *
 * - all or nothing: a refused or failed write rolls the whole order back, so no half order is ever stored;
 * - the connection goes back clean: `Database.transaction` ends the block with `COMMIT` or `ROLLBACK` before releasing it;
 * - the database keeps the rules: stock and wallets never go below zero because of CHECK constraints, and this service turns
 *   the refusal into an answer the customer understands instead of re-checking by reading first;
 * - the voucher is an optional step behind its own savepoint: a code someone already used drops the discount, not the order;
 * - an order answered 201 is committed, and Postgres answers `COMMIT` only once the commit is on disk.
 *
 * Nothing outside the database runs inside the transaction.
 */
export class CheckoutService {
    constructor(private readonly database: Database) {}

    async checkout(input: CheckoutInput): Promise<PlacedOrder> {
        const prices = await this.pricesOf(input)
        const percent = input.voucher === undefined ? 0 : await this.percentOf(input.voucher)
        try {
            return await this.database.transaction((tx) => this.writeOrder(tx, input, prices, percent))
        } catch (cause) {
            throw this.refusalOf(cause) ?? cause
        }
    }

    /** The five writes, in order, all on `tx`. */
    private async writeOrder(tx: Tx, input: CheckoutInput, prices: ReadonlyMap<string, number>, percent: number): Promise<PlacedOrder> {
        // An unknown product is priced 0 here; its order line is then refused by the foreign key to `products`.
        const subtotal = input.lines.reduce((sum, line) => sum + (prices.get(line.productId) ?? 0) * line.qty, 0)

        await tx.query("INSERT INTO orders (id, customer_id, subtotal) VALUES ($1, $2, $3)", [input.orderId, input.customerId, subtotal])
        for (const line of input.lines) {
            await tx.query("INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES ($1, $2, $3, $4)", [
                input.orderId,
                line.productId,
                line.qty,
                prices.get(line.productId) ?? 0,
            ])
        }

        const offered = Math.floor((subtotal * percent) / 100)
        const voucher = input.voucher === undefined ? undefined : await this.redeem(tx, input.orderId, input.voucher, offered)
        const discount = voucher?.applied === true ? offered : 0
        const total = subtotal - discount

        await tx.query("UPDATE wallets SET balance = balance - $2 WHERE customer_id = $1", [input.customerId, total])
        for (const line of input.lines) {
            await tx.query("UPDATE stock SET qty = qty - $2 WHERE product_id = $1", [line.productId, line.qty])
        }
        return { orderId: input.orderId, subtotal, discount, total, ...(voucher === undefined ? {} : { voucher }) }
    }

    /**
     * The optional step: record the redemption and the discount behind a savepoint. A code another order already redeemed
     * undoes just this step and the order goes on at full price; any other error still fails the whole order.
     */
    private async redeem(tx: Tx, orderId: string, code: string, discount: number): Promise<VoucherOutcome> {
        try {
            await tx.savepoint("voucher", async () => {
                await tx.query("INSERT INTO voucher_redemptions (order_id, code) VALUES ($1, $2)", [orderId, code])
                await tx.query("UPDATE orders SET discount = $2 WHERE id = $1", [orderId, discount])
            })
            return { applied: true, code }
        } catch (cause) {
            const rule = brokenRuleOf(cause)
            if (rule?.code === PgCode.UniqueViolation && rule.constraint === VOUCHER_ONCE_RULE) return { applied: false, code, reason: "USED" }
            throw cause
        }
    }

    /** A refused write the customer can act on, as a shop error; null for anything else, which stays a 500. */
    private refusalOf(cause: unknown): ShopError | null {
        const rule = brokenRuleOf(cause)
        if (rule?.code !== PgCode.CheckViolation) return null
        // The refused `stock` row is (product_id, qty): its first value names the product that ran out.
        if (rule.constraint === STOCK_RULE) return new ShopError({ code: ShopErrorCode.OutOfStock, params: { productId: rule.row[0] ?? "" }, cause })
        if (rule.constraint === WALLET_RULE) return new ShopError({ code: ShopErrorCode.InsufficientFunds, cause })
        return null
    }

    private async pricesOf(input: CheckoutInput): Promise<ReadonlyMap<string, number>> {
        const rows = await this.database.query<{ id: string; price: string }>("SELECT id, price FROM products WHERE id = ANY($1)", [
            input.lines.map((line) => line.productId),
        ])
        return new Map(rows.map((row) => [row.id, Number(row.price)]))
    }

    private async percentOf(code: string): Promise<number> {
        const [row] = await this.database.query<{ percent: number }>("SELECT percent FROM vouchers WHERE code = $1", [code])
        return row?.percent ?? 0
    }
}
