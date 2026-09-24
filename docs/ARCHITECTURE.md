# HomesCare — Kiến trúc

Tài liệu này trả lời năm câu trước khi ai đó viết dòng code đầu tiên: **mục tiêu, giao diện,
lập trình, kiểm thử, bảo trì**. Đọc file này rồi mới đọc `CONVENTIONS.md`.

---

## 1. Mục tiêu

### 1.1 Mục tiêu sản phẩm

Thay cuốn sổ và file Excel của người quản lý căn hộ cho thuê, **để không còn quên thu tiền và
không còn cãi nhau lúc trả phòng**.

Đo bằng ba con số, không đo bằng số tính năng:

| Chỉ số | Hôm nay (ước) | Đích |
|---|---|---|
| Thời gian đối soát tiền mỗi tháng | 2–4 giờ dò sao kê tay | < 15 phút, chỉ xử lý ngoại lệ |
| Số kỳ thu bị quên nhắc mỗi tháng | không ai biết | 0 — máy nhắc, không phụ thuộc trí nhớ |
| Thời gian tìm một hợp đồng cũ | vài phút lục file | < 10 giây |

### 1.2 Ranh giới — những gì sản phẩm này KHÔNG làm

Viết ra để sau này không ai âm thầm mở rộng phạm vi:

- **Không giữ tiền hộ.** Tiền chạy thẳng vào tài khoản chủ nhà; app chỉ đọc biến động số dư
  để đối soát. Thu hộ rồi chia lại là **hoạt động trung gian thanh toán, phải có giấy phép NHNN**.
- **Không phải phần mềm kế toán.** Không sổ cái, không thuế, không hoá đơn điện tử ở v1.
- **Không chạy offline.** Mọi thao tác ghi đều cần mạng (chốt với chủ dự án, Q10). Lý do ở §4.4.
- **Không marketing / không đăng tin cho thuê.**

### 1.3 Người dùng

| Vai | Làm gì hằng ngày | Thiết bị |
|---|---|---|
| **OWNER** — chủ nhà | Duyệt ngoại lệ, xem sổ quỹ của riêng mình, chốt giá | Điện thoại, thỉnh thoảng |
| **MANAGER** — quản lý | Thu tiền, tạo hợp đồng, xử lý sự vụ | Điện thoại, cả ngày |
| **STAFF** | Xem + gửi bill | Điện thoại |
| **TENANT** — khách thuê | *(pha sau)* Xem nợ của mình, quét QR | Điện thoại |

> **Nguyên tắc xuyên suốt: người ghi nhận ≠ người duyệt.** Quản lý thu tiền thì không được
> tự duyệt khoản mình thu. Quy tắc này nằm trong RLS ở tầng database, không nằm ở giao diện.

---

## 2. Giao diện

### 2.1 Nguyên tắc

Rút ra từ 20 vòng sửa bản prototype, mỗi dòng dưới đây là một lỗi đã từng mắc:

1. **Việc làm nhiều nhất phải dễ với tới nhất.** Thu tiền diễn ra 12 lần/năm mỗi căn, cho thuê
   ~1 lần/năm. Nút thu tiền nằm ngay dưới hero và theo người dùng qua mọi tab.
2. **Thu gọn được, nhưng lúc thu gọn vẫn phải đọc ra thông tin.** Gập một tòa lại mà không còn
   thấy "7 căn cần thu · 207tr" thì gập chỉ để giấu thông tin.
3. **Con số trên tab phải đúng bằng số dòng bên trong tab.** Tab ghi 18 mà bấm vào thấy 25 là
   người dùng mất niềm tin vào mọi con số khác.
4. **Không có nút chết.** Nút bấm vào ra màn hình trống còn tệ hơn không có nút.
5. **Đỏ chỉ dành cho việc phải làm hôm nay.** Nhét "sắp tới hạn" vào cùng màu đỏ với "quá hạn"
   thì con số đỏ phình lên và người ta học được cách phớt lờ nó.
6. **Nhãn phải nói rõ trễ CÁI GÌ.** "Trễ 46 ngày" trên căn 18tr/tháng làm người đọc tưởng mất
   nửa trăm triệu, trong khi thực tế là hai kỳ phí dịch vụ 700k.

### 2.2 Bộ khung màn hình

```
Đăng nhập
└── Thanh dưới 3 mục
    ├── Căn hộ      danh sách A→Z, gập theo tòa, lọc 2 trục, tìm mã/tên/SĐT
    │   └── Chi tiết căn  5 tab: tổng quan · phòng&người · hợp đồng · thu chi · ghi chú
    │       ├── Cho thuê         (5 bước)
    │       └── Yêu cầu thanh toán (2 bước → QR)
    ├── Cần xử lý   3 nhóm gập được: đã tới hạn · sắp tới hạn · ngoại lệ
    └── Sổ quỹ      tách theo từng chủ nhà
```

### 2.3 Hệ màu — hai trục độc lập

Một căn mang **hai** trạng thái không liên quan nhau, và phải nhìn thấy cả hai cùng lúc:

| Trục | Ở đâu trên dòng | Giá trị |
|---|---|---|
| **Tình trạng nhà** | dải màu bên trái | Trống · Còn chỗ · Đã đầy · Bảo trì |
| **Trạng thái tiền** | nhãn bên phải | Chưa đóng · Quá mốc thanh lý · Xin khất · Đã khất · Sắp tới hạn · Bill chờ duyệt · Đã đủ |

Trộn hai trục vào một màu là mất thông tin: một căn **đã đầy** vẫn có thể **đang nợ**.

### 2.4 Thiết kế

Tông vàng–trắng, nền trắng là chủ đạo, vùng đầu trang vàng uốn lượn. Sáng/tối đầy đủ.
Token màu nằm ở một file duy nhất (`tokens.css` ở prototype → `theme.ts` ở app thật);
**không hardcode mã màu trong màn hình**.

---

## 3. Lập trình

### 3.1 Stack

| Lớp | Công nghệ | Vì sao |
|---|---|---|
| Mobile | **React Native + Expo** (EAS Build) | 1 codebase iOS+Android, cập nhật OTA không chờ duyệt store |
| Ngôn ngữ | **TypeScript** toàn bộ | App đụng tiền; sai kiểu phải lộ lúc gõ, không phải lúc chạy |
| Backend | **Supabase** — Postgres + Auth + Storage + RLS | RLS khớp thẳng với mô hình phân quyền, và chừa sẵn cho vai khách thuê |
| Việc chạy nền | **Supabase Edge Functions** + `pg_cron` | Webhook và lịch nhắc phải chạy được khi app đóng |
| Tiền tệ | `bigint` VNĐ trong DB, `number` trong TS | VNĐ không có phần lẻ; số tiền thật < 2^53 nên `number` an toàn |
| Múi giờ | Lưu **UTC**, hiển thị **Asia/Ho_Chi_Minh** | |

### 3.2 Phân tầng — quy tắc phụ thuộc MỘT CHIỀU

```
        packages/core          ←── THUẦN. Không DOM, không mạng, không React, không Date.now()
             ▲     ▲
             │     │
   apps/mobile     supabase/functions
        (UI)          (webhook, cron)
```

**`packages/core` là tài sản giá trị nhất của dự án.** Mọi quy tắc đụng tiền nằm ở đây:
tính kỳ thu, chia tiền dịch vụ theo ngày, giá bao phòng / thuê lẻ, phạt trễ, sinh mã VietQR,
đối soát giao dịch.

Ba lý do bắt nó phải thuần:

1. **App và server dùng CHUNG một bộ quy tắc.** App hiện "phải trả 52 triệu", server ghi sổ
   cũng phải ra đúng 52 triệu. Hai nơi tự tính là sớm muộn lệch nhau — đúng cái bệnh
   đã phải vá ở prototype v1.8.
2. **Test được bằng vài object dựng tay**, không cần trình duyệt, không cần database.
3. **Đổi giao diện không phải viết lại nghiệp vụ.**

> **`core` không được import bất cứ thứ gì từ `apps/` hay `supabase/`.** Có ESLint chặn.

### 3.3 Không có đồng hồ toàn cục

Mọi hàm cần "hôm nay" đều **nhận `today` làm tham số**, không đọc `new Date()` bên trong.

```ts
lateFeeOf(due, today, ext)      // ✅
lateFeeOf(due, ext)             // ❌ tự đọc đồng hồ
```

Lý do: server chạy UTC, điện thoại chạy giờ Việt Nam. Hàm tự đọc đồng hồ thì cùng một dữ liệu
ra hai kết quả khác nhau ở hai nơi, và test thì không cố định được.

### 3.4 Một nguồn sự thật về tiền

Kỳ nào đã đóng bao nhiêu **chỉ có một chỗ trả lời**: bảng `payments` (và view `period_balances`
cộng dồn từ nó). Lịch thu **hỏi** sổ này chứ không tự suy ra.

Prototype từng có hai bộ máy tiền song song (suy từ `contract.lag` và ghi vào bảng thanh toán),
kết quả: xử lý xong một giao dịch mà danh sách căn hộ vẫn báo nợ. Đã vá ở v1.8 và ghi lại đây
để không ai dựng lại kiểu đó.

### 3.5 An toàn — ranh giới cứng

| Thứ | Ở đâu | KHÔNG BAO GIỜ ở đâu |
|---|---|---|
| `service_role` key của Supabase | Edge Function (biến môi trường) | **Không bao giờ trong mã React Native** |
| Khoá ký webhook SePay | Edge Function | **Không bao giờ trong mã React Native** |
| Xử lý webhook tiền vào | Edge Function phía server | **Không bao giờ trong app** |
| Quyền đọc/ghi dữ liệu | **RLS ở database** | Không dựa vào việc "app không hiện nút đó" |

Mọi thứ nhúng vào bản build React Native đều **đọc ra được** bằng cách giải nén file app.
Coi mã nguồn app là công khai.

### 3.6 Cấu trúc thư mục

```
product/
├── packages/core/            ← nghiệp vụ thuần, dùng chung app + server
│   ├── src/
│   │   ├── time/             ngày tháng, neo kỳ, chia theo ngày ở
│   │   ├── money/            định dạng tiền, đọc số thành chữ
│   │   ├── occupancy/        chỗ bị chiếm, trạng thái căn
│   │   ├── pricing/          giá nguyên căn / bao phòng / thuê lẻ
│   │   ├── billing/          sinh kỳ thu, trạng thái tiền
│   │   ├── penalty/          phạt trễ, mốc thanh lý, gia hạn
│   │   ├── payment/          mã thanh toán, VietQR, đối soát
│   │   └── types.ts          kiểu dùng chung
│   └── tests/                mỗi quy tắc tiền một test
├── supabase/
│   ├── migrations/           schema + RLS, đánh số tăng dần
│   ├── functions/
│   │   ├── sepay-webhook/    NHẬN TIỀN VÀO — chạy server, có xác thực chữ ký
│   │   └── run-reminders/    lịch nhắc D-3 → D+3, gọi bởi pg_cron
│   └── seed.sql
├── apps/mobile/              Expo
│   └── src/
│       ├── theme/            token màu, khoảng cách, chữ — MỘT nơi duy nhất
│       ├── ui/               nút, thẻ, nhãn — không biết gì về nghiệp vụ
│       ├── features/         gom theo NGHIỆP VỤ, không gom theo loại file
│       │   ├── units/
│       │   ├── contracts/
│       │   ├── payments/
│       │   └── ledger/
│       ├── data/             gọi Supabase, cache
│       └── app/              điều hướng
└── docs/
```

**Gom theo nghiệp vụ, không gom theo loại file.** Sửa một thứ nhỏ trong luồng thu tiền thì
mọi file cần sửa nằm trong `features/payments/`, không phải rải ở `screens/`, `hooks/`,
`utils/`, `types/`.

---

## 4. Kiểm thử

### 4.1 Ba tầng, ba mục đích khác nhau

| Tầng | Kiểm cái gì | Chạy bằng | Bắt buộc ở đâu |
|---|---|---|---|
| **Unit — `core`** | quy tắc nghiệp vụ | `node --test` | **Mọi hàm đụng tiền** |
| **DB** | RLS, constraint, trigger | `pgTAP` / script SQL | Mọi policy, mọi ràng buộc chiếm chỗ |
| **Luồng** | bấm hết một luồng | Maestro / Detox | 4 luồng xương sống ở §4.3 |

### 4.2 Quy tắc: mọi hàm đụng tiền phải có test

Không phải "cố gắng đạt 80% coverage" — mà là: **hàm nào tính ra một con số tiền, hàm đó phải
có test**. Danh sách hiện tại, đã xanh ở prototype và mang sang:

- neo ngày đóng tiền không trôi khi gặp tháng ngắn
- chia tiền dịch vụ tháng đầu theo số ngày ở, tính cả ngày vào
- đọc số thành chữ (lăm / mốt / linh)
- giá bao phòng vs thuê lẻ
- đếm chỗ bị chiếm (bao phòng khoá trọn phòng dù ở ít người)
- CRC VietQR đúng biến thể CCITT-FALSE
- 7 quy tắc đối soát, kể cả webhook gửi lại
- ân hạn 2 ngày, trần 1 triệu, miễn phạt khi được duyệt khất
- mốc thanh lý 15 ngày

### 4.3 Bốn luồng xương sống

Hỏng một trong bốn luồng này là app vô dụng, nên chúng có test luồng riêng:

1. Đăng nhập → thấy đúng danh sách căn theo quyền của mình
2. Cho thuê một căn trống → hợp đồng tồn tại → kỳ thu được sinh ra
3. Tạo yêu cầu thanh toán → QR quét ra đúng số tiền → webhook khớp → phiếu thu sinh ra
4. Giao dịch lệch tiền → vào hàng đợi ngoại lệ → người xử lý → trạng thái căn đổi theo

### 4.4 Chỗ chỉ database mới kiểm được

Hai quản lý cùng cho thuê một phòng trong cùng một giây. Không giao diện nào chặn được,
không unit test nào bắt được. **Phải là constraint + trigger ở tầng DB**, và phải có test SQL
chạy hai transaction song song.

Đây cũng là lý do sản phẩm **online-only**: với chế độ offline, hai máy có thể cùng ghi rồi
đồng bộ sau, và lúc đó không còn tuyến phòng thủ nào.

---

## 5. Bảo trì

### 5.1 Chỗ nào dễ hỏng nhất

| Rủi ro | Cách chặn |
|---|---|
| App và server tính ra hai số tiền khác nhau | Dùng chung `packages/core`. ESLint chặn app tự tính tiền |
| Thêm tính năng làm sai quy tắc tiền cũ | Test `core` chạy trong CI, không merge được nếu đỏ |
| Quên xoá bộ nhớ đệm sau khi ghi tiền | Hàm ghi tiền tự lo xoá đệm, người gọi không phải nhớ |
| Ai đó nhét khoá bí mật vào app | CI quét chuỗi `service_role` và khoá SePay trong `apps/` |
| Sửa schema làm hỏng dữ liệu cũ | Migration đánh số tăng dần, không sửa file cũ, chỉ thêm file mới |

### 5.2 Đổi quy tắc nghiệp vụ thì sửa ở đâu

Đây là bảng tra cứu cho lần sửa nhỏ — thứ hay mất nhiều thời gian nhất không phải là sửa,
mà là **tìm chỗ để sửa**:

| Muốn đổi | Sửa file |
|---|---|
| Mức phạt, ân hạn, trần, mốc thanh lý | `core/penalty/policy.ts` |
| Mốc nhắc D-3 / D0 / D+1 / D+3 | `core/payment/reminders.ts` |
| Cách tính giá thuê lẻ | `core/pricing/` |
| Ngày neo kỳ thu | `core/time/schedule.ts` |
| Ngân hàng hỗ trợ VietQR | `core/payment/banks.ts` |
| Màu sắc, khoảng cách, cỡ chữ | `apps/mobile/src/theme/` |
| Ai được thấy dữ liệu gì | `supabase/migrations/*_rls.sql` |

**Hằng số nghiệp vụ không được rải rác.** Mọi con số có ý nghĩa nghiệp vụ (100.000đ/ngày,
2 ngày ân hạn, 15 ngày thanh lý, 10 ngày hoàn cọc, 7 ngày quản lý tự duyệt) nằm trong
**một object duy nhất** ở `core/penalty/policy.ts`, có chú thích điều khoản hợp đồng tương ứng.

### 5.3 Quy ước đọc code

- Chú thích giải thích **VÌ SAO**, không giải thích **LÀM GÌ**. Code đã nói nó làm gì rồi.
- Chỗ nào từng sai thì ghi lại cái sai đó ngay tại chỗ, để người sau không dựng lại.
- Tên hàm bằng tiếng Anh, chú thích bằng tiếng Việt — người bảo trì đọc tiếng Việt nhanh hơn.

### 5.4 Migration

Một migration = một file, đánh số tăng dần, **không bao giờ sửa file đã chạy trên production**.
Muốn đổi thì thêm file mới. Mỗi file có phần `-- rollback:` ghi cách quay lui.
