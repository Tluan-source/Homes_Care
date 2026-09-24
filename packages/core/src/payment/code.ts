/**
 * Mã thanh toán và số chứng từ.
 *
 * Hai thứ KHÁC NHAU, hay bị lẫn:
 *
 *  1. SỐ CHỨNG TỪ — `YC-202609-0001`, `PT-202609-0001`.
 *     Chạy tuần tự theo tháng, người đọc ra miệng khi gọi điện cho nhau. Chỉ để tra cứu.
 *
 *  2. MÃ THANH TOÁN — `HC2609K7QW5`.
 *     Nằm trong NỘI DUNG CHUYỂN KHOẢN, là khoá đối soát duy nhất.
 *
 * Vì sao mã thanh toán không dùng luôn số chứng từ tuần tự:
 * hai kỳ liền nhau ra `...-0007` và `...-0008`. Khách gõ nhầm một ký tự là tiền rơi vào
 * kỳ của người khác, và hệ thống ghi nhận NGON LÀNH vì mã đó có thật. Sai âm thầm,
 * không ai phát hiện cho tới lúc đối chiếu cuối tháng.
 *
 * Nên mã thanh toán có hai lớp bảo vệ:
 *  - phần thân được TRỘN, hai kỳ liền nhau không ra hai mã gần giống nhau;
 *  - một KÝ TỰ KIỂM TRA ở cuối, để gõ nhầm thì mã không khớp với bất cứ kỳ nào
 *    (rơi vào hàng đợi ngoại lệ) thay vì khớp nhầm kỳ của người khác.
 *
 * Mã vẫn mang YYMM để đọc sao kê ngân hàng bằng mắt còn biết là tiền của tháng nào.
 */

/** Crockford base32: bỏ I, L, O, U.
 *  I/L lẫn với 1, O lẫn với 0 khi khách đọc mã qua điện thoại; U bỏ để không vô tình
 *  sinh ra từ bậy. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIX = 'HC';
const BODY_LEN = 4;

/** Tổng kiểm tra có TRỌNG SỐ THEO VỊ TRÍ — bắt được cả gõ nhầm ký tự lẫn đảo hai ký tự.
 *  Tổng không trọng số thì đảo hai ký tự cho ra cùng kết quả, tức không bắt được. */
function checkChar(s: string): string {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ALPHABET.indexOf(s[i]);
    sum += (v < 0 ? 0 : v) * (i + 1);
  }
  return ALPHABET[sum % 32];
}

/** Trộn một số nguyên thành chuỗi base32 độ dài cố định. */
function scramble(seq: number, len: number): string {
  // Nhân với số nguyên tố lớn rồi lấy các nhóm bit khác nhau — hai seq liền nhau
  // cho ra hai chuỗi không giống nhau ở bất kỳ vị trí nào.
  let n = Math.imul(seq + 1, 2654435761) >>> 0;
  let out = '';
  for (let i = 0; i < len; i++) {
    out = ALPHABET[n % 32] + out;
    n = Math.floor(n / 32) + (seq + 1) * (i + 7);
  }
  return out;
}

/**
 * Sinh mã thanh toán cho một kỳ.
 * @param seq  số thứ tự duy nhất toàn hệ thống (id của yêu cầu thanh toán)
 * @param on   ngày lập phiếu — chỉ dùng để nhúng YYMM cho dễ đọc sao kê
 */
export function makePaymentCode(seq: number, on: Date): string {
  const yymm = String(on.getFullYear() % 100).padStart(2, '0')
             + String(on.getMonth() + 1).padStart(2, '0');
  const body = PREFIX + yymm + scramble(seq, BODY_LEN);
  return body + checkChar(body);
}

/** Mã có đúng dạng và đúng ký tự kiểm tra không. */
export function isValidPaymentCode(code: string): boolean {
  const s = code.toUpperCase();
  if (s.length !== PREFIX.length + 4 + BODY_LEN + 1) return false;
  if (!s.startsWith(PREFIX)) return false;
  for (const ch of s) if (!ALPHABET.includes(ch) && !PREFIX.includes(ch)) return false;
  return checkChar(s.slice(0, -1)) === s.slice(-1);
}

const CODE_RE = new RegExp(`${PREFIX}[${ALPHABET}]{${4 + BODY_LEN + 1}}`);

/**
 * Moi mã thanh toán ra khỏi nội dung chuyển khoản.
 *
 * Ngân hàng viết hoa, bỏ dấu và cắt ký tự đặc biệt, nên phải thử cả hai kiểu:
 * giữ khoảng trắng, rồi ép sát. "CK HC2609K7QW5" và "CKHC2609K7QW5TIENNHA" đều phải ra.
 *
 * Trả về null nếu không tìm thấy HOẶC ký tự kiểm tra sai — cố ý không "đoán gần đúng":
 * thà vào hàng đợi ngoại lệ để người xử lý, còn hơn ghi nhầm tiền của người khác.
 */
export function extractPaymentCode(content: string): string | null {
  const up = (content || '').toUpperCase();
  for (const s of [up, up.replace(/[^0-9A-Z]/g, '')]) {
    const m = s.match(CODE_RE);
    if (m && isValidPaymentCode(m[0])) return m[0];
  }
  return null;
}

/* ------------------------------------------------------------------ số chứng từ */

export type DocKind = 'YC' | 'PT';   // yêu cầu thanh toán · phiếu thu

/**
 * Số chứng từ cho người đọc: `YC-202609-0001`.
 * Bộ đếm chạy lại từ 1 mỗi tháng — đọc ra là biết ngay tháng nào, và con số không
 * phình to vô hạn theo năm.
 */
export function makeDocNo(kind: DocKind, on: Date, seqInMonth: number): string {
  const ym = `${on.getFullYear()}${String(on.getMonth() + 1).padStart(2, '0')}`;
  return `${kind}-${ym}-${String(seqInMonth).padStart(4, '0')}`;
}
