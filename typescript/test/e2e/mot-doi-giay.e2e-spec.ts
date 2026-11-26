// H1 · Một đôi giày, đủ hàng đủ tiền: khách c-1 mua một đôi giày chạy bộ, không có sự cố nào.
import { PRICE, STOCK, WALLET, books, check, checkout, closeDb, holds, resetLab, show, vnd, type Books, type Reply } from "./shop"

const CASE = "mot-doi-giay"
let reply: Reply
let now: Books
beforeAll(async () => {
    await resetLab()
    reply = await checkout({ customerId: "c-1", lines: [{ productId: "giay-chay-bo", qty: 1 }] })
    now = await books()
})
afterAll(closeDb)

check(CASE, "order-saved", "đơn trả 201, có đúng một đơn với một dòng hàng", () => {
    holds(reply.status === 201, "order-saved", `đặt hàng trả ${show(reply)}, cần 201`)
    holds(now.orders.length === 1 && now.items.length === 1, "order-saved", `có ${now.orders.length} đơn và ${now.items.length} dòng hàng, cần 1 và 1`)
})

check(CASE, "wallet-charged", "ví khách giảm đúng bằng tiền đơn", () => {
    const want = WALLET - PRICE["giay-chay-bo"]
    holds(now.wallets["c-1"] === want, "wallet-charged", `ví c-1 còn ${vnd(now.wallets["c-1"] ?? NaN)}, cần ${vnd(want)}`)
})

check(CASE, "stock-taken", "kho giảm đúng số đôi đã bán", () => {
    const want = STOCK["giay-chay-bo"] - 1
    holds(now.stock["giay-chay-bo"] === want, "stock-taken", `kho giày chạy bộ còn ${now.stock["giay-chay-bo"]} đôi, cần ${want}`)
})
