# HomesCare

Quản lý căn hộ cho thuê — nhiều khu, nhiều tòa, nhiều chủ nhà.

## Bắt đầu

```bash
npm install
npm test               # 39 test lõi nghiệp vụ
npm start              # chạy app, quét QR bằng Expo Go
```

Chi tiết cách chạy trên máy ảo Android Studio: **`docs/RUN.md`**

## Đọc theo thứ tự này

1. **`docs/ARCHITECTURE.md`** — mục tiêu, giao diện, lập trình, kiểm thử, bảo trì
2. **`docs/RUN.md`** — cách chạy, và các lỗi hay gặp
3. **`docs/SECURITY.md`** — đã làm gì, chưa làm gì, ai chịu trách nhiệm
4. **`docs/CONVENTIONS.md`** — quy ước viết code, đọc hết trong 5 phút
5. **`packages/core/src/penalty/policy.ts`** — mọi con số nghiệp vụ về trễ hạn
6. **`packages/core/tests/core.test.ts`** — đọc test là hiểu nghiệp vụ nhanh nhất

## Cấu trúc

| Thư mục | Là gì |
|---|---|
| `packages/core` | Nghiệp vụ THUẦN — dùng chung app và server. Tài sản giá trị nhất |
| `supabase/migrations` | Schema, ràng buộc, RLS. Phân quyền nằm ở đây, không ở app |
| `supabase/functions` | Webhook nhận tiền, lịch nhắc. Chạy phía server |
| `apps/mobile` | React Native + Expo |
| `docs` | Tài liệu |

## Muốn đổi một thứ nhỏ thì sửa ở đâu

| Đổi | File |
|---|---|
| Mức phạt, ân hạn, trần, mốc thanh lý, hoàn cọc | `packages/core/src/penalty/policy.ts` |
| Mốc nhắc D-3 / D0 / D+1 / D+3 | `packages/core/src/payment/reminders.ts` |
| Cách tính giá thuê lẻ | `packages/core/src/pricing/pricing.ts` |
| Ngày neo kỳ thu | `packages/core/src/billing/schedule.ts` |
| Ngân hàng hỗ trợ VietQR | `packages/core/src/payment/vietqr.ts` |
| Màu, khoảng cách, cỡ chữ | `apps/mobile/src/theme/tokens.ts` |
| Trạng thái nào màu gì | `apps/mobile/src/theme/statusStyle.ts` |
| Ai được thấy dữ liệu gì | `supabase/migrations/0003_rls.sql` |
| Ai được xem ảnh CCCD, giữ bao lâu | `supabase/migrations/0005_storage.sql` |

## Ranh giới an toàn

`service_role` key và khoá webhook SePay **chỉ tồn tại trong Edge Function**.
Không bao giờ trong mã React Native — bản build giải nén ra là đọc được.
