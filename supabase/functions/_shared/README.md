# `_shared/` — mã dùng chung giữa các Edge Function

| File | Viết tay? | Là gì |
|---|---|---|
| `http.ts` | ✅ viết tay | `json`, `safeEqual`, giới hạn body, xác thực cron, "hôm nay" giờ VN |
| `core.ts` + `core/` | ⛔ **SINH RA** | Bản sao `packages/core/src` cho Deno. Gitignore |

## `core.ts` — sinh ra, không sửa tay

App chạy Hermes, Edge Function chạy Deno, nhưng cả hai PHẢI dùng CHUNG một bộ quy tắc
tiền — app hiện "phải trả 52 triệu" thì server ghi sổ cũng phải ra 52 triệu.

    npm run bundle:edge          # chép packages/core/src → _shared/core/, đổi .js → .ts

`npm run functions:check` và `npm run functions:deploy` tự chạy bước này trước. Sửa tay
file sinh ra là bắt đầu có hai bộ quy tắc tiền khác nhau — đúng cái bệnh đã phải vá ở
prototype v1.8.
