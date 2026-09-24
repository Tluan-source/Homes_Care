# Chạy app

## Viết code ở đâu — VS Code

**VS Code là chỗ hợp nhất cho dự án này**, không phải Android Studio. Lý do đơn giản:
99% code bạn viết là TypeScript, và Android Studio không mạnh ở TypeScript.

Mở thư mục gốc `product/` bằng VS Code (mở **thư mục gốc**, không phải `apps/mobile` —
đây là monorepo, mở sai chỗ thì không nhảy sang được `packages/core`).

Sẵn cấu hình trong `.vscode/`:

| File | Làm gì |
|---|---|
| `extensions.json` | VS Code sẽ gợi ý cài **Expo Tools**, ESLint, Prettier |
| `settings.json` | Dùng TypeScript của dự án (không phải bản của VS Code), ẩn `node_modules`, `dist`, `android` khỏi cây thư mục và khỏi ô tìm kiếm |
| `tasks.json` | `Ctrl+Shift+B` chạy typecheck, `Ctrl+Shift+P → Run Task` chạy app hoặc test |
| `launch.json` | Gỡ lỗi test lõi bằng nút ▶ |

Chạy app thì mở terminal ngay trong VS Code (`Ctrl+\``) rồi `npm start`.

> **Chỉ mở Android Studio khi cần máy ảo hoặc gỡ lỗi native.** Hai cái dùng song song
> được: Android Studio bật emulator, VS Code viết code.

---

## Cần có sẵn

- **Node 20+**
- **Android Studio** — chỉ cần cho máy ảo (emulator) và SDK. Nếu chạy bằng điện thoại
  thật qua Expo Go thì **không cần Android Studio**.
- **JDK 17** (Android Studio cài kèm)

## Cách nhanh nhất — điện thoại thật, không cần Android Studio

```bash
npm install
npm start
```

Cài **Expo Go** từ CH Play, quét mã QR hiện trên terminal. Xong.

Đây là cách tôi khuyên dùng lúc phát triển: sửa code là màn hình tự nạp lại trong
2–3 giây, không phải build lại.

## Chạy trên máy ảo Android Studio

1. Mở Android Studio → **More Actions → Virtual Device Manager** → tạo một máy ảo
   (Pixel 7, API 34 trở lên) → bấm ▶ cho nó chạy.
2. Rồi:

```bash
npm run android
```

Expo tự nhận máy ảo đang chạy và cài app vào đó.

## Mở project TRONG Android Studio

```bash
npm run prebuild
```

Sinh ra `apps/mobile/android/` — mở thư mục đó bằng Android Studio như một project
Gradle bình thường. Cần **JDK 17+** (Android Studio cài kèm) vì bản Gradle là 9.x.

**Thư mục `android/` được gitignore.** Nó là file SINH RA, không phải mã nguồn: Expo
dựng lại từ `app.json` và các plugin bất cứ lúc nào. Đưa vào git thì mỗi lần nâng cấp
Expo phải giải xung đột trong hàng trăm file Gradle/Java do máy sinh — việc đó không
ai muốn làm và cũng không cần làm.

Chỉ đưa `android/` vào git khi bạn buộc phải sửa tay file native nào đó mà không có
Expo plugin tương ứng. Lúc đó bỏ dòng `apps/mobile/android/` khỏi `.gitignore` và
chấp nhận tự bảo trì nó từ đó về sau.

Việc thường ngày — viết màn hình, sửa giao diện, gọi API — **không cần mở Android
Studio chút nào**.

## Lệnh hay dùng

| Lệnh | Làm gì |
|---|---|
| `npm start` | Chạy Metro, quét QR bằng Expo Go |
| `npm run android` | Cài vào máy ảo/điện thoại đang cắm |
| `npm test` | 39 test lõi nghiệp vụ |
| `npm run typecheck` | Kiểm kiểu cả lõi lẫn app (tự dựng lõi trước) |
| `npm run lint` | ESLint — chặn core import React/Supabase, chặn core đọc đồng hồ, chặn import sâu |
| `npm run check` | Chạy đủ bộ kiểm như CI: lint + typecheck + test + quét khoá |
| `npm run db:test` | 87 test phân quyền — **chỉ chạy được với database cục bộ** |
| `npm run build` | Dựng `@homescare/core` |

## Lỗi hay gặp

**`Unable to resolve @homescare/core`** / **`Cannot find module '@homescare/core'`**
→ Chưa dựng lõi. Chạy `npm run build`. `npm install`, `npm start` và `npm run typecheck`
đều đã tự dựng, nhưng nếu bạn gọi thẳng `npx expo start` hay `npx tsc` thì phải tự dựng trước.
Kèm theo lỗi này thường là một loạt lỗi `implicitly has an 'any' type` — chúng là hệ quả,
dựng lõi xong là hết.

**`None of these files exist: packages/core/src/types.js`**
→ Có ai đó thêm `paths` trỏ vào `packages/core/src` trong `apps/mobile/tsconfig.json`.
Expo Metro **có đọc** tsconfig paths, nên nó lấy mã nguồn TypeScript thay vì bản đã dựng;
mã nguồn dùng đuôi `.js` trong import (yêu cầu của NodeNext) mà file thật là `.ts`.
Bỏ `paths` đi, để cả TypeScript lẫn Metro cùng đi qua `node_modules` → `dist`.

**`Cannot find module react-native/rn-get-polyfills`**
→ Phiên bản React Native không khớp Expo SDK. SDK 57 đi với **RN 0.86.3 / React 19.2.3**,
không phải bản mới nhất trên npm. Đừng tự nâng RN — chạy `npx expo install --check`
để Expo tự chọn bản đúng.

**`'View' cannot be used as a JSX component`**
→ Có hai bản `@types/react` trong cây thư mục. Chỉ giữ **một** bản, khai ở
`package.json` gốc. Hai bản cùng tồn tại thì TypeScript chọn bản nào là hên xui theo
thứ tự cài, và lỗi kiểu sẽ xuất hiện rồi biến mất không lý do.

## Đang có gì trong app

Một màn: **danh sách căn hộ**, dữ liệu giả trong `src/data/demo.ts`, tìm được theo
mã căn / tên / số điện thoại, lọc "Việc cần làm".

Mọi con số (nợ, trạng thái, tiền phạt) đều do `@homescare/core` tính — màn hình chỉ vẽ.
Chưa nối Supabase; khi nối thì thay `src/data/demo.ts` bằng lớp gọi API, **màn hình
không phải sửa**.
