// U3 · Hết hàng thì nói rõ: ba lần đặt hàng bị từ chối, mỗi lần một lý do.
//   1. kho chỉ còn 2 đôi giày chạy bộ, khách c-1 đặt 3 đôi
//   2. ví khách c-7 chỉ còn 100.000đ, khách đặt một đôi giày da
//   3. câu trừ ví hỏng vì một lỗi của cơ sở dữ liệu không phạm luật nào (FAIL_AT=wallet), khách c-2 đặt một đôi tất
// Mỗi lần, phần kiểm thử bật đúng sự cố của lần đó.
import { books, check, checkout, closeDb, holds, resetLab, sameBooks, setChaos, show, type Books, type Reply } from "./shop"

const CASE = "het-hang-noi-ro"
let outOfStock: Reply
let lowBalance: Reply
let fault: Reply
const unchanged: Array<boolean> = []
beforeAll(async () => {
    await resetLab()

    await setChaos({ SEED_STOCK: "giay-chay-bo=2" })
    let before: Books = await books()
    outOfStock = await checkout({ customerId: "c-1", lines: [{ productId: "giay-chay-bo", qty: 3 }] })
    unchanged.push(sameBooks(before, await books()))

    await setChaos({ SEED_BALANCE: "c-7=100000" })
    before = await books()
    lowBalance = await checkout({ customerId: "c-7", lines: [{ productId: "giay-da", qty: 1 }] })
    unchanged.push(sameBooks(before, await books()))

    await setChaos({ FAIL_AT: "wallet" })
    before = await books()
    fault = await checkout({ customerId: "c-2", lines: [{ productId: "tat-co-cao", qty: 1 }] })
    unchanged.push(sameBooks(before, await books()))
})
afterAll(closeDb)

check(CASE, "out-of-stock-says-why", "đặt quá số còn lại thì nhận 422 OUT_OF_STOCK kèm mã sản phẩm", () => {
    holds(
        outOfStock.status === 422 && outOfStock.body.error === "OUT_OF_STOCK" && outOfStock.body.productId === "giay-chay-bo",
        "out-of-stock-says-why",
        `đặt 3 đôi khi kho còn 2 trả ${show(outOfStock)}, cần 422 {"error":"OUT_OF_STOCK","productId":"giay-chay-bo"}`,
    )
})

check(CASE, "low-balance-says-why", "ví không đủ tiền thì nhận 422 INSUFFICIENT_FUNDS", () => {
    holds(
        lowBalance.status === 422 && lowBalance.body.error === "INSUFFICIENT_FUNDS",
        "low-balance-says-why",
        `ví còn 100.000đ mà đặt đôi 900.000đ trả ${show(lowBalance)}, cần 422 {"error":"INSUFFICIENT_FUNDS"}`,
    )
})

check(CASE, "fault-stays-500", "lỗi của cơ sở dữ liệu không phạm luật nào vẫn trả 500", () => {
    holds(fault.status === 500, "fault-stays-500", `câu trừ ví hỏng vì ổ đĩa trả ${show(fault)}, cần 500: đây không phải lỗi của khách`)
})

check(CASE, "refused-writes-nothing", "cả ba lần không thành đều không ghi gì", () => {
    const names = ["hết hàng", "ví không đủ", "lỗi ổ đĩa"]
    const wrote = names.filter((_, index) => unchanged[index] !== true)
    holds(wrote.length === 0, "refused-writes-nothing", `sổ sách đổi sau lần: ${wrote.join(", ")}; một lần không thành thì không được ghi gì`)
})
