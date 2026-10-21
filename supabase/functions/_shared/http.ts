/**
 * Tiện ích HTTP dùng chung cho mọi Edge Function. Viết tay (khác `core.ts` là file sinh ra).
 */

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

/** So sánh chuỗi theo THỜI GIAN HẰNG SỐ.
 *  So bằng `===` thì thời gian trả lời tiết lộ dần từng ký tự của khoá — kẻ tấn công
 *  dò được khoá bằng cách đo độ trễ. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Đọc body JSON có GIỚI HẠN kích thước — endpoint public, không để ai gửi 100MB vào. */
export async function readJsonLimited(
  req: Request, maxBytes: number,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return { ok: false, status: 413, error: 'too large' };
  const text = await req.text();
  if (text.length > maxBytes) return { ok: false, status: 413, error: 'too large' };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, status: 400, error: 'bad json' };
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: 'bad json' };
  }
}

/**
 * Hàm chạy theo lịch (pg_cron gọi qua pg_net) xác thực bằng header `x-cron-secret`.
 * Deploy các hàm này với --no-verify-jwt; KHÔNG có khoá này thì ai cũng gọi được.
 */
export function isCronCall(req: Request): boolean {
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  const got = req.headers.get('x-cron-secret') ?? '';
  return secret.length >= 32 && safeEqual(got, secret);
}

/** Hôm nay theo giờ Việt Nam, dạng 'YYYY-MM-DD'. Server chạy UTC — 6h sáng VN vẫn là hôm qua ở UTC. */
export function vnTodayISO(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}
