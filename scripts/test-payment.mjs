#!/usr/bin/env node
/**
 * CÔNG CỤ THỬ luồng tiền trên project STAGING — sinh sẵn mọi thứ để thử webhook.
 *
 *   node scripts/test-payment.mjs --contract <uuid> --bank-account <uuid> \
 *        --bank MB --account 0123456789 --amount 2000 [--seq 9001]
 *
 * In ra:
 *   1. SQL tạo một kỳ thu + một phiếu yêu cầu thanh toán (dán vào SQL Editor)
 *   2. Mã thanh toán + chuỗi QR VietQR (dán chuỗi vào trang tạo ảnh QR bất kỳ để quét thử)
 *   3. Body JSON giả lập SePay để gọi webhook bằng curl
 *
 * Mã và QR sinh bằng CHÍNH @homescare/core — đúng thứ app sẽ dùng. Không dùng cho production.
 */
import { makePaymentCode, buildVietQR, day, toISODate } from '@homescare/core';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
for (const k of ['contract', 'bank-account', 'bank', 'account', 'amount']) {
  if (!args[k]) { console.error(`Thiếu --${k}. Xem đầu file để biết cách dùng.`); process.exit(1); }
}

const amount = Number(args.amount);
const seq = Number(args.seq ?? 9000 + Math.floor(Math.random() * 900));
const now = new Date();
const today = day(now.getFullYear(), now.getMonth() + 1, now.getDate());
const iso = toISODate(today);
const code = makePaymentCode(seq, today);
const qr = buildVietQR({ bankId: args.bank, accountNumber: args.account, amount, content: code });
const periodId = crypto.randomUUID();
const requestId = crypto.randomUUID();

console.log(`
── 1. SQL (SQL Editor của project STAGING) ─────────────────────────────
insert into payment_periods (id, contract_id, type, due_on, period_from, period_to, amount_due)
values ('${periodId}', '${args.contract}', 'RENT', date '${iso}', date '${iso}', date '${iso}' + 30, ${amount});

insert into payment_requests (id, contract_id, doc_no, code, bank_account_id, amount, qr_payload, status)
values ('${requestId}', '${args.contract}', 'YC-TEST-${seq}', '${code}', '${args['bank-account']}',
        ${amount}, '${qr}', 'SENT');

insert into payment_request_lines (request_id, period_id, amount)
values ('${requestId}', '${periodId}', ${amount});

── 2. Mã thanh toán ─────────────────────────────────────────────────────
${code}

   Chuỗi QR (tạo ảnh rồi quét bằng app ngân hàng — phải hiện đúng số TK, ${amount}đ, nội dung ${code}):
${qr}

── 3. Body giả lập SePay (lưu thành sepay.json để curl) ────────────────
${JSON.stringify({
  id: Date.now(),
  gateway: args.bank,
  // SePay gửi giờ VN, không kèm múi giờ — giả lập đúng như vậy.
  transactionDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(now),
  accountNumber: args.account,
  code: null,
  content: `CK ${code} tien nha`,
  transferType: 'in',
  transferAmount: amount,
  referenceCode: 'FT-TEST',
  description: '',
}, null, 2)}
`);
