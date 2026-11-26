# Shop giày · TypeScript (NestJS)

Một service NestJS (`shop`) và một Postgres. Mỗi đơn ghi năm chỗ trong một giao dịch: đơn, các dòng hàng, lượt dùng mã giảm
giá, ví, kho.

## Chạy

Cần Node 22 trở lên và Docker.

```bash
npm ci
npm run up          # Postgres, rồi migrate + seed, rồi shop (docker compose)
npm test            # test đơn vị: không cần Docker
npm run test:e2e    # các tình huống của lab và bảng 12 ô, chạy qua HTTP trên shop đang chạy
npm run down        # tắt và xoá dữ liệu
```

Cổng mặc định: shop 4310, Postgres 5476. Máy đã bận thì đặt `SHOP_PORT` và `PG_PORT` cho cả `npm run up` lẫn `npm run test:e2e`.

```bash
curl -s -X POST localhost:4310/checkout -H 'content-type: application/json' \
  -d '{"customerId":"c-1","lines":[{"productId":"giay-chay-bo","qty":1}],"voucher":"GIAM10"}'
```

## Đi đâu để đọc

| Muốn xem | File |
| --- | --- |
| năm câu ghi, mã giảm giá có mốc riêng, đổi lỗi ràng buộc thành câu trả lời | `src/modules/domain/shop/checkout.service.ts` |
| chỗ duy nhất mở và kết thúc giao dịch, `SAVEPOINT` | `src/platform/database/database.ts` |
| luật của shop: kho và ví không âm, mỗi mã dùng một lần | `db/migrations/0001_shop.sql` |
| một bộ lọc cho mọi lỗi: 422 cho lỗi của khách, 500 cho phần còn lại | `src/platform/errors/errors.filter.ts` |
| các đường dẫn HTTP | `src/features/api/checkout/checkout.controller.ts` |
| tạo bảng và nạp dữ liệu mẫu (không phải việc của shop) | `src/apps/cli/main.ts` |
| công tắc sự cố cho test (chỉ khi `TEST_HOOKS=on`) | `src/platform/faults/faults.service.ts`, `src/features/api/lab/lab.controller.ts` |

## Các tình huống

`test/e2e/` là đúng bộ ca của lab, cùng hợp đồng HTTP, cộng bảng chấm 12 ô (bốn bước `order`, `items`, `wallet`, `stock` nhân
ba kiểu lỗi: lỗi của cơ sở dữ liệu, sập process, câu ghi phạm luật).

| Ca | Chuyện gì xảy ra | Shop này làm gì |
| --- | --- | --- |
| `mot-doi-giay` | mua một đôi, mọi thứ êm | năm câu ghi, `COMMIT`, trả 201 |
| `ba-dong-roi-tat-may` | đơn ba dòng, rồi shop và Postgres bị tắt phụt | không làm gì thêm: Postgres chỉ trả lời `COMMIT` khi đã ghi xuống đĩa |
| `het-hang-giua-chung` | câu trừ kho bị từ chối sau bốn câu kia | cả khối `ROLLBACK`, không còn dòng nào |
| `don-loi-keo-don-sau` | năm đơn bình thường sau một đơn lỗi | kết nối chỉ được trả sau `COMMIT` hoặc `ROLLBACK`; `ROLLBACK` cũng hỏng thì huỷ luôn kết nối |
| `het-hang-noi-ro` | hết hàng, ví không đủ, ổ đĩa trục trặc | 422 `OUT_OF_STOCK` kèm mã sản phẩm, 422 `INSUFFICIENT_FUNDS`, 500 |
| `ma-giam-gia-da-dung` | mã đã có đơn khác dùng | `ROLLBACK TO SAVEPOINT voucher`, đơn đi tiếp với giá gốc |
