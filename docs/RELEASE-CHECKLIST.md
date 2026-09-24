# HomesCare — Checklist release app

> Lập ngày 24/09/2026, sau khi đọc lại toàn bộ dự án: `product/` (core, mobile, supabase, docs),
> đặc tả v1.9, prototype `app/` và các file rời ở thư mục gốc.
> Đánh dấu `[x]` khi xong. Mục có **⛔** là chặn release — chưa xong thì không phát hành.

---

## 0. Kết quả review — hiện trạng thật

Kiểm trực tiếp trên máy, không đọc theo tài liệu:

| Hạng mục | Kết quả |
|---|---|
| `npm test` (lõi nghiệp vụ) | ✅ 39/39 đạt |
| `npm run typecheck` | ✅ Xanh *(24/09: nguyên nhân là app kiểm kiểu trước khi lõi được dựng — nay typecheck tự dựng lõi)* |
| Migrations + test RLS | ✅ 87/87 đạt (24/09) · ⏳ **bước 3 thêm 29 test → cần bạn chạy: phải ra 116/116** |
| Webhook SePay | ⏳ Đã viết lại + có `bundle:edge` (bước 3) — chờ bạn chạy `functions:check` và thử trên staging |
| App mobile | ⚠️ 1/8 màn hình, dữ liệu giả, chưa có đăng nhập, chưa nối Supabase |
| Nhắc hạn tự động | ⏳ Đã có `run-reminders` + lịch `cron.sql` — chờ deploy |
| Quản lý mã nguồn | ✅ Git + GitHub `Tluan-source/Homes_Care`, có CI |
| Tài nguyên store | ❌ Không có icon, splash, `eas.json` |

### Lỗi mới phát hiện trong lần review này (chưa có trong docs)

- [x] ⛔ **Webhook mất tiền khi retry.** *(sửa ở bước 3: cột `processed_at` + RPC `process_bank_tx` gọi lại bao nhiêu lần cũng an toàn)* Thứ tự hiện tại: `insert bank_transactions` → `settle_request`. Nếu `settle` lỗi → trả 500 → SePay gửi lại → `insert` dính `23505` → trả `duplicate: true` → **giao dịch không bao giờ được đối soát lại**, tiền vào tài khoản nhưng kỳ vẫn nợ. Sửa: khi trùng thì kiểm tra giao dịch đã có `payments`/đã xử lý chưa, chưa thì chạy lại đối soát (hoặc thêm cột `processed_at` trên `bank_transactions`).
- [x] ⛔ **Webhook đọc toàn bộ phiếu đang mở của MỌI tổ chức** (`.in('status', ['DRAFT','SENT'])` không lọc). Chậm dần theo số phiếu, và dễ khớp nhầm chéo chủ nhà. Lọc theo `account_number` nhận tiền → `bank_accounts` → org trước khi đối soát.
- [x] **`due: new Date()`** trong webhook là giá trị giữ chỗ — thứ tự phân bổ nhiều kỳ không đúng. Lấy `due_on` thật từ `payment_periods`.
- [x] **Số phiếu thu bị nhảy số.** `nextReceiptSeq()` chạy trước `settle_request`; settle lỗi thì số đã cấp mất luôn. Chuyển việc cấp số vào trong `settle_request` (cùng transaction).
- [x] **Audit log ghi sau cùng, không kiểm lỗi.** Insert audit thất bại thì không ai biết. Kiểm `error`, hoặc ghi audit trong cùng RPC.
- [x] ⛔ **Lịch xoá ảnh CCCD chỉ hẹn, không ai xoá.** *(bước 3: Edge Function `purge-expired-docs` + lịch hằng ngày)* `file_retention` có dữ liệu nhưng không có job `pg_cron`/Edge Function nào thực sự xoá file khi tới `purge_after`.
- [x] **`supabase/tests/run.sh` nhận `PGURL` bất kỳ và xoá sạch database.** Thêm chặn: từ chối chạy nếu URL không phải `127.0.0.1`/`localhost` (trừ khi có cờ xác nhận rõ ràng). Một lần gõ nhầm URL production là mất hết.
- [ ] `config.toml` đang `enable_signup = true` — khi lên production phải tắt đăng ký tự do (chủ nhà mời quản lý, không cho ai cũng tạo tài khoản).
- [x] `.gitignore` đang bỏ qua `package-lock.json` → build mỗi lần ra phiên bản thư viện khác nhau. **Phải commit lockfile.**
- [ ] Tiêu đề màn hình hardcode `"KHU CĂN HỘ NEXUS"` trong `App.tsx` — lấy từ dữ liệu tổ chức.

### Tài liệu lệch với code

- [ ] `HIEN-TRANG.md` §2: sơ đồ vẫn ghi migrations "CHƯA CHẠY ⛔ / chưa chạy lần nào", trong khi §3 ghi đã chạy sạch.
- [x] `ARCHITECTURE.md` §5.2 trỏ tới file không tồn tại: `core/time/schedule.ts` (thật là `billing/schedule.ts`), `core/payment/banks.ts` (thật là `payment/vietqr.ts`), `functions/run-reminders/`.
- [x] `ARCHITECTURE.md` nói "có ESLint chặn" import sai chiều / app tự tính tiền — **chưa có cấu hình ESLint nào**.
- [ ] Đặc tả v1.9 §8.4 ghi mã thanh toán `HC` + 6 ký tự và số phiếu `PT-2026-00009`; code thật là `HC2609GD92T` (YYMM + 4 + ký tự kiểm tra) và `PT-202609-0009`. Cập nhật đặc tả lên v2.0 theo code.
- [ ] Đặc tả §4.2 `payment_extensions` ghi "Ai duyệt: OWNER", §9.2 lại cho quản lý duyệt ≤ 7 ngày — xoá câu cũ.

### Dọn dẹp thư mục

- [ ] Lưu trữ riêng prototype `app/` (Vite) và `HomesCare-demo.html` — không để lẫn với sản phẩm.
- [ ] Xoá / chuyển đi các file nén rời: `product.tar.gz`, `db-update.tar.gz`, `Claude outputs/*.tar.gz`.
- [ ] Gộp `docs/HomesCare-dac-ta-v1.6 → v1.9.md`: giữ bản hiện hành, bản cũ vào `docs/archive/`.
- [ ] Bỏ `.expo/`, `dist/`, `dist-tests/`, `.idea/` khỏi mã nguồn (đã có trong `.gitignore`, nhưng chưa có git để áp dụng).

---

## 1. Nền móng — làm trước mọi thứ

- [x] ⛔ `git init` trong `product/`, commit lần đầu, đẩy lên GitHub/GitLab **private**. *(kiểm lại repo đang để Private)*
- [ ] Bật bảo vệ nhánh `main`: phải qua pull request, CI xanh mới merge. **← bạn tự bật trên GitHub, xem hướng dẫn cuối file**
- [x] ⛔ Sửa `npm run typecheck` về xanh.
- [x] Thêm ESLint + luật chặn: `core` không import `apps/`/`supabase/`; ngoài core không import sâu vào `@homescare/core/...`.
- [x] CI (GitHub Actions): `npm ci` → `typecheck` → `npm test` → `db:test` (Postgres service) → **quét khoá bí mật** (`service_role`, `SEPAY_`, `eyJ` trong `apps/`) bằng gitleaks. *(`.github/workflows/ci.yml`, 3 job: `check` · `db` · `secrets`)*
- [x] Đặt phiên bản: `app.json` `version` + `android.versionCode` + `ios.buildNumber`; quy ước tăng số. *(quy ước ở `CONVENTIONS.md` → Phiên bản)*

---

## 2. Chốt quyết định còn treo

- [x] ⛔ **S1** — Đăng nhập: **email + mật khẩu**. *(chốt 24/09)* Không cho tự đăng ký — chủ nhà tạo tài khoản cho quản lý. Mật khẩu ≥ 10 ký tự, có chữ và số. Đã cấu hình ở `supabase/config.toml`.
- [x] **S2** — Quản lý nghỉ việc → chủ nhà **khoá** tài khoản (không xoá, mở lại được). *(chốt 24/09)* App chỉ có 2 vai: chủ nhà và quản lý. Đã dựng ở `0006_account_lock.sql`: `lock_member()` / `unlock_member()`, hiệu lực ngay ở database kể cả khi phiên đăng nhập còn sống, có ghi nhật ký. 22 test mới trong `50_lock.sql` → tổng **87/87 đạt**.
- [x] **S3** — Ảnh CCCD **giữ và mã hoá tới khi hợp đồng kết thúc**, rồi xoá. *(chốt 24/09)* Mốc xoá đổi từ 90 ngày → 0 ngày (`id_doc_retention_days()` trong `0006`). ⚠️ Đánh đổi: tranh chấp cọc sau ngày kết thúc sẽ không còn ảnh CCCD để đối chiếu — hợp đồng giấy và biên bản bàn giao vẫn còn. Phần mã hoá: xem mục 5.
- [x] **Nhắc & đối soát** *(chốt 24/09)*:
  - **Nhắc chỉ trong app**, chỉ cho chủ nhà và quản lý. App **không** nhắn cho khách.
  - **Đối soát tự động bằng SePay** — tiền về là tự ghi sổ, lệch tiền thì vào hàng đợi ngoại lệ.
  - **QR gửi tay qua Zalo** — quản lý bấm chia sẻ từ app sang Zalo. Vì bước này làm tay ~200 lần/tháng, màn gửi QR phải nhanh nhất có thể (mục 4).
  - *Còn nên đo sau 1–2 tháng chạy thật:* thời gian gửi QR mỗi tháng. Nếu quá lớn thì cân nhắc Zalo OA / ZNS ở giai đoạn 2.
- [x] Phát hành: **nội bộ trước** (Google Play Internal testing + TestFlight), công khai sau. *(chốt 24/09)*

---

## 3. Backend (Supabase) — production

> Hướng dẫn từng bước + cách tự kiểm tra: **`docs/DEPLOY.md`**. Ký hiệu: **[code]** = đã viết
> trong repo (24/09), còn chờ bạn chạy kiểm tra · **[bạn]** = phải làm trên Dashboard / SePay.

**Code — đã viết**
- [x] **[code]** `0007_server_jobs.sql`: webhook an toàn khi gửi lại (`processed_at`, `process_bank_tx`), số phiếu thu cấp trong cùng transaction, nhật ký trong cùng transaction, hàng đợi ngoại lệ `bank_tx_exceptions`, `end_expired_contracts()`, hộp thư `notifications`, `push_tokens` + `register_push_token()`.
- [x] **[code]** `sepay-webhook` viết lại: chỉ nạp phiếu đúng mã + cùng hợp đồng, `due` lấy từ kỳ thật, giờ SePay hiểu đúng +07:00, giới hạn body 64KB, tiền ra trả 200 (không để SePay retry vô ích).
- [x] **[code]** `run-reminders`: MỘT bản tin/ngày/người cho chủ nhà + quản lý (bỏ tài khoản bị khoá), push qua Expo, không gửi trùng.
- [x] **[code]** `purge-expired-docs`: xoá ảnh CCCD qua Storage API (xoá file thật, không chỉ xoá hàng).
- [x] **[code]** `invite-member`: chủ nhà mời quản lý bằng email; lỗi giữa chừng thì dọn tài khoản vừa tạo.
- [x] **[code]** `npm run bundle:edge` sinh `_shared/core.ts` từ core (gitignore) · `functions:check` · `functions:deploy`; CI thêm job `functions`.
- [x] **[code]** `supabase/cron.sql`: 3 lịch (00:05, 00:20, 08:00 giờ VN), bí mật để trong Vault.
- [x] **[code]** `60_hardening.sql`: tự động bắt hàm `security definer` gọi được từ ngoài, view thiếu `security_invoker`, bảng quên bật RLS — ở MỌI migration sau này.
- [x] **[code]** `scripts/test-payment.mjs`: sinh phiếu + QR + body SePay giả lập để thử trên staging.

**Kiểm tra trên máy — [bạn]** *(DEPLOY.md §1)*
- [ ] ⛔ `npm run check` xanh · `npm run functions:check` không lỗi · `npm run db:test` ra **116/116**.
- [ ] Bật thêm check `functions` trong bảo vệ nhánh `main` (phụ lục cuối file).

**Dựng cloud — [bạn]**
- [ ] ⛔ Tạo 2 project Supabase `homescare-staging` / `homescare-prod`, Singapore; prod dùng gói Pro. *(§2)*
- [ ] ⛔ `supabase db push` 7 migration lên staging, rồi production. Không chạy `seed.sql` lên production. *(§3)*
- [ ] ⛔ Dashboard Auth: tắt đăng ký tự do, bật xác nhận email, mật khẩu 10 + chữ/số, bật MFA TOTP, thêm redirect `homescare://set-password`. *(§4)*
- [ ] ⛔ SMTP riêng. *(§4)*
- [ ] ⛔ `supabase secrets set` 3 khoá. *(§5)*
- [ ] ⛔ `npm run functions:deploy` + chạy `cron.sql`. *(§6)*
- [ ] ⛔ Tạo chủ nhà đầu tiên + tòa + tài khoản ngân hàng. *(§7)*
- [ ] ⛔ **SePay:** tài khoản, liên kết ngân hàng của **từng chủ nhà**, webhook + API key, gói theo ~200+ giao dịch/tháng. *(§8)*

**Kiểm tra trên staging — [bạn]** *(§9)*
- [ ] Webhook: không khoá/sai khoá 401 · tiền ra 200 · khớp → PAID + phiếu thu · gửi lại → duplicate · chuyển trùng → UNMATCHED · lệch 1.000đ → không bao giờ PAID.
- [ ] ⛔ Tiền thật 2.000đ, quét bằng 3 app ngân hàng khác nhau.
- [ ] Lịch nền: `run-reminders` / `purge-expired-docs` chạy tay được, không khoá → 401, sáng hôm sau `cron.job_run_details` báo succeeded.
- [ ] `invite-member` gửi được email mời; khoá → quản lý đọc ra `[]`; mở khoá → thấy lại.
- [ ] Tự đăng ký bị chặn.

**Vận hành — [bạn]**
- [ ] ⛔ Bật PITR / sao lưu hằng ngày và **diễn tập khôi phục** một lần vào project trống. *(§10)*
- [ ] Cảnh báo lỗi Edge Function, dung lượng DB/Storage. *(§11)*
- [ ] *(tuỳ chọn)* Khi khoá tài khoản, gọi thêm Auth Admin `ban_duration` để chặn luôn việc đăng nhập — database đã chặn dữ liệu rồi.
- [ ] *(ghi nhớ)* Test `70_server_jobs` dùng hợp đồng mẫu hết hạn **10/03/2027** — sau ngày đó sửa `ends_on` trong `seed.sql`.

---

## 4. App mobile — tính năng tối thiểu để release (P0 + P1)

- [ ] ⛔ Màn đăng nhập email + mật khẩu, quên mật khẩu (email đặt lại), lưu phiên an toàn (`expo-secure-store`), đăng xuất.
- [ ] Màn **Tài khoản quản lý** (chỉ chủ nhà): danh sách, mời mới, khoá / mở khoá (gọi `lock_member` / `unlock_member`).
- [ ] Tài khoản bị khoá đăng nhập vào → hiện "Tài khoản đã bị khoá, liên hệ chủ nhà" (đọc `profiles.locked_at`), không hiện màn hình trống.
- [ ] ⛔ Lớp dữ liệu Supabase thay `demo.ts` (chỉ `SUPABASE_URL` + `ANON_KEY` qua `EXPO_PUBLIC_*`).
- [ ] Điều hướng: thanh dưới 3 mục — Căn hộ · Cần xử lý · Sổ quỹ.
- [ ] Chi tiết căn 5 tab.
- [ ] Thêm căn (3 ô riêng tòa/tầng/mã căn, xem trước mã).
- [ ] Luồng Cho thuê 5 bước, hiện TỔNG PHẢI THU trước khi lưu.
- [ ] ⛔ **Gửi QR qua Zalo** — việc tay nhiều nhất của quản lý, phải tối ưu:
  - [ ] Nút **Gửi qua Zalo**: mở bảng chia sẻ của máy với **ảnh QR + tin nhắn soạn sẵn** (tên căn, kỳ, số tiền, số TK, nội dung chuyển khoản). Quản lý chỉ chọn khách trong Zalo rồi gửi.
  - [ ] Tin soạn sẵn có dòng **"Vui lòng giữ nguyên nội dung chuyển khoản"** — khách sửa nội dung là mất mã, SePay không tự khớp được.
  - [ ] Nút **Sao chép nội dung** và **Lưu ảnh QR** cho khách không dùng Zalo.
  - [ ] Sau khi chia sẻ, hỏi **"Đã gửi cho khách chưa?"** → đánh dấu `SENT` + `sent_at`. App không biết chắc Zalo đã gửi, nên phải hỏi, không tự đánh dấu.
  - [ ] Danh sách **"Chưa gửi QR"** ở màn Cần xử lý, xếp theo hạn — bấm lần lượt từ trên xuống.
  - [ ] Tạo sẵn phiếu + QR cho **mọi kỳ tới hạn hôm nay** chỉ bằng một nút, để quản lý chỉ còn việc bấm gửi.
- [ ] Hàng đợi ngoại lệ (PARTIAL / OVERPAID / UNMATCHED / MULTI_PERIOD) + ghi nhận tiền mặt.
- [ ] Xin khất / duyệt khất (quản lý ≤ 7 ngày, trên nữa chủ nhà).
- [ ] Sổ quỹ khoá theo chủ nhà đăng nhập.
- [ ] Chụp/tải ảnh CCCD qua signed URL 60 giây, không cache.
- [ ] Không còn nút chết — bấm vào đâu cũng có màn hình thật.
- [ ] Trạng thái rỗng, đang tải, mất mạng (app online-only: báo rõ, không cho ghi).
- [ ] Mọi thứ bấm được có `accessibilityLabel`.
- [ ] Chế độ sáng/tối, chữ lớn (Dynamic Type), màn hình nhỏ.
- [ ] Theo dõi lỗi crash (Sentry qua `sentry-expo`) — **lọc dữ liệu cá nhân** khỏi báo lỗi.
- [ ] Push notification (Expo Notifications) cho chủ nhà + quản lý: bản tin sáng *"Hôm nay: N căn cần gửi QR, M căn quá hạn"*, và báo khi SePay ghi nhận tiền về / có giao dịch lệch.
- [ ] ⛔ **Xoá tài khoản ngay trong app** — Apple và Google đều bắt buộc nếu app cho tạo tài khoản.

---

## 5. Bảo mật & dữ liệu cá nhân

- [ ] ⛔ Quét bản build (`.apk`/`.ipa` giải nén) — không có `service_role`, không có khoá SePay.
- [ ] Bắt buộc 2 lớp (MFA TOTP) cho tài khoản OWNER: app ép đăng ký mã khi chủ nhà đăng nhập lần đầu; RLS các bảng tiền kiểm `aal2` với vai OWNER.
- [x] Quy trình khi quản lý nghỉ (S2): chủ nhà bấm khoá — database đã xong, còn màn hình (mục 4).
- [ ] ⛔ **Mã hoá ảnh CCCD (S3).** Supabase đã mã hoá ổ đĩa (at rest), nhưng ai cầm signed URL hoặc có quyền đọc bucket vẫn thấy ảnh gốc. Mã hoá thêm một lớp: tải lên qua Edge Function, mã hoá AES-256-GCM bằng khoá trong `supabase secrets`, xem lại cũng qua Edge Function. **Khoá không bao giờ nằm trong app.**
- [ ] Mã hoá **số CCCD** trong database (cột `id_number` và các cột tương tự) — cùng khoá phía server.
- [ ] Rà log: không in số tài khoản, CCCD, tên khách.
- [ ] ⛔ Điều khoản dữ liệu cá nhân trong hợp đồng thuê: thu gì, để làm gì, lưu bao lâu, ai xem, khách có quyền gì.
- [ ] ⛔ Nhờ người có chuyên môn pháp lý rà theo quy định hiện hành về bảo vệ dữ liệu cá nhân (NĐ 13/2023 và Luật Bảo vệ dữ liệu cá nhân 2025 — kiểm lại điều khoản đang có hiệu lực).
- [ ] Quy trình xử lý khi rò rỉ: ai báo, báo ai, trong bao lâu.

---

## 6. Hợp đồng mẫu — sửa cho khớp đặc tả v1.9

- [ ] Điều 6: "phạt 100.000VNĐ" → **100.000đ/ngày**; "tối đa 02 ngày" → **ân hạn 2 ngày**; điền chỗ trống "thanh toán tiền nhà ___ lần".
- [ ] Điều 4.4 và 8.9: hoàn cọc 15 ngày → **10 ngày**.
- [ ] Điều 10.3 vs 10.4: thêm ngưỡng **15 ngày** trễ tiền nhà mới chuyển thanh lý.
- [ ] Thêm điều khoản dữ liệu cá nhân (mục 5).

---

## 7. Chuẩn bị store

**Chung**
- [ ] Icon 1024×1024, adaptive icon Android (foreground + nền `#FFC72E`), splash screen.
- [ ] `eas.json` với 3 profile: `development`, `preview`, `production`.
- [ ] Biến môi trường production trong EAS (không commit `.env`).
- [ ] Trang **Chính sách quyền riêng tư** công khai (URL) — cả hai store bắt buộc.
- [ ] Email / trang hỗ trợ.
- [ ] Ảnh chụp màn hình bằng dữ liệu mẫu (không dùng dữ liệu khách thật).
- [ ] Tài khoản demo cho người duyệt store (app cần đăng nhập mới dùng được).
- [ ] Kiểm tên "HomesCare" không trùng thương hiệu đã có trên store.
- [ ] Cập nhật OTA (`expo-updates`): chốt `runtimeVersion` và kênh `production`.

**Google Play**
- [ ] Tài khoản Google Play Console (tổ chức, nếu có pháp nhân — tài khoản cá nhân mới phải qua giai đoạn test kín với nhiều tester trước khi lên production; kiểm yêu cầu hiện hành).
- [ ] Khai **Data safety**: CCCD, SĐT, họ tên, ảnh — thu thập, mục đích, mã hoá khi truyền.
- [ ] Khai phân loại nội dung, đối tượng người dùng, quyền camera/ảnh.
- [ ] Target API level đúng yêu cầu hiện tại của Google Play.
- [ ] Ký app bằng Play App Signing; `eas build -p android --profile production` ra `.aab`.
- [ ] Đẩy lên **Internal testing** trước.

**App Store**
- [ ] Apple Developer Program.
- [ ] App Privacy (nutrition label) + privacy manifest.
- [ ] Mô tả quyền: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` bằng tiếng Việt.
- [ ] `eas build -p ios --profile production` → TestFlight.
- [ ] Ghi chú cho người duyệt: đây là app nghiệp vụ cho chủ nhà/quản lý, kèm tài khoản demo.

---

## 8. Kiểm thử trước khi phát hành

- [ ] `npm test`, `typecheck`, `db:test` xanh trên CI.
- [ ] 4 luồng xương sống (Maestro), chạy trên máy thật Android + iOS:
  - [ ] Đăng nhập → chỉ thấy đúng căn theo quyền
  - [ ] Cho thuê căn trống → hợp đồng → kỳ thu sinh ra
  - [ ] Yêu cầu thanh toán → QR quét bằng app ngân hàng thật ra đúng số tiền → webhook khớp → phiếu thu
  - [ ] Giao dịch lệch → hàng đợi ngoại lệ → xử lý → trạng thái căn đổi theo
- [ ] Quét QR bằng ít nhất 3 app ngân hàng khác nhau.
- [ ] Hai quản lý cùng cho thuê một phòng cùng lúc → một người bị chặn.
- [ ] Tài khoản chủ A không thấy bất cứ dữ liệu nào của chủ B (thử bằng REST API trực tiếp, không chỉ qua app).
- [ ] Ca biên ngày: vào 31/01, năm nhuận, đổi tháng lúc nửa đêm giờ VN.
- [ ] Chạy thử **song song với sổ/Excel hiện tại 1 kỳ thu (≈1 tháng)** với 1 tòa thật; so từng con số.
- [ ] Nhập dữ liệu thật: script import từ Excel, kiểm số căn / hợp đồng / công nợ khớp sổ cũ.

---

## 9. Ngày phát hành

- [ ] Sao lưu database ngay trước khi phát hành.
- [ ] Gắn tag git `v1.0.0`, ghi release notes.
- [ ] Phát hành theo từng phần (staged rollout) — bắt đầu 1 tòa / vài quản lý.
- [ ] Đăng ký URL webhook production trên SePay, gửi thử 1 giao dịch nhỏ.
- [ ] Hướng dẫn ngắn cho quản lý (1 trang, có ảnh), kênh báo lỗi.

## 10. Sau phát hành (tuần đầu)

- [ ] Theo dõi crash, lỗi Edge Function, hàng đợi ngoại lệ mỗi ngày.
- [ ] Đối chiếu sao kê ngân hàng với phiếu thu cuối tuần đầu.
- [ ] Thu phản hồi quản lý; đo lại thời gian đối soát so với đích < 15 phút/tháng.
- [ ] Lên lịch diễn tập khôi phục sao lưu định kỳ (mỗi quý).

---

## Phụ lục — bật bảo vệ nhánh `main` trên GitHub

Việc này phải làm trên web, không làm được từ code. Làm **sau khi** CI đã chạy xanh ít nhất
một lần (GitHub chỉ cho chọn những check đã từng chạy).

1. Repo `Tluan-source/Homes_Care` → **Settings** → **Branches** → **Add branch ruleset**
   (hoặc *Add rule* ở giao diện cũ). Ruleset name: `main`, Enforcement: **Active**.
2. Target branches → **Include default branch**.
3. Bật:
   - **Restrict deletions**
   - **Block force pushes**
   - **Require a pull request before merging** (làm một mình thì để *Required approvals = 0*)
   - **Require status checks to pass** → **Add checks**: `check`, `db`, `functions`, `secrets`
     → bật *Require branches to be up to date before merging*
4. **Create**.

Từ đó mọi thay đổi đi theo: tạo nhánh → push → mở pull request → CI xanh → merge.
