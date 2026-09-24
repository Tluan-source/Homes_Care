/**
 * Dữ liệu toàn app — nạp một lần, dùng chung cho mọi màn, nạp lại sau mỗi thao tác ghi.
 *
 * ~200 căn là đủ nhỏ để nạp hết một lượt: mọi màn (danh sách, Cần xử lý, huy hiệu thanh
 * dưới) đếm trên CÙNG một bộ dữ liệu, nên con số trên tab luôn bằng số dòng bên trong.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { startOfDay } from '@homescare/core';
import { loadBundle } from '../data/api';
import type { Bundle } from '../data/model';
import { errorText } from '../lib/supabase';

interface DataState {
  bundle: Bundle | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<DataState | null>(null);
export const useData = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData ngoài DataProvider');
  return v;
};

/** "Hôm nay" đọc đồng hồ ở ĐÂY — tầng app — rồi truyền xuống core. Core không đọc đồng hồ. */
export const todayLocal = () => startOfDay(new Date());

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      setBundle(await loadBundle(todayLocal()));
      setError(null);
    } catch (e) {
      setError(await errorText(e, 'Không tải được dữ liệu'));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // Mở lại app sau một lúc (qua ngày, hoặc tiền vừa về) → nạp lại.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]);

  return <Ctx.Provider value={{ bundle, loading, error, refresh }}>{children}</Ctx.Provider>;
}
