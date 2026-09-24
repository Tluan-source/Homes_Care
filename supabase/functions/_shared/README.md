# Dùng chung lõi giữa app và Edge Function

Edge Function chạy trên Deno, app chạy trên Node/Hermes. Cả hai dùng CHUNG
`packages/core` — app hiện "phải trả 52 triệu" thì server ghi sổ cũng phải ra 52 triệu.

Cách nối: build `packages/core` rồi copy bản dựng vào `_shared/core.ts` trước khi deploy.

    npm run build -w @homescare/core
    npm run bundle:edge          # gộp dist thành một file core.ts

Không sửa tay `_shared/core.ts` — nó là file sinh ra, và sửa tay là bắt đầu có
hai bộ quy tắc tiền khác nhau, đúng cái bệnh đã phải vá ở prototype v1.8.
