// U4 · Mã giảm giá đã dùng: mã GIAM10 đã có một đơn cũ dùng rồi. Khách c-1 đặt một đôi giày chạy bộ và nhập GIAM10.
import { PRICE, WALLET, books, check, checkout, closeDb, holds, resetLab, setChaos, show, vnd, type Books, type Reply } from "./shop"

const CASE = "ma-giam-gia-da-dung"
const FULL = PRICE["giay-chay-bo"]
let reply: Reply
let now: Books
beforeAll(async () => {
    await resetLab()
    await setChaos({ SEED_VOUCHER_USED: "GIAM10" })
    reply = await checkout({ customerId: "c-1", lines: [{ productId: "giay-chay-bo", qty: 1 }], voucher: "GIAM10" })
    now = await books()
})
afterAll(closeDb)

check(CASE, "order-full-price", "đơn vẫn thành, tính giá gốc, câu trả lời nói mã đã dùng", () => {
    const voucher = reply.body.voucher as { applied?: boolean; reason?: string } | undefined
    holds(
        reply.status === 201 && voucher?.applied === false && voucher.reason === "USED",
        "order-full-price",
        `đặt hàng với mã đã dùng trả ${show(reply)}, cần 201 kèm voucher {"applied":false,"reason":"USED"}`,
    )
    const order = now.orders.find((row) => row.id === reply.body.orderId)
    holds(order !== undefined && order.subtotal === FULL && order.discount === 0, "order-full-price", `đơn trong cơ sở dữ liệu: ${JSON.stringify(order ?? null)}, cần subtotal ${FULL} và discount 0`)
})

check(CASE, "wallet-full-price", "ví khách bị trừ đúng giá gốc", () => {
    holds(now.wallets["c-1"] === WALLET - FULL, "wallet-full-price", `ví c-1 còn ${vnd(now.wallets["c-1"] ?? NaN)}, cần ${vnd(WALLET - FULL)}`)
})

check(CASE, "voucher-used-once", "mã vẫn chỉ có đúng một lượt dùng", () => {
    const uses = now.redemptions.filter((row) => row.code === "GIAM10")
    holds(uses.length === 1, "voucher-used-once", `mã GIAM10 có ${uses.length} lượt dùng, cần đúng 1`)
})
