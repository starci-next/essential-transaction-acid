// Bảng chấm ẩn: 12 ô = 4 bước (`order`, `items`, `wallet`, `stock`) × 3 kiểu lỗi (`error`, `crash`, `refuse`).
// Chạy trên StarCi Relay của học viên khi nộp bài; không nằm trong bản học viên nhận. Mỗi ô gây đúng một lỗi ở đúng một bước
// của một đơn có hai dòng hàng và một mã giảm giá, rồi kiểm:
//   - đơn trả 201 thì đơn, dòng hàng, ví và kho đều đã ghi đủ;
//   - đơn không trả 201 thì không để lại gì;
//   - không còn khối ghi nào bỏ dở;
//   - shop vẫn nhận đơn tiếp: một đơn bình thường có mã giảm giá, rồi một đơn dùng lại đúng mã đó (giá gốc), đều trả 201.
// Không ô nào gửi hai đơn cùng lúc.
import {
    PRICE,
    bootId,
    books,
    checkout,
    closeDb,
    holds,
    unfinishedBlocks,
    resetLab,
    sameBooks,
    setChaos,
    show,
    subtotalOf,
    waitForShop,
    type Books,
    type CheckoutBody,
    type Line,
    type Reply,
} from "./shop"

afterAll(closeDb)

type Step = "order" | "items" | "wallet" | "stock"
type Fault = "error" | "crash" | "refuse"

const LINES: Array<Line> = [
    { productId: "giay-chay-bo", qty: 1 },
    { productId: "tat-co-cao", qty: 2 },
]
const ORDER: CheckoutBody = { orderId: "ord-cham", customerId: "c-1", lines: LINES, voucher: "GIAM10" }

/** Đơn của ô, và sự cố bật trước khi gửi nó. `refuse`: đơn phạm đúng luật của bước đó. */
const setup = async (step: Step, fault: Fault): Promise<CheckoutBody> => {
    if (fault === "error") await setChaos({ FAIL_AT: step })
    if (fault === "crash") await setChaos({ CRASH_AT: step })
    if (fault !== "refuse") return ORDER
    switch (step) {
        case "order": {
            // Mã đơn đã có: đặt một đơn bình thường với mã đó trước, rồi gửi lại đúng mã đơn ấy.
            const first = await checkout({ orderId: ORDER.orderId, customerId: "c-5", lines: [{ productId: "dep-quai-ngang", qty: 1 }] })
            holds(first.status === 201, "order-saved", `đơn đầu tiên của ô order-refuse trả ${show(first)}, cần 201`)
            return ORDER
        }
        case "items":
            return { ...ORDER, lines: [...LINES, { productId: "giay-khong-co", qty: 1 }] }
        case "wallet":
            await setChaos({ SEED_BALANCE: "c-1=100000" })
            return ORDER
        case "stock":
            await setChaos({ SEED_STOCK: "giay-chay-bo=0" })
            return ORDER
    }
}

/** Đơn đã trả 201 có đủ trên đĩa: đơn, mọi dòng hàng, ví trừ đúng tiền, kho trừ đúng số. */
const fullyWritten = (body: CheckoutBody, reply: Reply, before: Books, after: Books): string | null => {
    const order = after.orders.find((row) => row.id === body.orderId)
    if (order === undefined) return "không có đơn"
    const items = after.items.filter((row) => row.order_id === body.orderId)
    if (items.length !== body.lines.length) return `${items.length} dòng hàng, cần ${body.lines.length}`
    const total = order.subtotal - order.discount
    if (order.subtotal !== subtotalOf(body.lines)) return `subtotal ${order.subtotal}, cần ${subtotalOf(body.lines)}`
    if (reply.body.total !== total) return `câu trả lời nói total ${String(reply.body.total)}, đơn ghi ${total}`
    if (after.wallets[body.customerId] !== (before.wallets[body.customerId] ?? NaN) - total) return "ví trừ sai tiền"
    for (const line of body.lines)
        if (after.stock[line.productId] !== (before.stock[line.productId] ?? NaN) - line.qty) return `kho ${line.productId} trừ sai`
    return null
}

const CELLS: Array<[Step, Fault]> = (["order", "items", "wallet", "stock"] as const).flatMap((step) =>
    (["error", "crash", "refuse"] as const).map((fault): [Step, Fault] => [step, fault]),
)

test.each(CELLS)("[cell:%s-%s] một lỗi ở một bước, sổ sách vẫn đúng và shop vẫn nhận đơn", async (step, fault) => {
    await resetLab()
    const body = await setup(step, fault)
    const before = await books()
    const boot = await bootId()

    const reply = await checkout(body)
    if (fault === "crash") await waitForShop(boot)
    else await setChaos({ FAIL_AT: "off" })

    const after = await books()
    if (reply.status === 201) {
        const problem = fullyWritten(body, reply, before, after)
        holds(problem === null, "answered-is-saved", `đơn trả 201 nhưng ghi thiếu: ${problem}`)
    } else {
        holds(sameBooks(before, after), "no-half-order", `đơn không thành (${show(reply)}) nhưng sổ sách đã đổi`)
    }
    holds((await unfinishedBlocks()) === 0, "no-unfinished-block", "còn khối ghi bỏ dở sau đơn của ô")

    // Shop vẫn nhận đơn: một đơn có mã GIAM20, rồi một đơn dùng lại GIAM20 (mã đã dùng: giá gốc).
    const next = await checkout({ customerId: "c-2", lines: [{ productId: "tat-co-cao", qty: 1 }], voucher: "GIAM20" })
    holds(next.status === 201, "next-orders-go-through", `đơn bình thường sau ô trả ${show(next)}, cần 201`)
    const again = await checkout({ customerId: "c-4", lines: [{ productId: "tat-co-cao", qty: 1 }], voucher: "GIAM20" })
    holds(again.status === 201 && again.body.total === PRICE["tat-co-cao"], "order-full-price", `đơn dùng lại mã đã dùng trả ${show(again)}, cần 201 giá gốc`)
    holds((await unfinishedBlocks()) === 0, "no-unfinished-block", "còn khối ghi bỏ dở sau hai đơn tiếp theo")
})
