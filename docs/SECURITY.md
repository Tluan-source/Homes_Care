# Bảo mật

Tài liệu này liệt kê **đã làm gì**, **chưa làm gì**, và **ai chịu trách nhiệm**.
Phần "chưa làm" viết ra để không ai tưởng là đã xong.

Mô hình mối đe doạ ngắn gọn: app này giữ **ảnh CCCD**, **số tài khoản ngân hàng**,
**số điện thoại** và **dòng tiền** của vài trăm hộ. Kẻ tấn công đáng lo nhất không phải
hacker giỏi — mà là (1) một quản lý cũ đã nghỉ việc còn giữ tài khoản, (2) một người
nhặt được URL ảnh CCCD, (3) chính lập trình viên vô tình nhét khoá bí mật vào bản build.

---

## 1. Ranh giới cứng — khoá bí mật

| Thứ | Ở đâu | KHÔNG BAO GIỜ ở đâu |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | nhúng trong app — **không sao** | |
| `SUPABASE_SERVICE_ROLE_KEY` | biến môi trường của Edge Function | **mã React Native** |
| `SEPAY_WEBHOOK_SECRET` | biến môi trường của Edge Function | **mã React Native** |
| Bất kỳ khoá ký nào | server | **mã React Native** |

**Vì sao anon key nhúng được mà service_role thì không:** anon key chỉ là "tôi là một
người dùng chưa đăng nhập" — mọi truy vấn vẫn đi qua RLS. `service_role` **bỏ qua toàn bộ
RLS**; lộ nó là mất sạch dữ liệu của mọi chủ nhà.

**Bản build React Native giải nén ra là đọc được.** Coi mã app là công khai. Không có
cách nào "giấu" một chuỗi trong app.

> Chưa dựng: bước CI quét chuỗi `service_role` và `SEPAY_` trong `apps/`. Xem §6.

---

## 2. Phân quyền — ở database, không ở giao diện

Toàn bộ quy tắc ai-thấy-gì nằm trong `supabase/migrations/0003_rls.sql`, không nằm trong
app. Lý do: ai cũng gọi thẳng được REST API của Supabase bằng anon key. **"App không hiện
nút đó" không phải là bảo mật.**

Hai quy tắc xuyên suốt:

**Tiền của ai, sổ của người đó.** Chủ khu S không đọc được doanh thu khu M. Áp ở
`p_bank_accounts_read`, `p_bank_tx_read`, và qua `auth_helpers.my_towers()`.

**Người ghi nhận ≠ người duyệt.**
- Ghi tay một khoản tiền: `recorded_by` bắt buộc bằng `auth.uid()` — không ghi hộ người khác.
- Duyệt xin khất = miễn phạt, nên là quyền đụng tiền: quản lý chỉ tự duyệt khi dời
  **≤ 7 ngày**, quá thì phải chủ nhà. Ngưỡng này nằm ở **RLS**, không ở app.
- Gán vai (`memberships`): chỉ `OWNER`. Quản lý không tự nâng quyền cho mình được.

**Không sửa, không xoá dữ liệu tiền.** Bảng `payments` cố ý **không có** policy
`UPDATE`/`DELETE` — mặc định của RLS là cấm. Ghi sai thì ghi khoản đối ứng, không xoá.

**Nhật ký chỉ ghi thêm.** Trigger `audit_no_update` chặn `UPDATE`/`DELETE` ngay ở
database, kể cả với người có quyền cao.

---

## 3. Ảnh CCCD — chỗ nhạy cảm nhất

Ảnh CCCD đủ để mạo danh một người: mở tài khoản ngân hàng, vay tín chấp, đăng ký SIM.
**Rò rỉ một thư mục ảnh CCCD nặng hơn rò rỉ toàn bộ số liệu doanh thu.**

Đã làm (`0005_storage.sql`):

- Bucket đặt `public = false`, và lệnh `on conflict do update` **ép về private** kể cả
  khi ai đó lỡ bật public qua giao diện Supabase.
- Truy cập chỉ qua **signed URL có hạn**, không có URL cố định. App phải gọi
  `createSignedUrl(path, 60)` mỗi lần xem; đừng cache URL đó.
- Quyền xem suy từ quyền xem hợp đồng, nhờ quy ước đường dẫn
  `id-docs/{contract_id}/{occupant_id}-front.jpg`. Tên file hỏng → trả `null` → **từ chối**.
  Mặc định là từ chối, không phải cho phép.
- **Không có policy UPDATE** — không cho ghi đè. Ghi đè là cách âm thầm thay bằng ảnh
  người khác mà không để lại dấu.
- Xoá: chỉ `OWNER`.
- Giới hạn 8MB và chỉ nhận `image/jpeg|png|webp` — chặn đường tải file thực thi lên.

---

## 4. Dữ liệu cá nhân — Nghị định 13/2023/NĐ-CP

Đây là **nghĩa vụ pháp lý**, không phải tuỳ chọn kỹ thuật. App xử lý dữ liệu cá nhân
(họ tên, CCCD, ngày sinh, địa chỉ thường trú, số điện thoại) của khách thuê.

Đã dựng phần kỹ thuật:

- **Lưu trữ có hạn.** Hợp đồng chuyển `ENDED`/`TERMINATED` → trigger hẹn lịch xoá ảnh
  CCCD sau **90 ngày** (10 ngày hoàn cọc + đệm cho tranh chấp). Bảng `file_retention`.
- **Đường xoá theo yêu cầu.** Policy `p_files_delete` cho `OWNER` xoá.

Chưa làm và **cần bạn quyết** (xem §8):

- **Sự đồng ý của khách thuê.** Phải có điều khoản trong hợp đồng nói rõ: thu thập gì,
  để làm gì, lưu bao lâu, ai được xem. Hợp đồng gốc hiện **không có** điều nào như vậy.
- **Thông báo khi có rò rỉ.** Nghị định buộc thông báo trong thời hạn quy định.
- **Đăng ký hồ sơ xử lý dữ liệu** với cơ quan chức năng nếu thuộc diện phải đăng ký.

> Tôi không phải luật sư. Phần này cần người có chuyên môn pháp lý rà lại trước khi
> chạy thật với dữ liệu người thật.

---

## 5. Webhook nhận tiền

Tất cả trong `supabase/functions/sepay-webhook/index.ts`, chạy **phía server**.

- **Xác thực trước khi đọc body.** Sai khoá thì trả 401 ngay, không xử lý gì.
- **So sánh khoá theo thời gian hằng số** (`safeEqual`). So bằng `===` thì thời gian
  trả lời tiết lộ dần từng ký tự — kẻ tấn công dò được khoá bằng cách đo độ trễ.
  Viết đúng tốn thêm 4 dòng, nên không có lý do gì viết sai.
- **Thông báo lỗi không nói vì sao sai** — chỉ `unauthorized`. Nói rõ là giúp người dò.
- **Chống ghi trùng bằng ràng buộc `UNIQUE` ở DB**, không bằng kiểm tra trong code.
  SePay retry tới 7 lần trong 5 giờ; hai lần retry chạy song song thì kiểm tra trong
  code vẫn lọt cả hai, chỉ `UNIQUE` mới chặn được.
- **Ghi nguyên bản trước, đối soát sau.** Mất dữ liệu gốc là mất khả năng dò lại.
- **Deploy với `--no-verify-jwt`** vì SePay không có JWT người dùng — nên chính vì thế
  việc tự xác thực ở trên là **bắt buộc**, không phải tuỳ chọn.

---

## 6. Chưa làm — danh sách thật

Viết ra để không ai tưởng đã xong.

| Việc | Mức | Ghi chú |
|---|---|---|
| **Chọn cách đăng nhập** | chặn P0 | OTP SMS? email + mật khẩu? Chưa quyết. Nếu OTP SMS thì cần nhà cung cấp và tính phí |
| **Bắt buộc 2 lớp cho OWNER** | cao | Tài khoản chủ nhà thấy toàn bộ tiền. Mất tài khoản này là mất tất cả |
| **Thu hồi phiên khi quản lý nghỉ việc** | cao | Hiện xoá `memberships` là mất quyền, nhưng phiên đang mở vẫn sống tới khi token hết hạn. Cần quy trình thu hồi rõ |
| **CI quét khoá bí mật** | cao | Đã ghi trong ARCHITECTURE §5.1 nhưng chưa dựng. Một lần sơ ý là lộ vĩnh viễn |
| **Giới hạn tần suất gọi webhook** | trung bình | Endpoint public, chưa có rate limit |
| **Rà log không rò dữ liệu** | trung bình | `console.error` đang log cả object lỗi, có thể kèm nội dung hàng dữ liệu |
| **Sao lưu và diễn tập khôi phục** | cao | Supabase có sao lưu, nhưng **chưa ai thử khôi phục bao giờ**. Bản sao lưu chưa từng khôi phục thử thì coi như chưa có |
| **Điều khoản dữ liệu cá nhân trong hợp đồng** | chặn pháp lý | Xem §4 |
| ~~Test SQL cho RLS~~ | ✅ xong | 65 test trong `supabase/tests/`, `npm run db:test`. Xem §7 |

---

## 7. Bốn lỗ hổng tìm ra ở vòng chạy database đầu tiên (24/09/2026)

Ghi lại vì cả bốn đều là **lỗi mặc định của nền tảng**, không phải lỗi ẩu. Chúng sẽ quay
lại ở bất kỳ bảng, view hay hàm nào thêm về sau, nên đây là danh sách cần kiểm mỗi lần.

**1. Hàm RPC mặc định ai gọi cũng được.** Postgres cấp `EXECUTE` cho `PUBLIC` trên mọi hàm
mới. PostgREST của Supabase phơi mọi hàm trong schema `public` thành
`POST /rest/v1/rpc/<tên>`. Cộng lại: bất kỳ ai cầm anon key — thứ nằm sẵn trong bản build
app — gọi được `settle_request` và tự ghi nhận đã thanh toán cho một phiếu bất kỳ, **không
cần đăng nhập**. `security definer` làm nặng thêm vì hàm chạy bỏ qua RLS. Với hàm
`security definer`, `REVOKE` không phải là siết thêm cho chắc — nó là tuyến phòng thủ
**duy nhất**.

> Quy tắc: viết xong một hàm `security definer` thì việc tiếp theo là thu hồi quyền của
> `PUBLIC`, trước cả khi viết test.

**2. View đi vòng qua RLS.** View mặc định chạy bằng quyền của người tạo ra nó — ở đây là
vai chạy migration, tức là vai bỏ qua RLS. Mọi policy khoá `units` rất kỹ, nhưng
`select * from units_sorted` đọc được toàn bộ căn hộ của mọi chủ nhà.

> Quy tắc: mọi view **phải** có `with (security_invoker = true)`. Có test canh.

**3. Bảng mới quên bật RLS.** `doc_counters` nằm trần trong `public`: đọc được số chứng từ
đã phát, và `UPDATE last_no` được để ép số chứng từ trùng nhau.

> Quy tắc: `create table` trong `public` thì dòng ngay sau là
> `alter table ... enable row level security`. Không có policy = cấm hết, đó là mặc định đúng.

**4. Vai không xét theo tổ chức.** `has_role()` chỉ hỏi "người này có vai đó ở đâu đó
không", nên một quản lý của chủ A mang theo vai khi đụng dữ liệu của chủ B. Các policy khác
có chặn bằng `can_see_unit()`, nhưng đó là trông cậy vào việc **mọi** policy đều nhớ ghép
thêm điều kiện — một ngày nào đó sẽ có policy quên.

### Một lỗi không phải bảo mật nhưng nguy hiểm hơn

Trigger cập nhật kỳ thu chạy dưới quyền người gây ra nó, mà `payment_periods` cố ý không có
policy `UPDATE`. Hệ quả: quản lý ghi một khoản tiền mặt → trigger cập nhật **0 hàng, không
báo lỗi** → tiền vào sổ nhưng kỳ thu vẫn `OPEN` và danh sách căn hộ vẫn báo nợ.

Đây chính là bệnh "hai bộ máy tiền" của prototype v1.8, lần này núp dưới một dòng RLS. Nó
im lặng, và im lặng là thứ đắt nhất. Đã vá bằng `security definer` cho
`periods_recalc()` — bất biến nội bộ của database thì database tự bảo trì, không phụ thuộc
quyền của người vô tình chạm vào.

---

## 8. Ba câu hỏi cần bạn quyết

1. **Đăng nhập bằng gì?** OTP SMS tiện cho quản lý (không nhớ mật khẩu) nhưng tốn phí
   mỗi lần và phụ thuộc nhà mạng. Email + mật khẩu rẻ nhưng quản lý hay quên.
2. **Quản lý nghỉ việc thì quy trình gì?** Ai bấm thu hồi, trong bao lâu, và có đổi
   tài khoản ngân hàng nhận tiền không.
3. **Giữ ảnh CCCD bao lâu sau khi khách trả phòng?** Tôi đang đặt mặc định **90 ngày**.
   Ngắn hơn thì an toàn hơn nhưng mất bằng chứng nếu có tranh chấp muộn.
