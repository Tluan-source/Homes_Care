/**
 * Cấu hình kết nối — đọc từ biến môi trường `EXPO_PUBLIC_*` (file `apps/mobile/.env`).
 *
 * CHỈ HAI THỨ NÀY được nhúng vào app: URL project và anon key. Cả hai coi như công khai —
 * mọi truy vấn vẫn đi qua RLS. khoá quản trị (service role) và khoá SePay KHÔNG BAO GIỜ đặt ở đây
 * (scripts/check-secrets.sh sẽ chặn).
 */
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
export const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export const isConfigured = /^https?:\/\/.+/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
