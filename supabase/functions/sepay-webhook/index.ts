/**
 * NHẬN TIỀN VÀO — Supabase Edge Function.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  HÀM NÀY PHẢI CHẠY PHÍA SERVER. KHÔNG BAO GIỜ ĐƯA LOGIC NÀY VÀO APP.     │
 * │                                                                          │
 * │  - `SUPABASE_SERVICE_ROLE_KEY` bỏ qua toàn bộ RLS. Lộ khoá này là mất     │
 * │    sạch dữ liệu. Nó chỉ được tồn tại trong biến môi trường của Edge      │
 * │    Function, KHÔNG BAO GIỜ trong mã React Native.                         │
 * │  - `SEPAY_WEBHOOK_SECRET` dùng để xác thực người gọi. Cũng vậy.           │
 * │  - Mọi thứ nhúng vào bản build React Native đều đọc ra được bằng cách     │
 * │    giải nén file app. Coi mã app là công khai.                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Triển khai:
 *   supabase secrets set SEPAY_WEBHOOK_SECRET=...
 *   supabase functions deploy sepay-webhook --no-verify-jwt
 * (`--no-verify-jwt` vì SePay gọi tới, không có JWT người dùng; ta tự xác thực bằng
 *  chữ ký ở dưới.)
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  reconcile, isAutoKind, makeDocNo,
  type BankTransaction, type OpenRequest,
} from '../_shared/core.ts';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const WEBHOOK_SECRET = Deno.env.get('SEPAY_WEBHOOK_SECRET')!;

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/** So sánh chuỗi theo THỜI GIAN HẰNG SỐ.
 *  So bằng `===` thì thời gian trả lời tiết lộ dần từng ký tự của khoá — kẻ tấn công
 *  dò được khoá bằng cách đo độ trễ. Chi phí viết đúng gần như bằng 0, nên không có
 *  lý do gì viết sai. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // --- 1. XÁC THỰC NGƯỜI GỌI trước khi đọc body.
  // SePay gửi header `Authorization: Apikey <secret>`.
  const auth = req.headers.get('authorization') ?? '';
  const key = auth.replace(/^Apikey\s+/i, '').trim();
  if (!WEBHOOK_SECRET || !safeEqual(key, WEBHOOK_SECRET)) {
    // Không nói vì sao sai — tránh giúp người dò khoá.
    return json({ error: 'unauthorized' }, 401);
  }

  let raw: Record<string, unknown>;
  try { raw = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  const tx = normalize(raw);
  if (!tx) return json({ error: 'bad payload' }, 400);

  // --- 2. GHI NGUYÊN BẢN TRƯỚC, đối soát sau.
  // Ràng buộc UNIQUE(provider, provider_tx_id) là tuyến chống ghi trùng THẬT.
  // SePay retry tới 7 lần trong 5 giờ; nếu chỉ dựa vào kiểm tra trong code thì hai
  // lần retry chạy song song vẫn lọt cả hai.
  const { data: inserted, error: insErr } = await db
    .from('bank_transactions')
    .insert({
      provider: 'sepay',
      provider_tx_id: tx.providerTxId,
      account_number: tx.accountNumber,
      amount: tx.amount,
      content: tx.content,
      reference_code: tx.referenceCode,
      occurred_at: tx.occurredAt.toISOString(),
      raw_payload: raw,
    })
    .select('id')
    .single();

  if (insErr) {
    // 23505 = unique_violation → đúng giao dịch này đã nhận rồi. Trả 200 để SePay
    // ngừng retry; trả lỗi thì nó sẽ gửi lại mãi.
    if (insErr.code === '23505') return json({ ok: true, duplicate: true });
    // Chỉ log MÃ lỗi, không log cả object: object lỗi của PostgREST có thể
    // kèm theo nội dung hàng dữ liệu (số tài khoản, tên khách) vào log.
    console.error('insert bank_transactions failed', insErr.code);
    return json({ error: 'db' }, 500);
  }
  const txId = inserted!.id as string;

  // --- 3. ĐỐI SOÁT bằng đúng hàm mà app dùng.
  // App hiện "phải trả 52 triệu", server ghi sổ cũng phải ra 52 triệu. Dùng chung
  // packages/core là cách duy nhất chắc chắn hai bên không lệch.
  const { data: rows, error: reqErr } = await db
    .from('payment_requests')
    .select('id, code, contract_id, amount, status, bank_accounts(number)')
    .in('status', ['DRAFT', 'SENT']);

  if (reqErr) { console.error('load requests failed', reqErr.code); return json({ error: 'db' }, 500); }

  const open: OpenRequest[] = (rows ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    contractId: r.contract_id,
    accountNumber: r.bank_accounts?.number ?? '',
    amount: Number(r.amount),
    due: new Date(),          // thứ tự phân bổ nhiều kỳ lấy từ due của phiếu
  }));

  const result = reconcile(tx, open);

  // --- 4. CHỈ ghi sổ khi khớp chắc. Lệch tiền thì KHÔNG BAO GIỜ tự ghi nhận.
  if (isAutoKind(result.kind) && result.kind === 'PAID' && result.request) {
    const { error } = await db.rpc('settle_request', {
      p_request_id: result.request.id,
      p_transaction_id: txId,
      p_amount: tx.amount,
      p_receipt_no: makeDocNo('PT', new Date(), await nextReceiptSeq()),
    });
    if (error) { console.error('settle failed', error.code); return json({ error: 'settle' }, 500); }
  }

  await db.from('audit_logs').insert({
    actor_type: 'SEPAY',
    action: isAutoKind(result.kind)
      ? `Đối soát khớp — ghi nhận đã thanh toán`
      : `Không tự ghi nhận được — ${result.kind}`,
    entity_type: 'bank_transaction',
    entity_id: tx.providerTxId,
    amount: tx.amount,
    meta: { kind: result.kind, code: result.code ?? null, reason: result.reason ?? null },
  });

  // Luôn trả 200 khi đã nhận và lưu được giao dịch — không khớp KHÔNG phải lỗi của
  // SePay, đó là việc của hàng đợi ngoại lệ. Trả lỗi chỉ khiến nó gửi lại vô ích.
  return json({ ok: true, kind: result.kind });
});

/** Chuẩn hoá payload của nhà cung cấp về kiểu mà core hiểu.
 *  Đổi nhà cung cấp thì chỉ sửa hàm này. */
function normalize(p: Record<string, any>): BankTransaction | null {
  const id = String(p.id ?? p.transactionId ?? '');
  const amount = Number(p.transferAmount ?? p.amount ?? 0);
  if (!id || !amount) return null;
  // Chỉ quan tâm tiền VÀO. Tiền ra không phải việc của luồng này.
  if (p.transferType && p.transferType !== 'in') return null;
  return {
    providerTxId: id,
    accountNumber: String(p.accountNumber ?? ''),
    amount,
    content: String(p.content ?? p.description ?? ''),
    referenceCode: p.referenceCode ? String(p.referenceCode) : undefined,
    occurredAt: p.transactionDate ? new Date(p.transactionDate) : new Date(),
  };
}

async function nextReceiptSeq(): Promise<number> {
  const { data } = await db.rpc('next_doc_seq', { p_kind: 'PT' });
  return Number(data ?? 1);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
