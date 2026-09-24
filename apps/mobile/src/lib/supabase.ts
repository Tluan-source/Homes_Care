/**
 * Client Supabase duy nhất của app.
 *
 * Phiên đăng nhập lưu trong SecureStore (Keychain / Keystore), không phải AsyncStorage:
 * ai cầm được token là đọc được CCCD và sổ tiền trong phạm vi của tài khoản đó.
 * SecureStore giới hạn ~2KB mỗi khoá mà token Supabase dài hơn — nên cắt thành nhiều mẩu.
 */
import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './env';

const CHUNK = 1800;
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

const chunkedStore = {
  async getItem(key: string): Promise<string | null> {
    const k = safe(key);
    const n = Number(await SecureStore.getItemAsync(`${k}.n`));
    if (!n) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await SecureStore.getItemAsync(`${k}.${i}`);
      if (p === null) return null;          // hỏng giữa chừng → coi như chưa đăng nhập
      parts.push(p);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safe(key);
    const old = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    const n = Math.ceil(value.length / CHUNK) || 1;
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(`${k}.n`, String(n));
    for (let i = n; i < old; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
  },
  async removeItem(key: string): Promise<void> {
    const k = safe(key);
    const n = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
  },
};

// Chưa cấu hình thì vẫn tạo client giả để app không sập lúc khởi động — màn hình
// "Chưa cấu hình" sẽ hiện thay cho màn đăng nhập (xem app/Root.tsx).
export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'http://localhost',
  isConfigured ? SUPABASE_ANON_KEY : 'not-configured',
  {
    auth: {
      storage: chunkedStore,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);

// Chỉ tự làm mới token khi app đang mở — cách Supabase khuyên cho React Native.
AppState.addEventListener('change', state => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Đọc thông báo lỗi dễ hiểu từ lỗi Supabase / Edge Function. */
export async function errorText(e: unknown, fallback = 'Có lỗi, thử lại'): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = e as any;
  try {
    if (any?.context && typeof any.context.json === 'function') {
      const body = await any.context.json();
      if (body?.error) return String(body.error);
    }
  } catch { /* không đọc được body */ }
  if (typeof any?.message === 'string' && any.message) return any.message;
  return fallback;
}
