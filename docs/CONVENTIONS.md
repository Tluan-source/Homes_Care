# Quy ước viết code

Ngắn, để đọc hết trong 5 phút. Chi tiết kiến trúc ở `ARCHITECTURE.md`.

## Đặt tên

- **Tên hàm, biến, file: tiếng Anh.** Chú thích: **tiếng Việt**. Người bảo trì đọc
  tiếng Việt nhanh hơn, nhưng tên tiếng Anh thì công cụ và thư viện mới khớp.
- Hàm trả về boolean bắt đầu bằng `is` / `has` / `can`: `isTerminable`, `canSeeUnit`.
- Hàm tính ra thứ gì đó bắt đầu bằng `compute` / `build` / `make`: `computeMoneyState`.
- Bảng DB số nhiều, cột `snake_case`. Trong TS thì `camelCase`.

## Chú thích

Chú thích giải thích **VÌ SAO**, không giải thích **LÀM GÌ** — code đã nói nó làm gì.

```ts
// ❌ cộng tiền phạt vào tổng
total += penalty;

// ✅ phạt cộng thẳng vào phiếu để số trên QR là số khách phải chuyển; bắt khách tự
//    cộng rồi chuyển lệch một đồng là rơi vào hàng đợi ngoại lệ
total += penalty;
```

**Chỗ nào từng sai thì ghi lại cái sai đó ngay tại chỗ**, để người sau không dựng lại.
Kho code này có nhiều chú thích dạng đó và chúng đáng giá hơn tài liệu rời.

## Tiền

- Luôn là số nguyên VNĐ. Không `float`, không đơn vị nghìn.
- **Hàm nào tính ra một con số tiền thì hàm đó phải có test.** Không thương lượng.
- Nợ gốc và tiền phạt **để riêng**, không cộng sẵn vào một biến — người đọc phiếu
  phải soát lại được.

## Thời gian

- **Không hàm nào trong `core` được gọi `new Date()`.** `today` là tham số.
- DB lưu `timestamptz` (UTC). Hiển thị đổi sang `Asia/Ho_Chi_Minh` ở tầng app.
- Ngày (không giờ) dùng `date` trong DB và `Day` trong TS, luôn ở 00:00 giờ địa phương.

## Import

- Ngoài `packages/core` chỉ import từ `@homescare/core`, **không import sâu** vào
  đường dẫn bên trong. Để sau này sắp xếp lại thư mục mà không làm vỡ bên ngoài.
- `core` **không được** import bất cứ thứ gì từ `apps/` hay `supabase/`.

## Màn hình

- Không tự tính tiền. Hỏi `core`.
- Không tự chọn màu. Hỏi `theme/statusStyle.ts`.
- Không hardcode khoảng cách. Lấy từ `theme/tokens.ts`.
- Mọi thứ bấm được phải có `accessibilityLabel` — và nhân tiện đó cũng là thứ test
  luồng dùng để tìm nút.

## Bí mật

| | |
|---|---|
| Được nhúng vào app | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| **KHÔNG BAO GIỜ** nhúng vào app | `service_role` key, khoá webhook SePay, bất cứ khoá ký nào |

Mã app giải nén ra đọc được. Coi nó là công khai.

## Migration

Một thay đổi = một file mới, đánh số tăng dần. **Không sửa file đã chạy trên production.**
Mỗi file có dòng `-- rollback:` ghi cách quay lui.

## Trước khi mở pull request

```
npm run typecheck     # không lỗi kiểu
npm test              # lõi phải xanh
```
