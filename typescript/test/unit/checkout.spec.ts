import { DatabaseError, type PoolClient } from "pg"
import { CheckoutService, ShopError, ShopErrorCode } from "../../src/modules/domain/shop"
import { type Database, Tx, brokenRuleOf } from "../../src/platform/database"
import { FaultsService } from "../../src/platform/faults"

/** A Postgres refusal as `pg` builds it from the server's answer. */
const refusal = (code: string, constraint: string, table: string, detail: string): DatabaseError => {
    const error = new DatabaseError("refused", 0, "error")
    error.code = code
    error.constraint = constraint
    error.table = table
    error.detail = detail
    return error
}

/** A connection that records every statement and fails the ones `fail` picks. */
const fakeClient = (fail: (text: string) => Error | null = () => null): { client: PoolClient; statements: string[] } => {
    const statements: string[] = []
    const client = {
        query: async (text: string) => {
            statements.push(text.split(" ").slice(0, 3).join(" "))
            const error = fail(text)
            if (error !== null) throw error
            return { rows: [] }
        },
    } as unknown as PoolClient
    return { client, statements }
}

/** A Database whose reads answer the sample prices and whose transaction runs `work` on the given connection. */
const fakeDatabase = (client: PoolClient): Database =>
    ({
        query: async (text: string) =>
            text.includes("FROM products") ? [{ id: "giay-chay-bo", price: "1200000" }] : text.includes("FROM vouchers") ? [{ percent: 10 }] : [],
        transaction: async (work: (tx: Tx) => Promise<unknown>) => work(new Tx(client, new FaultsService())),
    }) as unknown as Database

describe("brokenRuleOf", () => {
    it("reads the constraint, the table and the refused row of a rule refusal", () => {
        const rule = brokenRuleOf(refusal("23514", "stock_qty_not_negative", "stock", "Failing row contains (giay-chay-bo, -1)."))
        expect(rule).toEqual({ code: "23514", constraint: "stock_qty_not_negative", table: "stock", row: ["giay-chay-bo", "-1"] })
    })

    it("is null for an error that is not a rule refusal", () => {
        expect(brokenRuleOf(new Error("boom"))).toBeNull()
        expect(brokenRuleOf(refusal("58030", "", "", ""))).toBeNull()
    })
})

describe("Tx.savepoint", () => {
    it("releases the savepoint when the work succeeds", async () => {
        const { client, statements } = fakeClient()
        await new Tx(client, new FaultsService()).savepoint("voucher", async () => undefined)
        expect(statements).toEqual(["SAVEPOINT voucher", "RELEASE SAVEPOINT voucher"])
    })

    it("rolls back to the savepoint and rethrows when the work fails", async () => {
        const { client, statements } = fakeClient()
        const failure = new Error("refused")
        await expect(
            new Tx(client, new FaultsService()).savepoint("voucher", async () => {
                throw failure
            }),
        ).rejects.toBe(failure)
        expect(statements).toEqual(["SAVEPOINT voucher", "ROLLBACK TO SAVEPOINT"])
    })

    it("refuses a name that is not a plain identifier", async () => {
        const { client } = fakeClient()
        await expect(new Tx(client, new FaultsService()).savepoint("x; DROP TABLE orders", async () => undefined)).rejects.toThrow("invalid savepoint name")
    })
})

describe("CheckoutService", () => {
    const input = { orderId: "ord-1", customerId: "c-1", lines: [{ productId: "giay-chay-bo", qty: 3 }] }

    it("answers OUT_OF_STOCK with the product when the stock rule refuses the write", async () => {
        const { client } = fakeClient((text) =>
            text.startsWith("UPDATE stock") ? refusal("23514", "stock_qty_not_negative", "stock", "Failing row contains (giay-chay-bo, -1).") : null,
        )
        const error = await new CheckoutService(fakeDatabase(client)).checkout(input).catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(ShopError)
        expect((error as ShopError).code).toBe(ShopErrorCode.OutOfStock)
        expect((error as ShopError).params).toEqual({ productId: "giay-chay-bo" })
    })

    it("answers INSUFFICIENT_FUNDS when the wallet rule refuses the write", async () => {
        const { client } = fakeClient((text) =>
            text.startsWith("UPDATE wallets") ? refusal("23514", "wallets_balance_not_negative", "wallets", "Failing row contains (c-1, -100).") : null,
        )
        const error = await new CheckoutService(fakeDatabase(client)).checkout(input).catch((caught: unknown) => caught)
        expect((error as ShopError).code).toBe(ShopErrorCode.InsufficientFunds)
    })

    it("lets any other database error through, so it stays a 500", async () => {
        const fault = refusal("58030", "", "", "")
        const { client } = fakeClient((text) => (text.startsWith("UPDATE wallets") ? fault : null))
        await expect(new CheckoutService(fakeDatabase(client)).checkout(input)).rejects.toBe(fault)
    })

    it("drops the discount but keeps the order when the code was already used", async () => {
        const { client, statements } = fakeClient((text) =>
            text.startsWith("INSERT INTO voucher_redemptions")
                ? refusal("23505", "voucher_redemptions_code_once", "voucher_redemptions", "Key (code)=(GIAM10) already exists.")
                : null,
        )
        const placed = await new CheckoutService(fakeDatabase(client)).checkout({ ...input, lines: [{ productId: "giay-chay-bo", qty: 1 }], voucher: "GIAM10" })
        expect(placed).toEqual({
            orderId: "ord-1",
            subtotal: 1_200_000,
            discount: 0,
            total: 1_200_000,
            voucher: { applied: false, code: "GIAM10", reason: "USED" },
        })
        expect(statements).toContain("ROLLBACK TO SAVEPOINT")
        expect(statements.at(-1)).toBe("UPDATE stock SET")
    })

    it("applies the discount when the code is free", async () => {
        const { client } = fakeClient()
        const placed = await new CheckoutService(fakeDatabase(client)).checkout({ ...input, lines: [{ productId: "giay-chay-bo", qty: 1 }], voucher: "GIAM10" })
        expect(placed).toMatchObject({ subtotal: 1_200_000, discount: 120_000, total: 1_080_000, voucher: { applied: true } })
    })
})
