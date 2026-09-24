# HomesCare — Hiện trạng & Kiến trúc

> Cập nhật: 24/09/2026 (vòng 2 — sau khi chạy thật database) · Đối chiếu trực tiếp với mã nguồn,
> không viết theo trí nhớ.

Bốn tài liệu trong `docs/` trả lời bốn câu khác nhau. Đừng đọc nhầm file:

| File | Trả lời câu |
|---|---|
| `ARCHITECTURE.md` | **Vì sao** thiết kế như vậy — mục tiêu, ranh giới, nguyên tắc |
| `CONVENTIONS.md` | **Viết code kiểu gì** — quy ước đặt tên, cách tổ chức |
| `RUN.md` | **Chạy bằng cách nào** |
| `SECURITY.md` | **Chỗ nào nguy hiểm** |
| **`HIEN-TRANG.md`** *(file này)* | **Đang ở đâu, code đang làm gì, file nào làm việc gì** |

---

## 1. Tóm tắt một đoạn

Lõi nghiệp vụ đã xong và có test đầy đủ (39/39). **Database giờ đã chạy thật** trên
PostgreSQL 16 và có **65 test phân quyền, tất cả đều đạt** — chạy được cả trên máy lẫn
trên Supabase thật. App chạy được nhưng mới có **một màn hình** và đang chạy bằng **dữ
liệu giả**. Hàm nhận tiền vẫn **chưa deploy, và chưa biên dịch được** vì thiếu một file
sinh ra (xem §3).

Nói cách khác: **hai phần khó nhất — quy tắc tính tiền và phân quyền — đã xong và đã
được chứng minh đúng. Phần còn lại là nối dây và vẽ màn hình.**

> **Vòng chạy đầu tiên của database tìm ra 9 lỗi, trong đó 4 lỗ hổng bảo mật nghiêm
> trọng.** Danh sách đầy đủ ở §11. Đáng đọc, vì nó cho thấy vì sao "SQL đã viết xong"
> và "SQL đã chạy" là hai chuyện hoàn toàn khác nhau.

---

## 2. Bốn tầng, và tầng nào đang ở đâu

```
                    ┌──────────────────────────────────┐
   ĐANG CHẠY  ✅    │  apps/mobile     React Native    │  550 dòng  ·  1 màn hình
                    │  (giao diện — CHỈ VẼ, không tính)│  dữ liệu GIẢ
                    └────────────────┬─────────────────┘
                                     │ import
                    ┌────────────────▼─────────────────┐
   ĐANG CHẠY  ✅    │  packages/core   TypeScript thuần│  1.186 dòng  ·  39/39 test
                    │  (MỌI quy tắc tính tiền)         │  0 phụ thuộc ngoài
                    └────────────────▲─────────────────┘
                                     │ import (qua bản dựng)
                    ┌────────────────┴─────────────────┐
   CHƯA CHẠY  ⛔    │  supabase/functions   Deno       │  169 dòng
                    │  (webhook nhận tiền, phía server)│  chưa deploy
                    └────────────────┬─────────────────┘
                                     │ SQL
                    ┌────────────────▼─────────────────┐
   CHƯA CHẠY  ⛔    │  supabase/migrations   Postgres  │  980 dòng SQL
                    │  (19 bảng + RLS + trigger + RPC) │  chưa chạy lần nào
                    └──────────────────────────────────┘
```

**Quy tắc phụ thuộc một chiều:** `core` không biết gì về React Native, không biết gì về
Supabase, không đọc đồng hồ, không đọc mạng. Nhờ vậy nó test được trong 2 giây và **dùng
chung được cho cả app lẫn server** — app hiện "phải trả 52 triệu" thì server ghi sổ cũng
phải ra đúng 52 triệu. Đây không phải chuyện đẹp về mặt lý thuyết: bản prototype từng có
hai bộ máy tính tiền song song, và hậu quả là xử lý xong một giao dịch mà danh sách căn hộ
vẫn báo nợ 102 triệu.

---

## 3. Cái gì THỰC SỰ chạy được hôm nay

Đây là phần quan trọng nhất của tài liệu này. Code đã viết ≠ code đã chạy.

| Thành phần | Trạng thái | Bằng chứng |
|---|---|---|
| `packages/core` | ✅ **Chạy + có test** | `npm test` → 39/39 pass, 0.16 giây |
| `apps/mobile` | ✅ **Chạy được** | `npm start` → quét QR bằng Expo Go, hiện danh sách **47 căn** (40 đã đầy · 6 trống · 1 bảo trì; 9 căn đang nợ, tổng 58.200.000đ) |
| `supabase/migrations` (5 file) | ✅ **Chạy sạch** | Dựng từ database rỗng trên PostgreSQL 16: 19 bảng, 8 enum, 12 hàm, 8 trigger, 2 view, 36 policy |
| `supabase/seed.sql` | ✅ **Chạy được** | **Hai tổ chức** khác nhau, 4 căn, 4 hợp đồng phủ cả ba mức thuê |
| `supabase/tests/` | ✅ **65/65 đạt** | `npm run db:test` — dựng lại từ số 0 rồi chạy toàn bộ |
| `supabase/functions/sepay-webhook` | ⛔ **Chưa biên dịch được** | Nó `import ... from '../_shared/core.ts'` — **file đó không tồn tại**, mới chỉ có `_shared/README.md` mô tả cách sinh ra nó, và script `npm run bundle:edge` được nhắc tới trong README cũng **chưa được viết** |
| Kết nối app ↔ Supabase | ⛔ **Chưa có** | Không có file `.env`, không có client Supabase nào trong `apps/mobile` |
| Nhắc hạn tự động | ⛔ **Chưa viết** | `core` đã có `planReminders` và `marksDueToday`, nhưng chưa có Edge Function nào gọi chúng theo giờ |

**Chạy thử database:**

```bash
npm run db:start     # supabase start
npm run db:test      # dựng lại từ số 0, chạy 65 test phân quyền
```

Bộ test dùng đúng cách Supabase nhận diện người dùng ngoài đời — `set role authenticated`
cộng `request.jwt.claims` — nên nó chạy **y nguyên, không sửa dòng nào** trên project
Supabase thật. Test phân quyền mà chỉ chạy được ở máy thì mất phân nửa giá trị.

---

## 4. Bản đồ file — từng file đang làm việc gì

### 4.1 `packages/core` — lõi nghiệp vụ (1.186 dòng)

Cửa duy nhất là `src/index.ts`. App và server **chỉ được import từ `@homescare/core`**,
không được import sâu vào đường dẫn bên trong — để sau này sắp xếp lại thư mục mà không
làm vỡ bên ngoài.

| File | Dòng | Làm gì | Câu hỏi nó trả lời |
|---|---|---|---|
| `types.ts` | 203 | Định nghĩa toàn bộ kiểu dữ liệu | "Một hợp đồng gồm những gì?" |
| `time/day.ts` | 78 | Số học ngày tháng có neo | "Vào ở 31/01 thì kỳ tháng 2 rơi ngày nào?" |
| `money/format.ts` | 59 | Định dạng + đọc tiền thành chữ | "102700000 hiện ra sao?" |
| `occupancy/occupancy.ts` | 45 | Đếm chỗ bị chiếm | "Căn này còn chỗ không?" |
| `pricing/pricing.ts` | 44 | Gợi ý giá thuê, phí dịch vụ | "Thuê lẻ 1 phòng thì bao nhiêu?" |
| `billing/schedule.ts` | 94 | Sinh toàn bộ kỳ thu của hợp đồng | "Hợp đồng này phải đóng những kỳ nào?" |
| `billing/moneyState.ts` | 126 | Gộp các kỳ thành **một trạng thái tiền** của căn | "Nhãn bên phải dòng này ghi gì, màu gì?" |
| `penalty/policy.ts` | 49 | **Toàn bộ hằng số nghiệp vụ nằm ở đây** | "Phạt bao nhiêu một ngày?" |
| `penalty/late.ts` | 69 | Tính phạt, mốc thanh lý, ai được duyệt khất | "Trễ 9 ngày thì phạt bao nhiêu?" |
| `payment/code.ts` | 109 | Sinh mã thanh toán có **ký tự kiểm tra** | "Nội dung chuyển khoản ghi gì?" |
| `payment/vietqr.ts` | 95 | Dựng payload VietQR (TLV + CRC-16) | "Vẽ QR từ chuỗi nào?" |
| `payment/reconcile.ts` | 137 | Đối chiếu tiền vào với phiếu đang mở | "Giao dịch này có tự ghi nhận được không?" |
| `payment/reminders.ts` | 53 | Lịch nhắc D-3 → D+3 | "Hôm nay phải bắn tin cho ai?" |

**Một điều đáng chú ý ở `penalty/policy.ts`:** mọi con số nghiệp vụ tập trung đúng một chỗ.

```ts
export const LATE_POLICY = {
  feePerDay:          100_000,   // phạt mỗi ngày
  graceDays:          2,         // ân hạn, chưa phạt đồng nào
  feeCapPerPeriod:    1_000_000, // trần mỗi kỳ
  terminateAfterDays: 15,        // mốc chuyển quy trình thanh lý
  depositReturnDays:  10,        // hoàn cọc
  managerApproveMaxDays: 7,      // quản lý tự duyệt khất tới mức này
};
export const PENALIZED_INVOICE_TYPES = ['RENT'] as const;   // ← dòng này quan trọng
```

Dòng cuối là kết quả của một lỗi thật: ban đầu phạt cả phí dịch vụ, và vì phí dịch vụ tới
hạn ngày 1 hàng tháng nên **23/200 căn bị đẩy vào trạng thái thanh lý** chỉ vì quên đóng
700k. Sau khi giới hạn phạt cho riêng tiền nhà: còn 2 căn. Đổi chính sách thì sửa đúng file
này, không đi lùng trong giao diện.

### 4.2 `apps/mobile` — giao diện (550 dòng)

| File | Dòng | Làm gì |
|---|---|---|
| `App.tsx` | 167 | Màn danh sách căn hộ: tìm kiếm + hai tab "Tất cả" / "Việc cần làm" |
| `src/data/demo.ts` | 151 | **Dữ liệu giả**, gieo bằng bộ sinh số có hạt cố định |
| `src/features/units/UnitRow.tsx` | 117 | Một dòng căn hộ — **thành phần khuôn mẫu** cho mọi thành phần sau |
| `src/theme/tokens.ts` | 74 | Bảng màu sáng/tối, khoảng cách, cỡ chữ |
| `src/theme/statusStyle.ts` | 32 | Nối trạng thái nghiệp vụ → màu |
| `src/theme/useTheme.ts` | 9 | Chọn bảng màu theo chế độ máy |

`UnitRow.tsx` là **khuôn mẫu** vì nó thể hiện bốn quy tắc mà mọi thành phần sau phải theo:

1. **Hai trục trạng thái độc lập.** Dải màu bên trái = tình trạng nhà (`Trống` / `Còn chỗ` /
   `Đã đầy` / `Bảo trì`). Nhãn bên phải = trạng thái tiền (8 trạng thái). Căn "đã đầy" vẫn
   có thể "đang nợ" — gộp một trục thì mất thông tin.
2. **Không tự tính tiền.** Mọi con số do `@homescare/core` tính.
3. **Không tự chọn màu.** Hỏi bảng tra `moneyTone` / `unitTone`. Nếu không, thêm một trạng
   thái mới là phải đi sửa năm chỗ và chắc chắn sót một chỗ.
4. **Không đọc đồng hồ.** `today` truyền từ trên xuống, để test cố định được.

`demo.ts` cố ý tách hẳn một file: **khi nối API thật thì xoá file này, màn hình không phải
sửa gì.** Đó cũng là lý do màn hình nhận dữ liệu qua props chứ không tự đi lấy.

### 4.3 `supabase` — database + server (1.149 dòng)

| File | Dòng | Chứa gì |
|---|---|---|
| `0001_schema.sql` | 302 | **19 bảng** + 8 kiểu enum |
| `0002_rules.sql` | 195 | 9 hàm, 6 trigger, 2 view — quy tắc bất biến ở tầng DB |
| `0003_rls.sql` | 245 | 5 hàm trợ giúp + **32 chính sách phân quyền** |
| `0004_rpc.sql` | 95 | `next_doc_seq`, `settle_request`, `log_event` |
| `0005_storage.sql` | 143 | 3 bucket riêng tư (ảnh CCCD / bàn giao / bill) + 4 chính sách + lịch xoá |
| `functions/sepay-webhook/index.ts` | 169 | Nhận biến động số dư, đối soát, ghi sổ |

**19 bảng, nhóm theo việc:**

```
Tổ chức & người      orgs · profiles · memberships
Bất động sản         zones · towers · units · rooms
Cho thuê             contracts · contract_rooms · occupants
Thu tiền             payment_periods · payment_extensions · bank_accounts
                     payment_requests · payment_request_lines
Tiền thật vào        bank_transactions · payments · receipts
Dấu vết              audit_logs
```

**Ba quy tắc được cắm thẳng vào database, không nằm ở app** — vì ai cũng gọi được REST API
của Supabase bằng anon key, nên "app không hiện nút đó" không phải là bảo mật:

- `contract_rooms_check_capacity()` dùng `SELECT ... FOR UPDATE` để **hai người cho thuê
  cùng một phòng cùng lúc thì một người phải thua**. Kiểm tra trong app không chặn được
  chuyện này.
- Bảng `payments` **cố ý không có policy `UPDATE` và `DELETE`**. Mặc định của RLS là cấm,
  nên tiền đã ghi thì không sửa, không xoá. Ghi sai thì ghi khoản đối ứng.
- Trigger `audit_no_update` chặn sửa/xoá nhật ký ngay ở database, kể cả với tài khoản quyền
  cao nhất.

---

## 5. Bốn luồng dữ liệu, truy từ đầu tới cuối

### Luồng A — Vẽ một dòng căn hộ ✅ *đang chạy*

```
demo.ts                     dựng Unit + Contract
   │
   ├─→ buildSchedule(contract, today, paidOf)   sinh mọi kỳ RENT + SERVICE
   │      └─ HỎI paidOf(key) xem kỳ nào đã đóng, KHÔNG TỰ ĐOÁN
   │
   ├─→ computeUnitState(unit, contracts)        đếm chỗ bị chiếm → empty/partial/full
   │
   └─→ computeMoneyState({schedule, today})     gộp mọi kỳ → 1 trạng thái
          └─ ưu tiên: bill > term > wait > ext > late > soon > ok
                  │
                  ▼
           UnitRow.tsx  →  moneyTone[kind]  →  màu + nhãn
```

Điểm mấu chốt: `buildSchedule` **hỏi** sổ thanh toán chứ không suy đoán. Toàn hệ thống chỉ
có **một** nguồn sự thật về "kỳ này đã đóng chưa".

### Luồng B — Sinh mã + QR ✅ *lõi xong*, ⛔ *chưa có màn hình*

```
makePaymentCode(1, 16/09/2026)  →  "HC2609GD92T"
                                    ││ ││  ││  └ ký tự KIỂM TRA
                                    ││ ││  └──── 4 ký tự xáo từ số thứ tự
                                    ││ └└─────── YYMM — đọc sao kê bằng mắt còn biết tháng
                                    └└────────── tiền tố cố định
       │
       ▼
buildVietQR({bank, số TK, số tiền, nội dung: mã})  →  payload EMVCo TLV + CRC-16
```

Ba mã liên tiếp thật sự sinh ra: `HC2609GD92T` · `HC26098KXKG` · `HC26090TJ4Q` — cố ý
**không liền nhau**. Số chứng từ thì ngược lại, vẫn đọc được bằng mắt: `PT-202609-0009`.

**Vì sao không dùng `PT-202609-001` như ban đầu bạn đề xuất:** mã tuần tự thì gõ nhầm một
ký tự vẫn ra một mã hợp lệ của **kỳ người khác**, và tiền âm thầm vào sai sổ. Ký tự kiểm tra
bắt được hơn 95% lỗi gõ nhầm một ký tự. Bảng chữ cũng bỏ `I`, `L`, `O`, `U` vì đọc dễ nhầm.

### Luồng C — Tiền vào → tự ghi nhận ⛔ *đã viết, chưa chạy*

```
SePay  ──POST──▶  Edge Function (server)
                     1. safeEqual(khoá)          sai → 401, không xử lý gì
                     2. INSERT bank_transactions GHI NGUYÊN BẢN TRƯỚC
                        └ UNIQUE(provider, tx_id) chặn ghi trùng khi SePay gửi lại
                     3. reconcile(tx, phiếu đang mở)   ← ĐÚNG hàm mà app dùng
                     4. kind === 'PAID' ?  settle_request()  :  vào hàng đợi ngoại lệ
                     5. INSERT audit_logs        luôn luôn, khớp hay không khớp
```

**`reconcile` trả 6 kết quả, chỉ 2 kết quả được tự ghi sổ:**

| Kết quả | Nghĩa | Tự ghi? |
|---|---|---|
| `PAID` | đúng mã, đúng tài khoản, đúng số tiền | ✅ |
| `DUPLICATE` | webhook gửi lại | ✅ *(bỏ qua)* |
| `PARTIAL` | chuyển thiếu | ⛔ người xử lý |
| `OVERPAID` | chuyển dư | ⛔ |
| `MULTI_PERIOD` | trả gộp nhiều kỳ | ⛔ đề xuất phân bổ, chờ duyệt |
| `UNMATCHED` | không tìm ra mã | ⛔ |

Quy tắc cứng, đã có test: **lệch tiền thì không bao giờ tự ghi nhận, dù lệch 1.000đ.** Máy
đoán sai một lần là người quản lý mất niềm tin vào mọi con số còn lại.

### Luồng D — Nhắc hạn ⛔ *lõi xong, chưa có ai gọi*

```
marksDueToday(hạn, hôm nay, đã đóng?)  →  [D-3] [D0] [D+1] [D+3]
       └ trả rỗng ngay khi đã thanh toán — không nhắc người đã đóng tiền
```

`core` đã sẵn sàng. Còn thiếu một Edge Function chạy theo giờ để hỏi nó mỗi sáng.

---

## 6. Ba quyết định kiến trúc đáng nhớ nhất

**1. Một nguồn sự thật về tiền.** `buildSchedule` không bao giờ tự đoán kỳ nào đã đóng — nó
nhận vào một hàm `paidAmountOf(key)` và hỏi. Prototype từng có hai bộ máy song song và kết
quả là màn hình nói một đằng, sổ sách nói một nẻo.

**2. Không có đồng hồ toàn cục.** Mọi hàm trong `core` nhận `today` làm tham số. Không hàm
nào gọi `new Date()` để lấy "bây giờ". Nhờ vậy test cố định được, và demo cho khách xem hai
lần không ra hai con số khác nhau.

**3. Lõi thuần, dùng chung cho cả app lẫn server.** Đây là lý do `core` không có phụ thuộc
ngoài nào. Nếu app tính một kiểu và server tính một kiểu, sai lệch sẽ xuất hiện đúng vào lúc
tệ nhất — lúc đang có tiền thật trong tài khoản.

---

## 7. Đang tới bước nào

| Phần | Tiến độ | Còn thiếu gì |
|---|---|---|
| Quy tắc nghiệp vụ (`core`) | ██████████ 100% | — |
| Test lõi | ██████████ 100% | 39/39 đạt |
| Lược đồ database | ██████████ 100% | Chạy sạch từ database rỗng; có seed hai tổ chức |
| Phân quyền RLS | ██████████ 100% | 65/65 test đạt, chạy được cả trên Supabase thật |
| Webhook nhận tiền | ██████░░░░ 60% | Thiếu `_shared/core.ts` + script `bundle:edge`; chưa deploy |
| Giao diện | ██░░░░░░░░ 20% | 1/8 màn hình; chưa có điều hướng |
| Nối app ↔ database | ░░░░░░░░░░ 0% | Chưa bắt đầu |
| Nhắc hạn tự động | ░░░░░░░░░░ 0% | Chưa bắt đầu |
| Gửi QR qua Zalo | ░░░░░░░░░░ 0% | Còn vướng: Zalo **cấm QR trong ảnh mẫu ZNS** |

---

## 8. Việc tiếp theo, đúng thứ tự

Thứ tự này không tuỳ tiện — mỗi việc mở khoá cho việc sau.

~~1. Chạy 5 file migration~~ · ~~2. Viết test RLS~~ — **xong 24/09/2026.**

1. **Bạn tự chạy thử database.** `npm run db:start` rồi `npm run db:test`, và mở Studio ở
   `localhost:54323` xem dữ liệu mẫu. Đây là việc kế tiếp, và là việc của bạn — tôi đã
   chạy ở môi trường của tôi, nhưng cho tới khi nó chạy trên máy bạn thì vẫn chưa chắc.
2. **Viết script `bundle:edge` + deploy webhook.** Vá chỗ đang không biên dịch được.
3. **Nối app vào Supabase** — thay `demo.ts` bằng lớp gọi API. Màn hình không phải sửa.
4. **Thêm điều hướng + màn chi tiết căn.** Hiện bấm vào một dòng không có gì xảy ra.
5. **Màn tạo yêu cầu thanh toán + hiện QR.**
6. **Edge Function nhắc hạn chạy theo giờ.**
7. **Diễn tập khôi phục sao lưu.** Bản sao lưu chưa từng khôi phục thử thì coi như chưa có.

---

## 9. Đang chờ bạn trả lời

Mấy câu này **chặn việc**, không phải hỏi cho đủ thủ tục.

~~Q13 (số tầng)~~ · ~~Q12 (mã căn có đổi không)~~ · ~~Q11/Q16 (ở ghép)~~ — **đã trả lời
24/09/2026 và đã cắm vào lược đồ.** Xem §12.

| # | Câu hỏi | Chặn cái gì |
|---|---|---|
| S1 | Đăng nhập bằng gì — OTP SMS hay email + mật khẩu? | Chặn mọi việc liên quan tài khoản. OTP tiện hơn nhưng tốn phí mỗi lần |
| S2 | Quản lý nghỉ việc thì quy trình thu hồi ra sao? | Xoá `memberships` là mất quyền, nhưng phiên đang mở vẫn sống tới khi token hết hạn |
| S3 | Giữ ảnh CCCD bao lâu sau khi khách trả phòng? | Đang mặc định **90 ngày** (10 ngày hoàn cọc + đệm tranh chấp) |

**Và một câu không phải kỹ thuật, nhưng quan trọng hơn cả sáu câu trên:**

> Mỗi tháng, người quản lý mất bao nhiêu thời gian **nhắc khách đóng tiền**, so với bao nhiêu
> thời gian **dò sao kê đối soát**?

Toàn bộ thiết kế hiện tại đang đặt cược rằng đối soát mới là nút thắt. Nếu thực tế là nhắc
mới tốn thời gian, thì bản MVP này **chuyển nút thắt chứ không gỡ nút thắt** — vì quản lý
vẫn phải tự tay gửi ~200 mã QR mỗi tháng. Câu này cần đo bằng đồng hồ trong một tháng, không
đoán được bằng code.

---

## 10. Chỗ dễ hỏng nhất, để biết mà canh

| Chỗ | Vì sao dễ hỏng |
|---|---|
| Ngày tháng | Tháng ngắn, năm nhuận, múi giờ. Đã có `addMonthsAnchored` + test, **đừng tự viết lại bằng `setMonth`** |
| Hai bộ máy tiền | Bệnh đã mắc một lần. Bất kỳ ai thêm một chỗ tính nợ thứ hai là bệnh tái phát |
| Khoá bí mật lọt vào app | Bản build React Native giải nén ra là đọc được. CI đã quét (`check:secrets` + gitleaks), nhưng vẫn phải quét cả bản build trước khi phát hành |
| `_shared/core.ts` sửa tay | Nó là **file sinh ra**. Sửa tay = có hai bộ quy tắc tiền khác nhau |
| Chính sách RLS | ~~Chưa có test~~ → giờ có 65 test. Thêm view mới mà quên `security_invoker` thì hỏng ở `20_isolation.sql` |
| View mới | Mỗi view thêm vào **phải** có `with (security_invoker = true)`, nếu không nó thành cửa hậu đi vòng qua RLS |
| Hàm `security definer` mới | Viết xong thì việc tiếp theo là `revoke ... from public, anon` — Postgres mặc định cho PUBLIC gọi |

---

## 11. Vòng chạy database đầu tiên tìm ra gì

5 file SQL chạy **sạch ngay lần đầu** — không lỗi cú pháp nào. Nhưng "chạy được" không
phải là "đúng". Khi có database thật để hỏi, và có 65 test để hỏi thay, thì lộ ra 9 lỗi.

**Bốn lỗ hổng bảo mật:**

| Lỗ hổng | Chuyện gì sẽ xảy ra | Đã vá thế nào |
|---|---|---|
| **Hàm RPC ai gọi cũng được** | Postgres mặc định cấp `EXECUTE` cho `PUBLIC`, PostgREST phơi mọi hàm trong `public` thành endpoint. Cộng lại: **bất kỳ ai cầm anon key — thứ nằm sẵn trong bản build app, giải nén là đọc được — đều gọi được `settle_request` và tự ghi nhận "đã thanh toán" cho một phiếu bất kỳ, không cần đăng nhập.** `security definer` làm nặng thêm vì hàm chạy bỏ qua RLS | `revoke all ... from public, anon, authenticated`, chỉ `grant` cho `service_role` |
| **View đi vòng qua RLS** | View mặc định chạy bằng quyền NGƯỜI TẠO (vai chạy migration — vai bỏ qua RLS). Mọi policy khoá bảng `units` rất kỹ, nhưng `select * from units_sorted` đọc được **toàn bộ căn hộ của mọi chủ nhà** | `with (security_invoker = true)` trên cả hai view |
| **`doc_counters` nằm trần** | Chưa bật RLS → ai cũng đọc được tháng này phát bao nhiêu phiếu thu, và tệ hơn, `UPDATE last_no` để ép số chứng từ trùng nhau | Bật RLS, không tạo policy nào |
| **Vai không xét theo tổ chức** | `has_role('MANAGER')` chỉ hỏi "người này làm quản lý ở đâu đó không" — một người làm quản lý cho chủ A mang theo vai đó khi đụng dữ liệu của chủ B | Thêm `and m.org_id = auth_helpers.my_org()` |

**Ba lỗi làm sai số tiền hoặc kẹt nghiệp vụ:**

| Lỗi | Hậu quả | Đã vá |
|---|---|---|
| **Trigger cập nhật kỳ thu bị chính RLS chặn** | Quản lý ghi một khoản tiền mặt → trigger chạy dưới quyền quản lý → `payment_periods` không có policy UPDATE → **cập nhật 0 hàng, không báo lỗi**. Tiền vào sổ, kỳ thu vẫn OPEN, danh sách vẫn báo nợ. Đúng bệnh "hai bộ máy tiền" của prototype v1.8, lần này núp dưới một dòng RLS | `periods_recalc()` thành `security definer` |
| **Hợp đồng nháp né được kiểm tra sức chứa** | Chỉ đếm hợp đồng `ACTIVE`. Hai quản lý cùng làm hợp đồng nháp cho một phòng → cả hai lọt → cả hai bấm ký → phòng 2 chỗ có 4 người, phát hiện ra đúng ngày khách dọn tới | Đếm cả `DRAFT`, cộng thêm một trigger kiểm lại lúc chuyển sang `ACTIVE` |
| **Phiếu ghi nhận được hai lần** | `settle_request` không kiểm trạng thái. Khách chuyển hai lần cùng nội dung → hai giao dịch khác nhau cùng khớp một phiếu → ghi tiền hai lần. Ràng buộc `UNIQUE` trên `bank_transactions` không cứu được, vì đó là hai giao dịch thật sự khác nhau | `select ... for update` rồi chặn nếu đã `SETTLED` |

**Hai nút chết:**

- **Không ai tạo nổi toà nhà đầu tiên.** `zones` và `towers` không có policy ghi nào, kể cả
  cho chủ nhà. Hệ quả thực tế không phải "an toàn hơn" mà là service_role key sẽ bị đem ra
  dùng cho việc thường ngày. → Thêm policy ghi ở mức `OWNER`.
- **Tạo được phiếu nhưng không gắn được kỳ nào vào phiếu.** `payment_request_lines` thiếu
  policy `INSERT`, nên mọi phiếu đều rỗng. → Thêm policy, chỉ cho gắn vào phiếu còn `DRAFT`.

### Và bốn test tự lừa chính nó

Đáng ghi lại vì nó là cái bẫy dễ mắc nhất khi viết test RLS:

> **RLS chặn `UPDATE`/`DELETE` bằng cách LỌC HÀNG ĐI, không báo lỗi.**
> `delete from payments` bị chặn hoàn toàn vẫn "thành công" — nó chỉ xoá 0 hàng.

Bốn test đầu tiên của tôi bắt lỗi, nên chúng "đạt" trong khi chẳng kiểm được gì. Một test
khác còn tệ hơn: nó thử sửa nhật ký trong lúc bảng nhật ký **đang rỗng** — trigger
`FOR EACH ROW` không chạy khi không có hàng nào, nên test đạt một cách hoàn toàn rỗng tuếch.

Khung test giờ có ba hàm riêng cho ba kiểu chặn: `rows_as` (lọc hàng), `err_as` (báo lỗi),
`affected_as` (số hàng thật sự đụng tới). Dùng nhầm hàm là tự viết một test luôn đạt.

---

## 12. Ba quyết định đã chốt ngày 24/09/2026

**Mã căn.** `[Toà].[tầng 2 số][căn 2 số]` → `S203.0624` = toà S203, tầng 06, căn 24.
Tầng và số căn **luôn đệm 0 hai chữ số** — đây không phải chuyện thẩm mỹ: không đệm thì
`1512` là tầng 15 căn 12 hay tầng 1 căn 512, và không có cách nào biết chắc.

**Mã căn không bao giờ đổi.** Vì vậy nó được in lên hợp đồng giấy, phiếu thu và nội dung
chuyển khoản. Có trigger `units_code_frozen` chặn sửa `tower_id`/`floor`/`unit_no`: nếu
về sau ai đó sửa cho "gọn", mọi chứng từ đã in sẽ trỏ vào một căn khác, và giấy thì không
tự cập nhật. Nhập sai lúc tạo thì xoá căn và tạo lại, khi nó chưa có hợp đồng.

**Ba mức thuê linh hoạt**, tính tiền theo đúng mức đã thuê:

| Muốn thuê | Ghi vào `contract_rooms` | `contract_scope()` trả |
|---|---|---|
| 1 chỗ trong phòng 2 chỗ | một dòng `SHARED`, `slots_held = 1` | `SLOT` |
| bao trọn 1 phòng | một dòng `EXCLUSIVE` | `ROOM` |
| bao cả nhà | `EXCLUSIVE` cho **mọi** phòng của căn | `UNIT` |

Cố ý **không** thêm cột `scope` trên `contracts`: một cột như vậy có thể ghi `'UNIT'`
trong khi bảng chỉ có 2/3 phòng, và lúc đó không biết tin bên nào. Mức thuê được suy ra.
