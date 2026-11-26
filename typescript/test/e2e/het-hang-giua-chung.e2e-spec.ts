// U1 · Hết hàng giữa chừng: kho chỉ còn 2 đôi giày chạy bộ, khách c-3 đặt 3 đôi kèm một đôi tất và mã GIAM10. Câu trừ kho
// (câu ghi thứ năm) bị Postgres từ chối, sau khi đơn, dòng hàng, lượt dùng mã và tiền đã ghi.
import { books, check, checkout, closeDb, holds, resetLab, setChaos, show, vnd, type Books, type Reply } from "./shop"

const CASE = "het-hang-giua-chung"
let reply: Reply
let before: Books
let now: Books
beforeAll(async () => {
    await resetLab()
    await setChaos({ SEED_STOCK: "giay-chay-bo=2" })
    before = await books()
    reply = await checkout({
        customerId: "c-3",
        lines: [
            { productId: "giay-chay-bo", qty: 3 },
            { productId: "tat-co-cao", qty: 1 },
        ],
        voucher: "GIAM10",
    })
    now = await books()
})
afterAll(closeDb)

check(CASE, "no-half-order", "đơn lỗi không để lại đơn, dòng hàng hay lượt dùng mã nào", () => {
    holds(
        now.orders.length === 0 && now.items.length === 0 && now.redemptions.length === 0,
        "no-half-order",
        `đặt hàng trả ${show(reply)}, nhưng còn lại ${now.orders.length} đơn, ${now.items.length} dòng hàng, ${now.redemptions.length} lượt dùng mã; cần 0, 0, 0`,
    )
})

check(CASE, "wallet-untouched", "ví khách giữ nguyên số tiền", () => {
    holds(now.wallets["c-3"] === before.wallets["c-3"], "wallet-untouched", `ví c-3 còn ${vnd(now.wallets["c-3"] ?? NaN)}, cần ${vnd(before.wallets["c-3"] ?? NaN)}: tiền đã trừ cho một đơn không thành`)
})

check(CASE, "stock-untouched", "kho giữ nguyên số đôi", () => {
    holds(JSON.stringify(now.stock) === JSON.stringify(before.stock), "stock-untouched", `kho đổi từ ${JSON.stringify(before.stock)} thành ${JSON.stringify(now.stock)}`)
})
