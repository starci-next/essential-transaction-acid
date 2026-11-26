# essential-transaction-acid

Bản tham chiếu của bài Transaction (ACID) trong Essentials của StarCi Next.

Trong bài, bạn sửa một file `checkout.ts` của shop giày cho tới khi mọi tình huống xanh: đơn lỗi giữa chừng không để lại dòng
nào, một đơn lỗi không kéo các đơn sau, khách bị từ chối thì biết vì sao, mã giảm giá hỏng thì đơn vẫn đi tiếp. Repo này là
cùng shop đó (một service, một Postgres, năm câu ghi cho mỗi đơn), viết theo cách một đội làm sản phẩm thật sẽ viết: chia thư
mục theo trách nhiệm, chỉ một chỗ mở giao dịch, luật nằm trong ràng buộc của bảng, và bộ test chạy qua HTTP cho từng tình huống.

Repo đứng một mình: chỉ cần Node.js, npm và Docker. Không cần StarCi CLI hay bất kỳ công cụ riêng nào.

## Mỗi ngôn ngữ một thư mục

| Thư mục | Ngôn ngữ | Trạng thái |
| --- | --- | --- |
| [`typescript/`](typescript/) | TypeScript, NestJS, Postgres | có |
| `go/` | Go | sẽ có sau |
| `rust/` | Rust | sẽ có sau |

Mỗi thư mục là một dự án trọn vẹn, chạy độc lập, cùng một shop và cùng các tình huống.

## Lấy về cạnh lab của bạn

Nếu bạn đang học bằng StarCi Relay:

```bash
starci-relay ref transaction-acid --lang typescript
```

Lệnh này tải đúng thư mục `typescript/` ở commit mà trang Nộp bài ghim, đặt cạnh thư mục lab của bạn. Không cần đăng nhập, vì
repo này công khai.

Hoặc tự clone:

```bash
git clone https://github.com/starci-next/essential-transaction-acid.git
cd essential-transaction-acid/typescript
```

## Khác gì file của bạn

Ý tưởng giống hệt: năm câu ghi trên một kết nối, giữa `BEGIN` và `COMMIT`; lỗi thì `ROLLBACK` rồi mới trả kết nối; đọc lỗi
của ràng buộc thành câu trả lời cho khách; mã giảm giá có mốc `SAVEPOINT` riêng. Khác ở chỗ đặt:

- Trong lab, `checkout.ts` tự gọi `BEGIN`, `COMMIT`, `ROLLBACK`. Ở đây chỉ `Database.transaction` trong
  `src/platform/database/database.ts` làm việc đó, một lần cho cả ứng dụng; dịch vụ đặt hàng chỉ nhận một `Tx` và ghi qua nó.
  `Tx.savepoint` là chỗ duy nhất viết `SAVEPOINT`.
- Lỗi khách hiểu được là một mã cố định (`OUT_OF_STOCK`, `INSUFFICIENT_FUNDS`) của `ShopError`; một bộ lọc duy nhất đổi nó thành
  422, còn lỗi khác thành 500 mà không lộ câu SQL.
- Bảng do `npm run migrate` tạo, dữ liệu mẫu do `npm run seed` nạp, cả hai chạy trước khi shop nhận đơn. Shop không bao giờ tự
  sửa bảng lúc khởi động.

Chi tiết ở [`typescript/README.md`](typescript/README.md).
