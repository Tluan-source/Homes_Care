# Dựng backend production — và cách tự kiểm tra từng bước

> Làm trên **STAGING trước**, chạy hết phần kiểm tra, rồi mới lặp lại y hệt trên **PRODUCTION**.
> Mỗi bước có mục **✔ Kiểm tra**: chưa đạt thì dừng lại, đừng làm bước sau.

Các lệnh viết cho **Git Bash** trên Windows (cài kèm Git). PowerShell cũng chạy được phần lớn,
riêng `npm run db:test` và các lệnh `curl` bên dưới thì dùng Git Bash cho khỏi vướng dấu nháy.

---

## 0. Cài công cụ (một lần)

| Công cụ | Cài | Dùng cho |
|---|---|---|
| Supabase CLI | `npm i -g supabase` *(hoặc gọi `npx supabase ...`)* | đẩy migration, deploy function |
| Docker Desktop | docker.com | chạy Supabase trên máy (`npm run db:start`) |
| Deno 2 | `irm https://deno.land/install.ps1 \| iex` (PowerShell) | kiểm kiểu Edge Function |
| psql | cài **PostgreSQL 16** chỉ chọn *Command Line Tools* | `npm run db:test` |

**✔ Kiểm tra:** `supabase --version`, `deno --version`, `psql --version` đều in ra số phiên bản.

---

## 1. Kiểm tra trên máy trước khi đụng tới cloud

```bash
cd product
npm install
npm run check            # lint + typecheck + 39 test lõi + quét khoá
npm run functions:check  # sinh _shared/core.ts rồi deno check 5 Edge Function
npm run db:start         # lần đầu tải image Docker, mất vài phút
npm run db:test          # dựng database từ số 0 + chạy toàn bộ test phân quyền
```

**✔ Kiểm tra:**
- `npm run check` kết thúc bằng `✅ Không thấy khoá bí mật...`
- `functions:check` không in lỗi `TS`.
- `db:test` in dòng `139/139 đạt` rồi `✅ Toàn bộ test phân quyền ĐẠT.` Đọc lướt các dòng
  `ĐẠT` của `60_hardening` và `70_server_jobs` — đó là phần mới của bước này.

Nếu `db:test` báo `HỎNG`, dòng đó ghi rõ test nào và vì sao. Gửi tôi nguyên dòng đó.

---

## 2. Tạo hai project Supabase

supabase.com → **New project**, làm 2 lần:

| | Staging | Production |
|---|---|---|
| Tên | `homescare-staging` | `homescare-prod` |
| Region | **Southeast Asia (Singapore)** | **Southeast Asia (Singapore)** |
| Gói | Free được | **Pro** — cần cho sao lưu hằng ngày + PITR |
| Mật khẩu DB | lưu vào trình quản lý mật khẩu | lưu riêng, **khác** staging |

Ghi lại **Project ref** (chuỗi trong URL `supabase.com/dashboard/project/<ref>`) của từng project.

---

## 3. Đẩy migration

```bash
supabase login
supabase link --project-ref <REF_STAGING>
supabase db push          # đẩy 0001 → 0008
```

**✔ Kiểm tra:**
- Dashboard → **Table Editor**: có `units`, `contracts`, `payment_requests`, `notifications`, `push_tokens`…
  mỗi bảng có nhãn **RLS enabled**.
- Dashboard → **Database → Migrations**: đủ 8 dòng.
- **Không** chạy `seed.sql` lên production.

*(Tuỳ chọn, chỉ STAGING)* chạy luôn bộ test phân quyền trên cloud. Lệnh này **xoá sạch**
dữ liệu staging rồi dựng lại + nạp dữ liệu mẫu:

```bash
ALLOW_REMOTE_DB_RESET=yes \
PGURL='postgresql://postgres.<REF_STAGING>:<MẬT_KHẨU_DB>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres' \
npm run db:test
```
(Chuỗi kết nối đúng lấy ở Dashboard → **Connect** → *Session pooler*.) Chạy trên production
thì script tự từ chối — đó là cố ý.

---

## 4. Cấu hình đăng nhập (Dashboard)

`config.toml` chỉ áp cho bản chạy trên máy. Trên cloud phải bật tay:

**Authentication → Sign In / Providers → Email**
- [ ] Email provider: **bật**
- [ ] **Allow new users to sign up: TẮT** — tài khoản chỉ tạo bằng lời mời của chủ nhà
- [ ] **Confirm email: BẬT**
- [ ] Minimum password length: **10** · Password requirements: **Letters and digits**
- [ ] Secure password change: **bật**

**Authentication → Multi-Factor** → TOTP: **bật**

**Authentication → URL Configuration → Redirect URLs** → thêm `homescare://set-password`

**Project Settings → Authentication → SMTP** → dùng SMTP riêng (Resend, Brevo, Gmail Workspace…).
Email mặc định của Supabase chỉ gửi được vài thư mỗi giờ — mời 3 quản lý là hết.

**✔ Kiểm tra:** Authentication → Users → **Add user** tạo được; thử đăng ký từ ngoài (bước 9,
lệnh `signup`) phải bị từ chối.

---

## 5. Đặt khoá bí mật cho Edge Function

Sinh 2 chuỗi ngẫu nhiên (mỗi lần chạy ra một chuỗi khác):

```bash
openssl rand -hex 32     # → SEPAY_WEBHOOK_SECRET
openssl rand -hex 32     # → CRON_SECRET
```

```bash
supabase secrets set \
  SEPAY_WEBHOOK_SECRET=<chuỗi 1> \
  CRON_SECRET=<chuỗi 2> \
  INVITE_REDIRECT_URL=homescare://set-password
```

`SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` Supabase tự cấp cho function — **không** tự đặt.
Hai chuỗi trên cất vào trình quản lý mật khẩu; **không** dán vào code, Zalo, email.

**✔ Kiểm tra:** `supabase secrets list` có 3 tên trên (giá trị bị ẩn — đúng).

---

## 6. Deploy Edge Function + lịch chạy nền

```bash
npm run functions:deploy
```
Lệnh tự sinh `_shared/core.ts` rồi deploy cả 5 hàm, mỗi hàm theo đúng cấu hình
`verify_jwt` trong `config.toml`.

Rồi mở **SQL Editor**, dán `supabase/cron.sql`, **thay 2 chỗ `<...>`** (URL project và
`CRON_SECRET` ở bước 5), bấm Run.

**✔ Kiểm tra:**
- Dashboard → **Edge Functions**: 5 hàm `sepay-webhook`, `run-reminders`, `purge-expired-docs`,
  `invite-member`, `create-payment-request`.
- SQL Editor: `select jobname, schedule, active from cron.job;` → 3 dòng, `active = true`.

---

## 7. Tạo chủ nhà đầu tiên

Đã tắt tự đăng ký nên chủ nhà đầu tiên tạo tay (từ đó về sau chủ nhà mời quản lý trong app).

1. **Authentication → Users → Add user → Create new user**: email + mật khẩu, tích
   *Auto Confirm User*. Copy **User UID**.
2. SQL Editor:

```sql
with o as (insert into orgs (name) values ('<Tên chủ nhà / công ty>') returning id)
, p as (insert into profiles (id, org_id, full_name, phone)
        select '<USER_UID>', o.id, '<Họ tên>', '<SĐT>' from o returning id, org_id)
insert into memberships (profile_id, org_id, role, tower_id)
select p.id, p.org_id, 'OWNER', null from p;
```

3. Tạo khu / tòa / tài khoản ngân hàng nhận tiền cho chủ nhà này (bảng `zones`, `towers`,
   `bank_accounts`). `bank_accounts.number` phải **đúng** số tài khoản đã liên kết SePay ở bước 8.

**✔ Kiểm tra:** `select * from memberships;` có 1 dòng `OWNER`.

---

## 7b. Dữ liệu mẫu (CHỈ staging)

Để mở app lên là thấy các màn có số liệu: SQL Editor → dán `supabase/demo-data.sql` → sửa
`c_email` thành email chủ nhà ở bước 7 (và `c_bank_*` nếu muốn thử QR với tài khoản thật) → Run.

**✔ Kiểm tra:** dòng thông báo `Xong: ~30 căn, ~24 hợp đồng, ~280 kỳ thu`. Chạy lại lần hai sẽ
báo trùng — khối xoá ở cuối file dọn sạch để chạy lại.

**Không bao giờ chạy file này trên production.**

## 8. Nối SePay

1. Đăng ký tài khoản tại sepay.vn, chọn gói theo số giao dịch/tháng (~200+ giao dịch).
2. **Liên kết tài khoản ngân hàng** nhận tiền của **từng** chủ nhà.
3. **Tích hợp → Webhooks → Thêm webhook**:

| Trường | Giá trị |
|---|---|
| URL | `https://<REF>.supabase.co/functions/v1/sepay-webhook` |
| Sự kiện | **Chỉ tiền vào** |
| Kiểu chứng thực | **API Key** |
| API Key | đúng `SEPAY_WEBHOOK_SECRET` ở bước 5 |
| Tài khoản | các tài khoản đã liên kết ở trên |

4. *(Tuỳ chọn)* Cấu hình **mã thanh toán** trong SePay với tiền tố `HC` để SePay tự tách mã —
   webhook đã đọc cả hai trường `code` và `content`.

---

## 9. Kiểm tra từng hàm trên STAGING

Chuẩn bị 3 biến trong Git Bash (lấy ở Dashboard → **Project Settings → API**):

```bash
export URL=https://<REF_STAGING>.supabase.co
export ANON=<anon public key>
export SEPAY=<SEPAY_WEBHOOK_SECRET>
export CRON=<CRON_SECRET>
```

### 9.1 Webhook — cửa vào phải khoá

```bash
# Không khoá → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL/functions/v1/sepay-webhook -d '{}'
# Sai khoá → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL/functions/v1/sepay-webhook \
  -H "Authorization: Apikey sai-khoa" -d '{}'
# Tiền RA → 200 {"ok":true,"ignored":...}  (không để SePay gửi lại vô ích)
curl -s -X POST $URL/functions/v1/sepay-webhook -H "Authorization: Apikey $SEPAY" \
  -H 'content-type: application/json' -d '{"id":1,"transferType":"out","transferAmount":1000}'
```
**✔ Đạt khi:** `401`, `401`, rồi `{"ok":true,"ignored":"not incoming"}`.

### 9.2 Webhook — khớp, gửi lại, chuyển trùng

Lấy một `contracts.id` và `bank_accounts.id` có sẵn trên staging (dữ liệu mẫu nếu đã chạy
`db:test` trên staging, hoặc tự tạo ở bước 7), rồi:

```bash
node scripts/test-payment.mjs --contract <CONTRACT_ID> --bank-account <BANK_ACCOUNT_ID> \
     --bank MB --account <SỐ_TK> --amount 2000
```
Dán phần **1. SQL** vào SQL Editor → Run. Lưu phần **3. Body** thành file `sepay.json`.

```bash
# Lần 1 → khớp
curl -s -X POST $URL/functions/v1/sepay-webhook -H "Authorization: Apikey $SEPAY" \
  -H 'content-type: application/json' --data @sepay.json
# Lần 2, Y HỆT (giả lập SePay gửi lại)
curl -s -X POST $URL/functions/v1/sepay-webhook -H "Authorization: Apikey $SEPAY" \
  -H 'content-type: application/json' --data @sepay.json
```
Sửa `"id"` trong `sepay.json` thành số khác (giả lập khách chuyển lần hai cùng nội dung), gửi lần 3.

**✔ Đạt khi:**
- Lần 1: `{"ok":true,"kind":"PAID","receipt":"PT-202609-...."}`
- Lần 2: `{"ok":true,"duplicate":true}`
- Lần 3: `{"ok":true,"kind":"UNMATCHED","receipt":null}`
- SQL: `select match_kind, match_reason from bank_tx_exceptions;` → thấy giao dịch lần 3.
- SQL: `select status from payment_requests where code = '<MÃ>';` → `SETTLED`.

Thử thêm: sửa `transferAmount` lệch 1.000đ so với phiếu mới → phải ra `PARTIAL` hoặc
`OVERPAID`, **không bao giờ** `PAID`.

### 9.3 Tiền thật — 2.000đ

Tạo phiếu mới bằng `test-payment.mjs` (`--amount 2000`), dán chuỗi QR vào một trang tạo ảnh
QR, **quét bằng app ngân hàng thật** và chuyển.

**✔ Đạt khi:** app ngân hàng hiện đúng số TK, đúng 2.000đ, đúng nội dung `HC...`; sau vài
giây SePay → *Lịch sử webhook* báo 200, và phiếu chuyển `SETTLED`. Thử quét bằng ít nhất 3
app ngân hàng khác nhau.

### 9.4 Lịch chạy nền

```bash
curl -s -X POST $URL/functions/v1/run-reminders -H "x-cron-secret: $CRON"
curl -s -X POST $URL/functions/v1/purge-expired-docs -H "x-cron-secret: $CRON"
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL/functions/v1/run-reminders   # không khoá
```
**✔ Đạt khi:** hai lệnh đầu trả `{"ok":true,...}`, lệnh ba trả `401`. Gọi `run-reminders` lần
hai trong cùng ngày → `digests: 0` (không gửi trùng). Có kỳ tới hạn trong ±3 ngày thì
`select title, body from notifications;` thấy bản tin.

Sáng hôm sau: `select * from cron.job_run_details order by start_time desc limit 10;` —
các job `status = succeeded`.

### 9.5 Mời quản lý + khoá tài khoản

```bash
# Lấy JWT của chủ nhà (tài khoản tạo ở bước 7)
TOKEN=$(curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H 'content-type: application/json' \
  -d '{"email":"<email chủ nhà>","password":"<mật khẩu>"}' | sed -E 's/.*"access_token":"([^"]+)".*/\1/')

# Mời một email bạn đọc được
curl -s -X POST $URL/functions/v1/invite-member -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"email":"<email thử>","full_name":"Quản lý thử"}'
```
**✔ Đạt khi:** trả `{"ok":true,"profile_id":"..."}` và hộp thư nhận email mời. Gọi lại với
cùng email → `409`. Gọi bằng JWT của quản lý (không phải chủ) → `403`.

Khoá thử:
```bash
curl -s -X POST $URL/rest/v1/rpc/lock_member -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"p_profile":"<profile_id vừa mời>","p_reason":"thử"}'
```
Rồi đăng nhập bằng tài khoản quản lý đó và đọc `/rest/v1/units` → **mảng rỗng `[]`**.
Mở khoá bằng `rpc/unlock_member` → đọc lại thấy dữ liệu.

### 9.6 Tự đăng ký phải bị chặn

```bash
curl -s "$URL/auth/v1/signup" -H "apikey: $ANON" -H 'content-type: application/json' \
  -d '{"email":"la@example.com","password":"Abcdef123456"}'
```
**✔ Đạt khi:** báo lỗi kiểu `Signups not allowed`.

---

### 9.7 Chạy app trên điện thoại với staging

Làm theo `docs/RUN.md` → *Nối app vào Supabase*, rồi `npm run start:tunnel` và quét QR.

| Thử | ✔ Đạt khi |
|---|---|
| Mở app khi chưa có `.env` | màn "Chưa cấu hình", không sập |
| Đăng nhập sai mật khẩu | "Sai email hoặc mật khẩu" |
| Đăng nhập chủ nhà | tab **Căn hộ**: có Khu S / Khu H, tòa S12 · S219 · H7, thẻ số liệu khớp số căn |
| Bấm "Mở hết" → một căn | chi tiết 5 tab; tab Phòng & người ở bấm "i" ra thông tin người ở |
| Tìm tên khách không dấu (vd `nguyen`) | ra căn kèm dòng tên khách khớp |
| Lọc "Chưa đóng" | số trên nút **Xem N căn** bằng số dòng hiện ra |
| Căn đang nợ → **Tạo yêu cầu thanh toán** | bước 1 hiện các kỳ + phạt (nếu trễ > 2 ngày tiền nhà) → **Xác nhận và tạo QR** ra mã `HC…` |
| **Gửi qua Zalo** | mở bảng chia sẻ có ảnh QR; chọn Zalo gửi cho chính bạn → dán (tin nhắn đã được sao chép) → app hỏi "Đã gửi chưa?" → Đã gửi |
| Quét ảnh QR vừa gửi bằng app ngân hàng | đúng số TK, số tiền, nội dung |
| Quay lại **Cần xử lý** | căn đó rời nhóm "Chưa gửi QR" |
| Giả lập SePay trả đúng mã đó (§9.2, lấy `code` + `amount` trên phiếu) | kéo xuống làm mới → căn thành "Đã đóng đủ"; **Sổ quỹ** có phiếu thu `PT-…` |
| Giả lập SePay chuyển thiếu | **Cần xử lý → Ngoại lệ SePay** có thẻ "khách chuyển thiếu" → **Ghép vào phiếu này** → sinh phiếu thu, kỳ còn nợ đúng phần thiếu |
| **Tiền mặt** ở một căn | Sổ quỹ → "Ghi nhận tay" có dòng mang tên bạn |
| Tab Ghi chú → thêm | hiện ngay kèm giờ + tên; không có nút sửa / xoá |
| Ảnh đại diện → Tài khoản → **Mời quản lý** | email mời tới; quản lý đặt mật khẩu qua link → đăng nhập chỉ thấy tòa được giao |
| Chủ nhà bấm **Khoá** quản lý đó | máy quản lý kéo xuống làm mới → màn "Tài khoản đã bị khoá" |

Lỗi hay màn hình lạ: chụp màn hình + dòng lỗi trong terminal Metro gửi tôi.

## 10. Sao lưu — diễn tập khôi phục (production, gói Pro)

1. **Database → Backups**: có bản sao lưu hằng ngày. Bật **Point in Time Recovery** nếu dùng.
2. Diễn tập: tạo project trống `homescare-restore-test` → khôi phục bản sao lưu gần nhất vào đó
   (Backups → *Restore to new project*) → đếm `select count(*) from contracts;` so với production.
3. Ghi ngày diễn tập vào `RELEASE-CHECKLIST.md`, rồi xoá project thử.

Bản sao lưu chưa từng khôi phục thử thì coi như chưa có.

---

## 11. Cảnh báo

- **Reports / Logs → Edge Functions**: xem lỗi 500 của `sepay-webhook` — mỗi lỗi là một khoản
  tiền đang chờ SePay gửi lại.
- **Project Settings → Billing → Usage**: bật email cảnh báo dung lượng DB / Storage.
- Mỗi sáng tuần đầu: `select count(*) from bank_tx_exceptions;` — hàng đợi ngoại lệ phải có người xử lý.
