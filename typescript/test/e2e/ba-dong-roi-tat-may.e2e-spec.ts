// H2 · Đơn ba dòng, rồi tắt cả service lẫn database: khách c-2 mua ba món; shop trả 201; rồi shop và Postgres bị tắt phụt như
// rút điện và bật lại. Đơn đã trả 201 phải còn nguyên như lúc trả lời.
import { PRICE, STOCK, WALLET, books, check, checkout, closeDb, holds, pullThePlug, resetLab, show, subtotalOf, vnd, type Books, type Line, type Reply } from "./shop"

const CASE = "ba-dong-roi-tat-may"
const LINES: Array<Line> = [
    { productId: "giay-da", qty: 1 },
    { productId: "dep-quai-ngang", qty: 2 },
    { productId: "tat-co-cao", qty: 3 },
]
let reply: Reply
let answered: Books
let after: Books
beforeAll(async () => {
    await resetLab()
    reply = await checkout({ customerId: "c-2", lines: LINES })
    answered = await books()
    await pullThePlug()
    after = await books()
})
afterAll(closeDb)

check(CASE, "order-saved", "đơn trả 201, có đúng một đơn với ba dòng hàng", () => {
    holds(reply.status === 201, "order-saved", `đặt hàng trả ${show(reply)}, cần 201`)
    holds(answered.orders.length === 1 && answered.items.length === 3, "order-saved", `có ${answered.orders.length} đơn và ${answered.items.length} dòng hàng, cần 1 và 3`)
})

check(CASE, "answered-is-saved", "tắt cả shop lẫn Postgres rồi bật lại, đơn đã trả 201 còn nguyên", () => {
    const wallet = WALLET - subtotalOf(LINES)
    holds(after.orders.length === 1 && after.items.length === 3, "answered-is-saved", `sau khi bật lại còn ${after.orders.length} đơn và ${after.items.length} dòng hàng, cần 1 và 3`)
    holds(after.wallets["c-2"] === wallet, "answered-is-saved", `sau khi bật lại ví c-2 còn ${vnd(after.wallets["c-2"] ?? NaN)}, cần ${vnd(wallet)}`)
    for (const line of LINES) {
        const want = STOCK[line.productId as keyof typeof PRICE] - line.qty
        holds(after.stock[line.productId] === want, "answered-is-saved", `sau khi bật lại kho ${line.productId} còn ${after.stock[line.productId]}, cần ${want}`)
    }
    holds(JSON.stringify(after) === JSON.stringify(answered), "answered-is-saved", "sổ sách sau khi bật lại khác lúc shop trả lời")
})
