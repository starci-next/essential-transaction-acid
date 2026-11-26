// U2 · Đơn lỗi kéo đơn sau: một đơn hết hàng giữa chừng (như U1), rồi năm khách khác đặt những đơn bình thường, lần lượt.
// Sau mỗi lần gọi, phần kiểm thử nhìn xem shop có để lại khối ghi nào bỏ dở trong Postgres không.
import { check, checkout, closeDb, holds, unfinishedBlocks, resetLab, setChaos, show, type Reply } from "./shop"

const CASE = "don-loi-keo-don-sau"
const OTHERS = ["c-1", "c-2", "c-4", "c-5", "c-6"]
let replies: Array<Reply> = []
let blocks: Array<number> = []
beforeAll(async () => {
    await resetLab()
    await setChaos({ SEED_STOCK: "giay-chay-bo=2" })
    await checkout({ customerId: "c-3", lines: [{ productId: "giay-chay-bo", qty: 3 }] })
    blocks.push(await unfinishedBlocks())
    for (const customerId of OTHERS) {
        replies.push(await checkout({ customerId, lines: [{ productId: "dep-quai-ngang", qty: 1 }] }))
        blocks.push(await unfinishedBlocks())
    }
})
afterAll(async () => {
    replies = []
    blocks = []
    await closeDb()
})

check(CASE, "next-orders-go-through", "năm đơn bình thường sau một đơn lỗi đều trả 201", () => {
    const failed = replies.map((reply, index) => ({ reply, customer: OTHERS[index] })).filter((item) => item.reply.status !== 201)
    holds(
        failed.length === 0,
        "next-orders-go-through",
        `${failed.length}/5 đơn bình thường không thành: ${failed.map((item) => `${item.customer} ${show(item.reply)}`).join("; ")}`,
    )
})

check(CASE, "no-unfinished-block", "sau mỗi lần gọi, không còn khối ghi nào bỏ dở", () => {
    holds(
        blocks.every((n) => n === 0),
        "no-unfinished-block",
        `số khối ghi bỏ dở sau từng lần gọi: ${blocks.join(", ")}; cần toàn 0 (xem GET /lab/unfinished-blocks)`,
    )
})
