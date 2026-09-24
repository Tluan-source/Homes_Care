/**
 * Đăng nhập — email + mật khẩu (chốt S1, 24/09/2026). Không có đăng ký: tài khoản quản lý
 * do chủ nhà mời (Edge Function `invite-member`), khách bấm link trong email để đặt mật khẩu.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface Profile { id: string; fullName: string; orgId: string; orgName: string; lockedAt?: string }
export interface Membership { role: 'OWNER' | 'MANAGER' | 'STAFF' | 'TENANT'; towerId: string | null }

interface AuthState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Đăng nhập được nhưng không có hồ sơ/tổ chức — tài khoản tạo dở. */
  orphan: boolean;
  roles: Membership[];
  isOwner: boolean;
  /** Vừa mở link mời / đặt lại mật khẩu → phải đặt mật khẩu trước khi vào app. */
  needsPassword: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  setPassword: (password: string) => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth ngoài AuthProvider');
  return v;
};

/** Link trong email mời / đặt lại mật khẩu: homescare://set-password#access_token=…&refresh_token=… */
async function consumeAuthLink(url: string | null): Promise<boolean> {
  if (!url || !url.includes('set-password')) return false;
  const frag = url.includes('#') ? url.split('#')[1] : url.split('?')[1] ?? '';
  const p = new URLSearchParams(frag);
  const code = p.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return !error;
  }
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Membership[]>([]);
  const [orphan, setOrphan] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setRoles([]); setOrphan(false); return; }
    const { data: p } = await supabase.from('profiles')
      .select('id, full_name, org_id, locked_at, orgs(name)').eq('id', s.user.id).maybeSingle();
    if (!p) { setProfile(null); setRoles([]); setOrphan(true); return; }
    setOrphan(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgName = (p as any).orgs?.name ?? '';
    setProfile({ id: p.id, fullName: p.full_name, orgId: p.org_id, orgName, lockedAt: p.locked_at ?? undefined });
    // Bị khoá thì RLS trả rỗng — đúng như mong muốn; app hiện màn "đã bị khoá".
    const { data: ms } = await supabase.from('memberships')
      .select('role, tower_id').eq('profile_id', s.user.id);
    setRoles((ms ?? []).map(m => ({ role: m.role, towerId: m.tower_id })));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const opened = await consumeAuthLink(await Linking.getInitialURL());
      if (opened && alive) setNeedsPassword(true);
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (alive) setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void loadProfile(s);
    });
    const linkSub = Linking.addEventListener('url', async ({ url }) => {
      if (await consumeAuthLink(url)) setNeedsPassword(true);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); linkSub.remove(); };
  }, [loadProfile]);

  const value = useMemo<AuthState>(() => ({
    ready, session, profile, orphan, roles, needsPassword,
    isOwner: roles.some(r => r.role === 'OWNER'),
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw new Error(error.message === 'Invalid login credentials'
        ? 'Sai email hoặc mật khẩu' : error.message);
    },
    signOut: async () => { await supabase.auth.signOut(); setNeedsPassword(false); },
    resetPassword: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: 'homescare://set-password',
      });
      if (error) throw error;
    },
    setPassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setNeedsPassword(false);
    },
    reloadProfile: () => loadProfile(session),
  }), [ready, session, profile, orphan, roles, needsPassword, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
