/**
 * NHẬN TIỀN VÀO — Supabase Edge Function, SePay gọi tới mỗi khi có biến động số dư.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  HÀM NÀY PHẢI CHẠY PHÍA SERVER. KHÔNG BAO GIỜ ĐƯA LOGIC NÀY VÀO APP.     │
 * │  `SUPABASE_SERVICE_ROLE_KEY` bỏ qua toàn bộ RLS; `SEPAY_WEBHOOK_SECRET`  │
 * │  xác thực người gọi. Cả hai chỉ sống trong biến môi trường của hàm này.  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Triển khai: xem docs/DEPLOY.md §4.
 *
 * LUỒNG — và vì sao mỗi bước an toàn khi SePay gửi lại (retry tới 7 lần / 5 giờ):
 *
 *   1. Xác thực          sai khoá → 401, không đọc body
 *   2. LƯU nguyên bản    UNIQUE(provider, provider_tx_id); trùng thì lấy lại hàng cũ
 *   3. Đã XỬ LÝ chưa?    processed_at có rồi → 200, dừng
 *   4. Đối soát          reconcile() của core — đúng hàm app dùng
 *   5. process_bank_tx   ghi tiền + phiếu thu + đánh dấu đã xử lý + nhật ký, MỘT transaction
 *
 * Bước 5 lỗi → trả 500 → SePay gửi lại → bước 2 thấy hàng cũ, bước 3 thấy CHƯA xử lý
 * → làm lại từ bước 4. Bản cũ dừng ở bước 2 và giao dịch không bao giờ được ghi nhận.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  reconcile, extractPaymentCode,
  type BankTransaction, type OpenRequest,
} from '../_shared/core.ts';
import { json, readJsonLimited, safeEqual } from '../_shared/http.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);
const WEBHOOK_SECRET = Deno.env.get('SEPAY_WEBHOOK_SECRET') ?? '';

/** Payload SePay nhỏ (~1KB). 64KB là quá rộng rãi; hơn nữa là rác hoặc tấn công. */
const MAX_BODY = 64 * 1024;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // --- 1. XÁC THỰC trước khi đọc body. SePay gửi `Authorization: Apikey <secret>`.
  const key = (req.headers.get('authorization') ?? '').replace(/^Apikey\s+/i, '').trim();
  if (WEBHOOK_SECRET.length < 32 || !safeEqual(key, WEBHOOK_SECRET)) {
    return json({ error: 'unauthorized' }, 401);   // không nói vì sao sai
  }

  const parsed = await readJsonLimited(req, MAX_BODY);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  const raw = parsed.body;

  const n = normalize(raw);
  // Tiền RA: không phải việc của luồng này. Trả 200 để SePay thôi gửi lại —
  // trả 4xx thì nó retry 7 lần vô ích.
  if (n === 'ignore') return json({ ok: true, ignored: 'not incoming' });
  if (!n) return json({ error: 'bad payload' }, 400);
  const tx = n;

  try {
    // --- 2 + 3. Lưu nguyên bản; nếu đã có thì xem đã xử lý chưa.
    const saved = await saveRaw(tx, raw);
    if (saved.processed) return json({ ok: true, duplicate: true });

    // --- 4. Đối soát.
    const candidates = await loadCandidates(tx);
    const result = reconcile(tx, candidates);

    // --- 5. Ghi — mọi thứ trong một transaction ở database.
    const { data: receipt, error } = await db.rpc('process_bank_tx', {
      p_tx: saved.id,
      p_kind: result.kind,
      p_request: result.request?.id ?? null,
      p_code: result.code ?? null,
      p_reason: result.reason ?? null,
    });
    if (error) throw new Error(`process_bank_tx ${error.code}`);

    // Không khớp KHÔNG phải lỗi của SePay — đó là việc của hàng đợi ngoại lệ. Luôn 200.
    return json({ ok: true, kind: result.kind, receipt: receipt ?? null });
  } catch (e) {
    // Chỉ log THÔNG ĐIỆP ngắn, không log object lỗi: object lỗi của PostgREST có thể
    // kèm nội dung hàng dữ liệu (số tài khoản, tên khách).
    console.error('sepay-webhook', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'retry' }, 500);   // an toàn để SePay gửi lại
  }
});

/**
 * Chuẩn hoá payload SePay về kiểu core hiểu. Đổi nhà cung cấp thì chỉ sửa hàm này.
 *
 * Payload SePay: { id, gateway, transactionDate: "2026-09-16 14:26:03", accountNumber,
 *   code, content, transferType: "in"|"out", transferAmount, referenceCode, description }
 */
function normalize(p: Record<string, unknown>): BankTransaction | 'ignore' | null {
  if (p.transferType !== undefined && p.transferType !== 'in') return 'ignore';

  const id = String(p.id ?? '');
  const amount = Number(p.transferAmount ?? 0);
  if (!id || !Number.isSafeInteger(amount) || amount <= 0) return null;

  // SePay có thể tự nhận diện mã (trường `code`) nếu bạn cấu hình tiền tố "HC" trong
  // SePay. Ghép lên đầu nội dung để core thử cả hai; mã có ký tự kiểm tra nên ghép
  // thêm không làm khớp nhầm được.
  const content = [p.code, p.content ?? p.description]
    .filter(v => typeof v === 'string' && v.length > 0).join(' ');

  return {
    providerTxId: id,
    accountNumber: String(p.accountNumber ?? ''),
    amount,
    content,
    referenceCode: p.referenceCode ? String(p.referenceCode) : undefined,
    occurredAt: parseSepayTime(p.transactionDate),
  };
}

/** SePay gửi giờ Việt Nam KHÔNG kèm múi giờ: "2026-09-16 14:26:03".
 *  `new Date()` trên server UTC sẽ hiểu là 14:26 UTC — lệch 7 tiếng, và giao dịch
 *  sau 17:00 sẽ rơi sang NGÀY HÔM SAU trên sổ. Gắn +07:00 cho đúng. */
function parseSepayTime(v: unknown): Date {
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)$/);
    if (m) return new Date(`${m[1]}T${m[2]}${m[3] ? '' : ':00'}+07:00`);
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

async function saveRaw(tx: BankTransaction, raw: Record<string, unknown>) {
  const { data, error } = await db
    .from('bank_transactions')
    .insert({
      provider: 'sepay',
      provider_tx_id: tx.providerTxId,
      account_number: tx.accountNumber,
      amount: tx.amount,
      content: String(raw.content ?? raw.description ?? ''),   // NGUYÊN BẢN, không phải bản đã ghép
      reference_code: tx.referenceCode ?? null,
      occurred_at: tx.occurredAt.toISOString(),
      raw_payload: raw,
    })
    .select('id')
    .single();

  if (!error) return { id: data.id as string, processed: false };

  // 23505 = đã lưu giao dịch này rồi (SePay gửi lại). Chưa chắc đã XỬ LÝ xong.
  if (error.code !== '23505') throw new Error(`insert ${error.code}`);
  const { data: old, error: e2 } = await db
    .from('bank_transactions')
    .select('id, processed_at')
    .eq('provider', 'sepay')
    .eq('provider_tx_id', tx.providerTxId)
    .single();
  if (e2 || !old) throw new Error(`reload ${e2?.code ?? 'missing'}`);
  return { id: old.id as string, processed: old.processed_at !== null };
}

/**
 * Chỉ nạp phiếu LIÊN QUAN: phiếu mang đúng mã trong nội dung, cộng các phiếu đang mở
 * khác của CÙNG hợp đồng (để nhận ra "trả gộp nhiều kỳ").
 *
 * Bản cũ nạp MỌI phiếu đang mở của MỌI chủ nhà ở mỗi lần có tiền về — chậm dần theo
 * thời gian, và trộn dữ liệu các tổ chức vào cùng một phép so.
 *
 * Phiếu đúng mã nhưng thuộc tài khoản khác VẪN được nạp: để reconcile() nhận ra
 * "tiền vào nhầm tài khoản chủ nhà khác" thay vì báo chung chung "không tìm thấy mã".
 */
async function loadCandidates(tx: BankTransaction): Promise<OpenRequest[]> {
  const code = extractPaymentCode(tx.content);
  if (!code) return [];

  const cols = 'id, code, contract_id, amount, created_at, bank_accounts(number), payment_request_lines(payment_periods(due_on))';
  const { data: hit, error } = await db
    .from('payment_requests').select(cols)
    .eq('code', code).in('status', ['DRAFT', 'SENT'])
    .maybeSingle();
  if (error) throw new Error(`load request ${error.code}`);
  if (!hit) return [];

  const { data: siblings, error: e2 } = await db
    .from('payment_requests').select(cols)
    .eq('contract_id', hit.contract_id).in('status', ['DRAFT', 'SENT']);
  if (e2) throw new Error(`load siblings ${e2.code}`);

  return (siblings ?? [hit]).map(toOpenRequest);
}

// deno-lint-ignore no-explicit-any
function toOpenRequest(r: any): OpenRequest {
  // Thứ tự phân bổ khi trả gộp = kỳ tới hạn SỚM NHẤT trong phiếu.
  const dues: string[] = (r.payment_request_lines ?? [])
    // deno-lint-ignore no-explicit-any
    .map((l: any) => l.payment_periods?.due_on)
    .filter((d: unknown): d is string => typeof d === 'string')
    .sort();
  const first = dues[0];
  return {
    id: r.id,
    code: r.code,
    contractId: r.contract_id,
    accountNumber: r.bank_accounts?.number ?? '',
    amount: Number(r.amount),
    due: first ? new Date(`${first}T00:00:00+07:00`) : new Date(r.created_at),
  };
}
