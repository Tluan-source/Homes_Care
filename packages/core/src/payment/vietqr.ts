/**
 * VietQR — sinh chuỗi EMVCo thật, app ngân hàng quét được.
 *
 * Không gọi API sinh ảnh QR từ bên ngoài: chuỗi này là dữ liệu, sinh tại chỗ thì app
 * chạy được cả khi mất mạng, và không gửi số tài khoản của chủ nhà sang bên thứ ba.
 */

import type { VND } from '../types.js';

export interface Bank {
  id: string;
  /** Mã BIN 6 số do NAPAS cấp — đây mới là thứ đi vào QR, không phải tên ngân hàng. */
  bin: string;
  name: string;
}

/** Thêm ngân hàng thì sửa đúng mảng này. */
export const BANKS: Bank[] = [
  { id: 'MB',   bin: '970422', name: 'MB Bank' },
  { id: 'VCB',  bin: '970436', name: 'Vietcombank' },
  { id: 'TCB',  bin: '970407', name: 'Techcombank' },
  { id: 'BIDV', bin: '970418', name: 'BIDV' },
  { id: 'VTB',  bin: '970415', name: 'VietinBank' },
  { id: 'ACB',  bin: '970416', name: 'ACB' },
  { id: 'VPB',  bin: '970432', name: 'VPBank' },
  { id: 'TPB',  bin: '970423', name: 'TPBank' },
  { id: 'STB',  bin: '970403', name: 'Sacombank' },
  { id: 'MSB',  bin: '970426', name: 'MSB' },
  { id: 'OCB',  bin: '970448', name: 'OCB' },
];

export const findBank = (id: string): Bank | undefined => BANKS.find(b => b.id === id);

/** Một trường TLV: [id 2 số][độ dài 2 số][giá trị]. */
const tlv = (id: string, v: string): string => id + String(v.length).padStart(2, '0') + v;

/**
 * CRC-16/CCITT-FALSE: khởi tạo 0xFFFF, đa thức 0x1021, KHÔNG đảo bit, KHÔNG xor cuối.
 *
 * Có cả chục biến thể CRC-16 khác nhau và chúng cho kết quả khác nhau. Dùng nhầm biến thể
 * thì app ngân hàng báo "mã không hợp lệ" mà không nói vì sao — rất khó dò. Test khoá
 * bằng vector chuẩn: CRC16("123456789") = 0x29B1.
 */
export function crc16ccitt(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface VietQRInput {
  bankId: string;
  accountNumber: string;
  amount?: VND;
  /** Nội dung chuyển khoản — chính là mã thanh toán. */
  content?: string;
}

/**
 * Payload VietQR ĐỘNG (có sẵn số tiền và nội dung).
 *
 * "Động" = điểm khởi tạo `12`, dùng một lần cho đúng kỳ này. Mã tĩnh là `11` và sẽ
 * khiến khách quét lại QR cũ tháng sau rồi chuyển đúng số tiền tháng trước.
 */
export function buildVietQR({ bankId, accountNumber, amount, content }: VietQRInput): string {
  const bank = findBank(bankId);
  if (!bank) throw new Error(`Không biết ngân hàng '${bankId}' — thêm vào BANKS trước đã`);

  const merchantAccount =
    tlv('00', 'A000000727') +                                       // GUID VietQR/NAPAS
    tlv('01', tlv('00', bank.bin) + tlv('01', accountNumber)) +
    tlv('02', 'QRIBFTTA');                                          // chuyển tới TÀI KHOẢN

  const body =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', merchantAccount) +
    tlv('53', '704') +                                              // VND
    (amount ? tlv('54', String(Math.round(amount))) : '') +
    tlv('58', 'VN') +
    (content ? tlv('62', tlv('08', content)) : '');

  const withCrcTag = body + '6304';
  return withCrcTag + crc16ccitt(withCrcTag);
}

/** Tự kiểm một chuỗi QR — dùng trong test và khi nhận chuỗi từ bên ngoài. */
export function verifyVietQR(payload: string): boolean {
  if (payload.length < 8) return false;
  return crc16ccitt(payload.slice(0, -4)) === payload.slice(-4);
}
