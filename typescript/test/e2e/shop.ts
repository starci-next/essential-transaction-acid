// Công cụ chung của các spec: cùng bộ ca của lab Transaction (ACID), chạy trên shop NestJS này. Gọi shop qua HTTP, đọc thẳng
// Postgres bằng kết nối riêng (không qua shop), bật tắt sự cố qua các đường dẫn /lab/* (chỉ có khi TEST_HOOKS=on).
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { Pool } from "pg"

/** Giá và kho ban đầu (src/seed.ts). Mỗi ví bắt đầu với 5.000.000đ. */
export const PRICE = { "giay-chay-bo": 1_200_000, "giay-da": 900_000, "dep-quai-ngang": 150_000, "tat-co-cao": 50_000 } as const
export type ProductId = keyof typeof PRICE
export const PRODUCT_IDS = Object.keys(PRICE) as Array<ProductId>
export const STOCK: Record<ProductId, number> = { "giay-chay-bo": 10, "giay-da": 10, "dep-quai-ngang": 20, "tat-co-cao": 50 }
export const WALLET = 5_000_000

export interface Line {
    productId: string
    qty: number
}

export interface CheckoutBody {
    orderId?: string
    customerId: string
    lines: Array<Line>
    voucher?: string
}

/** Địa chỉ của shop: SHOP_URL nếu có, rồi tới SHOP_PORT (cùng biến docker compose dùng), rồi cổng mặc định 4310. */
export const SHOP_URL = process.env.SHOP_URL ?? `http://localhost:${process.env.SHOP_PORT ?? "4310"}`

export interface Reply<T = Record<string, unknown>> {
    /** Mã HTTP, hoặc 0 khi không có câu trả lời (kết nối bị cắt, ví dụ shop vừa chết). */
    status: number
    body: T
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Một lần gọi HTTP, không thử lại: phần kiểm thử muốn thấy đúng điều đã xảy ra. */
export const call = async <T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<Reply<T>> => {
    try {
        const response = await fetch(`${SHOP_URL}${path}`, {
            method,
            headers: body === undefined ? {} : { "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        })
        const text = await response.text()
        let parsed: unknown = text
        try {
            parsed = text === "" ? null : JSON.parse(text)
        } catch {
            // Thân không phải JSON: giữ nguyên chuỗi.
        }
        return { status: response.status, body: parsed as T }
    } catch (error) {
        return { status: 0, body: { error: String(error) } as T }
    }
}

export const bootId = async (): Promise<string | null> => {
    const reply = await call<{ bootId?: string }>("GET", "/health")
    return reply.status === 200 ? (reply.body.bootId ?? null) : null
}

/** Chờ shop trả lời `/health`; có `before` thì chờ tới khi đó là một lần khởi động mới (bootId khác). */
export const waitForShop = async (before: string | null = null, timeoutMs = 90_000): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
        const now = await bootId()
        if (now !== null && now !== before) return
        if (Date.now() > deadline)
            throw new Error(before === null ? "shop không trả lời /health. Shop đã chạy chưa? Chạy npm run up" : "shop không khởi động lại. Xem: docker compose logs shop")
        await sleep(250)
    }
}

/** Về dữ liệu mẫu (không đơn nào, kho và ví như ban đầu), mọi công tắc sự cố tắt. */
export const resetLab = async (): Promise<void> => {
    await waitForShop()
    const reply = await call("POST", "/lab/reset")
    if (reply.status !== 200) throw new Error(`/lab/reset trả ${reply.status}: ${JSON.stringify(reply.body)}`)
}

/** Bật (hoặc tắt, với giá trị "off") công tắc sự cố, như StarCi Relay làm. */
export const setChaos = async (patch: Record<string, string>): Promise<void> => {
    const reply = await call("PUT", "/lab/chaos", patch)
    if (reply.status !== 200) throw new Error(`/lab/chaos trả ${reply.status}: ${JSON.stringify(reply.body)}`)
}

/** Khách bấm "Đặt hàng". */
export const checkout = (body: CheckoutBody): Promise<Reply> => call("POST", "/checkout", body)

/** Tiền một đơn trước giảm giá. */
export const subtotalOf = (lines: Array<Line>): number =>
    lines.reduce((sum, line) => sum + (PRICE[line.productId as ProductId] ?? 0) * line.qty, 0)

// Đọc thẳng cơ sở dữ liệu `shop` (chỉ đọc), bằng kết nối riêng của phần kiểm thử. Mặc định là Postgres của docker compose ở cổng 5476.
let pool: Pool | null = null
const PG_URL = process.env.LAB_PG_URL ?? `postgres://shop:shop@localhost:${process.env.PG_PORT ?? "5476"}/shop`

export const read = async <T extends object>(sql: string, params: Array<unknown> = []): Promise<Array<T>> => {
    pool ??= new Pool({ connectionString: PG_URL, max: 2, application_name: "shop-test" })
    return (await pool.query<T>(sql, params)).rows
}

export const closeDb = async (): Promise<void> => {
    await pool?.end()
    pool = null
}

/** Ảnh chụp sổ sách của shop: đơn, dòng hàng, lượt dùng mã, ví và kho. */
export interface Books {
    orders: Array<{ id: string; customer_id: string; subtotal: number; discount: number }>
    items: Array<{ order_id: string; product_id: string; qty: number; unit_price: number }>
    redemptions: Array<{ order_id: string; code: string }>
    wallets: Record<string, number>
    stock: Record<string, number>
}

export const books = async (): Promise<Books> => {
    const orders = await read<Books["orders"][number]>("SELECT id, customer_id, subtotal::int AS subtotal, discount::int AS discount FROM orders ORDER BY id")
    const items = await read<Books["items"][number]>("SELECT order_id, product_id, qty, unit_price::int AS unit_price FROM order_items ORDER BY order_id, product_id")
    const redemptions = await read<Books["redemptions"][number]>("SELECT order_id, code FROM voucher_redemptions ORDER BY order_id")
    const wallets = await read<{ customer_id: string; balance: number }>("SELECT customer_id, balance::int AS balance FROM wallets")
    const stock = await read<{ product_id: string; qty: number }>("SELECT product_id, qty FROM stock")
    return {
        orders,
        items,
        redemptions,
        wallets: Object.fromEntries(wallets.map((row) => [row.customer_id, row.balance])),
        stock: Object.fromEntries(stock.map((row) => [row.product_id, row.qty])),
    }
}

/** Các khối ghi shop đã mở mà chưa kết thúc: kết nối của shop đang rảnh nhưng vẫn kẹt giữa một khối ghi. */
export const unfinishedBlocks = async (): Promise<number> => {
    const [row] = await read<{ n: number }>(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'shop' AND state LIKE 'idle in transaction%'",
    )
    return row?.n ?? 0
}

const ROOT = join(__dirname, "..", "..")

const compose = (...args: Array<string>): void => {
    const result = spawnSync("docker", ["compose", ...args], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32" })
    if (result.status !== 0) throw new Error(`docker compose ${args.join(" ")} hỏng: ${result.stderr}`)
}

/**
 * Tắt phụt cả shop lẫn Postgres (như rút điện: không cho kịp dọn dẹp), rồi bật lại và chờ cả hai trả lời. Dữ liệu Postgres
 * đã báo ghi xong thì phải còn sau lần bật lại này.
 */
export const pullThePlug = async (): Promise<void> => {
    await closeDb()
    const before = await bootId()
    compose("kill", "shop", "postgres")
    compose("up", "-d", "--wait", "postgres", "shop")
    await waitForShop(before)
}

/** Ném lỗi `[invariant:<id>] <gợi ý>`: dòng StarCi hiện dưới một ca đỏ. */
export const holds = (condition: boolean, invariant: string, hint: string): void => {
    if (!condition) throw new Error(`[invariant:${invariant}] ${hint}`)
}

/**
 * Mỗi điều phải đúng của một ca là một bài kiểm thử riêng, tên mang hai nhãn `[case:<id>] [invariant:<id>]`: StarCi Relay đọc
 * từ báo cáo JUnit ca nào đỏ và vì điều gì.
 */
export const check = (caseId: string, invariant: string, title: string, body: () => void): void => {
    test(`[case:${caseId}] [invariant:${invariant}] ${title}`, body)
}

export const vnd = (amount: number): string => `${amount.toLocaleString("vi-VN")}đ`

export const show = (reply: Reply<unknown>): string => (reply.status === 0 ? "không có câu trả lời" : `${reply.status} ${JSON.stringify(reply.body)}`)

/** Sổ sách giống hệt trước: không đơn mới, không dòng hàng mới, không lượt dùng mã mới, ví và kho không đổi. */
export const sameBooks = (before: Books, after: Books): boolean => JSON.stringify(before) === JSON.stringify(after)
