import type { ClientBase } from "pg"

/**
 * The shop's sample data: what `npm run seed` loads into an empty database and what the test hooks put back before each
 * spec. Seed data is never a migration: the migrations hold the schema only.
 */
export const PRODUCTS = [
    { id: "giay-chay-bo", name: "Giày chạy bộ", price: 1_200_000, qty: 10 },
    { id: "giay-da", name: "Giày da", price: 900_000, qty: 10 },
    { id: "dep-quai-ngang", name: "Dép quai ngang", price: 150_000, qty: 20 },
    { id: "tat-co-cao", name: "Tất cổ cao", price: 50_000, qty: 50 },
] as const
export const CUSTOMERS = ["c-1", "c-2", "c-3", "c-4", "c-5", "c-6", "c-7"] as const
export const WALLET = 5_000_000
export const VOUCHERS = [
    { code: "GIAM10", percent: 10 },
    { code: "GIAM20", percent: 20 },
] as const
/** The earlier order SEED_VOUCHER_USED hangs a redemption on. */
export const OLD_ORDER = { id: "ord-cu", customerId: "c-6" } as const

/** Deletes every order and puts products, stock, wallets and vouchers back to the sample data, in one transaction. */
export const reseed = async (client: ClientBase): Promise<void> => {
    await client.query("BEGIN")
    try {
        await client.query("TRUNCATE voucher_redemptions, order_items, orders, stock, wallets, vouchers, products")
        for (const product of PRODUCTS) {
            await client.query("INSERT INTO products (id, name, price) VALUES ($1, $2, $3)", [product.id, product.name, product.price])
            await client.query("INSERT INTO stock (product_id, qty) VALUES ($1, $2)", [product.id, product.qty])
        }
        for (const customer of CUSTOMERS) await client.query("INSERT INTO wallets (customer_id, balance) VALUES ($1, $2)", [customer, WALLET])
        for (const voucher of VOUCHERS) await client.query("INSERT INTO vouchers (code, percent) VALUES ($1, $2)", [voucher.code, voucher.percent])
        await client.query("COMMIT")
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    }
}

/** Loads the sample data only when the database holds no product yet. */
export const seedIfEmpty = async (client: ClientBase): Promise<boolean> => {
    const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM products")
    if ((rows[0]?.n ?? 0) > 0) return false
    await reseed(client)
    return true
}

const pairOf = (value: string, key: string): [string, number] => {
    const [name, amount] = value.split("=").map((part) => part.trim())
    const number = Number(amount)
    if (name === undefined || name === "" || !Number.isSafeInteger(number) || number < 0) throw new Error(`${key} must read "<id>=<n>", got "${value}"`)
    return [name, number]
}

/** The data switches of the test hooks: SEED_STOCK, SEED_BALANCE and SEED_VOUCHER_USED set the data a scenario starts from. */
export const applySeeds = async (client: ClientBase, patch: Readonly<Record<string, unknown>>): Promise<void> => {
    if (typeof patch.SEED_STOCK === "string") {
        const [productId, qty] = pairOf(patch.SEED_STOCK, "SEED_STOCK")
        await client.query("UPDATE stock SET qty = $2 WHERE product_id = $1", [productId, qty])
    }
    if (typeof patch.SEED_BALANCE === "string") {
        const [customerId, balance] = pairOf(patch.SEED_BALANCE, "SEED_BALANCE")
        await client.query("UPDATE wallets SET balance = $2 WHERE customer_id = $1", [customerId, balance])
    }
    if (typeof patch.SEED_VOUCHER_USED === "string") {
        await client.query("INSERT INTO orders (id, customer_id, subtotal) VALUES ($1, $2, 0) ON CONFLICT (id) DO NOTHING", [OLD_ORDER.id, OLD_ORDER.customerId])
        await client.query("INSERT INTO voucher_redemptions (order_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING", [OLD_ORDER.id, patch.SEED_VOUCHER_USED])
    }
}
