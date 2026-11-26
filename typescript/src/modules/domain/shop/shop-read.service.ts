import { Injectable } from "@nestjs/common"
import { Database } from "../../../platform/database"
import { ShopError, ShopErrorCode } from "./errors/shop.error"
import type { OrderView, StockView, WalletView } from "./shop.contracts"

@Injectable()
/** Read-only views of an order, a wallet and a product's stock, for the customer and for anyone inspecting the shop. */
export class ShopReadService {
    constructor(private readonly database: Database) {}

    async order(id: string): Promise<OrderView> {
        const [order] = await this.database.query<Omit<OrderView, "items" | "voucher">>(
            "SELECT id, customer_id, subtotal::int AS subtotal, discount::int AS discount FROM orders WHERE id = $1",
            [id],
        )
        if (order === undefined) throw new ShopError({ code: ShopErrorCode.OrderNotFound })
        const items = await this.database.query<OrderView["items"][number]>(
            "SELECT product_id, qty, unit_price::int AS unit_price FROM order_items WHERE order_id = $1 ORDER BY product_id",
            [id],
        )
        const [voucher] = await this.database.query<{ code: string }>("SELECT code FROM voucher_redemptions WHERE order_id = $1", [id])
        return { ...order, items, voucher: voucher?.code ?? null }
    }

    async wallet(customerId: string): Promise<WalletView> {
        const [wallet] = await this.database.query<WalletView>("SELECT customer_id, balance::int AS balance FROM wallets WHERE customer_id = $1", [
            customerId,
        ])
        if (wallet === undefined) throw new ShopError({ code: ShopErrorCode.WalletNotFound })
        return wallet
    }

    async stock(productId: string): Promise<StockView> {
        const [stock] = await this.database.query<StockView>("SELECT product_id, qty FROM stock WHERE product_id = $1", [productId])
        if (stock === undefined) throw new ShopError({ code: ShopErrorCode.ProductNotFound })
        return stock
    }
}
