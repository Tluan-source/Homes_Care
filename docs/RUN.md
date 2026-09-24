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
| `npm run db:test` | 139 test phân quyền — **chỉ chạy được với database cục bộ** |
| `npm run build` | Dựng `@homescare/core` |

## Lỗi hay gặp

**Quét QR bằng Expo Go báo `Request timed out` / `Could not connect to development server`**
→ Điện thoại không tới được máy tính. Nhìn dòng `exp://<IP>:8081` ngay dưới mã QR, rồi so với
IPv4 của card **Wi-Fi** trong `ipconfig`:

1. **IP khác nhau** (thường là `172.x.x.x`) — Expo chọn nhầm card mạng ảo của Docker / WSL /
   Hyper-V / VPN. Chỉ định đúng IP Wi-Fi:
   `set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.x.x` (cmd) hoặc
   `$env:REACT_NATIVE_PACKAGER_HOSTNAME="192.168.x.x"` (PowerShell), rồi `npm start`.
2. **IP đúng mà vẫn lỗi** — Windows Firewall chặn Node. Settings → Windows Security → Firewall →
   *Allow an app* → `Node.js JavaScript Runtime` → tích **Private**. Và kiểm Wi-Fi đang để
   **Private network** (Public thì Windows chặn mọi kết nối vào).
3. **Điện thoại và máy khác mạng**, Wi-Fi khách, Wi-Fi quán cà phê (chặn thiết bị thấy nhau),
   hoặc điện thoại đang dùng 4G / bật VPN → dùng đường hầm, không cần chung mạng:
   `npm run start:tunnel` (chậm hơn vài giây mỗi lần nạp lại). Đường hầm đi qua ngrok và
   lúc được lúc không (`failed to start tunnel · remote gone away`) — **chạy lại một lần**
   thường là được. Hoặc chạy thẳng trong `apps/mobile`:
   `npm run build --prefix ../..` rồi `npx expo start --tunnel`
   (`npx` gọi thẳng thì KHÔNG tự dựng lõi — sửa gì trong `packages/core` thì phải build lại
   trước, nếu không app chạy bản lõi cũ). Vẫn không được thì dùng cách 4.
4. **Chắc ăn nhất với Android: cáp USB.** Bật *Gỡ lỗi USB* trên điện thoại, cắm cáp, rồi:
   `adb reverse tcp:8081 tcp:8081` → `npx expo start --localhost` (trong `apps/mobile`) →
   trong Expo Go nhập tay `exp://127.0.0.1:8081`. Không phụ thuộc Wi-Fi, firewall hay ngrok.
   (`adb` nằm ở `%LOCALAPPDATA%\Android\Sdk\platform-tools`.)

**Thử nhanh xem điện thoại có tới được máy không:** mở trình duyệt trên điện thoại, vào
`http://<IP>:8081/status`. Hiện `packager-status:running` là mạng thông (lỗi nằm ở Expo Go);
xoay mãi rồi hết giờ là mạng/firewall chặn (làm cách 2, 3 hoặc 4).


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

## Nối app vào Supabase

App đọc dữ liệu thật từ Supabase — cần project **staging** đã dựng (`docs/DEPLOY.md` §2–§7b).

1. Chép `apps/mobile/.env.example` thành `apps/mobile/.env`, điền 2 dòng (Dashboard →
   Project Settings → API):
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
   ```
   Chỉ hai giá trị này. **Không bao giờ** đặt khoá quản trị hay khoá SePay vào `.env` của app.
2. Tắt Metro (Ctrl+C) rồi chạy lại `npm start` / `npm run start:tunnel` — biến `EXPO_PUBLIC_*`
   chỉ được đọc lúc khởi động.
3. Đăng nhập bằng tài khoản chủ nhà tạo ở DEPLOY §7.

Chưa có `.env` thì app hiện màn **"Chưa cấu hình"** thay vì sập.

## Đang có gì trong app

Dựng theo bản demo (`HomesCare-demo.html`), chạy trên dữ liệu thật:

| Màn | Có gì |
|---|---|
| Đăng nhập | email + mật khẩu · quên mật khẩu · đặt mật khẩu từ link mời · màn "đã bị khoá" |
| **Căn hộ** | khu → tòa → gập theo tòa · thẻ số liệu · Tất cả / Việc cần làm · lọc hai trục + sắp xếp · tìm theo mã / tên / SĐT (không dấu vẫn ra) |
| Chi tiết căn | 5 tab: Tổng quan · Phòng & người ở (bấm "i" xem CCCD) · Hợp đồng · Thu chi (lịch kỳ, phiếu đang mở, nhật ký xử lý) · Ghi chú |
| Yêu cầu thanh toán | bước 1 soát khoản + phạt → bước 2 QR VietQR · **Gửi qua Zalo** · sao chép từng dòng · lịch nhắc |
| Tiền mặt | ghi nhận tay vào một kỳ, lưu tên người ghi |
| **Cần xử lý** | Chưa gửi QR · Đã tới hạn (theo tòa) · Ngoại lệ SePay (ghép vào phiếu / đã xử lý ngoài) · Sắp tới hạn |
| **Sổ quỹ** | đã vào sổ tháng này (SePay / ghi tay) · còn phải thu · phiếu thu · ghi nhận tay |
| Tài khoản | hộp thư nhắc hạn · (chủ nhà) mời / khoá / mở khoá quản lý · đăng xuất |

Mọi con số tiền và trạng thái do `@homescare/core` tính từ dữ liệu database; số tiền trên
phiếu thanh toán do **server** tính (Edge Function `create-payment-request`).
