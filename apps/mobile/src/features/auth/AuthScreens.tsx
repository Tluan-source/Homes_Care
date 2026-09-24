/**
 * Đăng nhập · quên mật khẩu · đặt mật khẩu (từ link mời) · tài khoản bị khoá ·
 * chưa cấu hình. Không có "Đăng ký" — tài khoản do chủ nhà mời (chốt S1).
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../app/auth';
import { errorText } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';
import { Icon } from '../../ui/Icon';
import { Btn, Callout, Header, Panel, Txt, mono } from '../../ui/kit';

function Shell({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  const c = useTheme();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.app }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <Header eyebrow={eyebrow ?? 'HomesCare'} title={title} />
        <View style={{ paddingHorizontal: 16, marginTop: -30 }}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...p }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const c = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: c.muted, marginBottom: 6 }}>{label.toUpperCase()}</Text>
      <TextInput placeholderTextColor={c.muted} {...p}
        style={{ borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, color: c.ink, backgroundColor: c.surface }} />
    </View>
  );
}

export function LoginScreen() {
  const c = useTheme();
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);

  const go = async () => {
    setBusy(true); setErr(null);
    try {
      if (forgot) { await resetPassword(email); setSent(true); }
      else await signIn(email, pw);
    } catch (e) { setErr(await errorText(e)); }
    finally { setBusy(false); }
  };

  return (
    <Shell title={forgot ? 'Quên mật khẩu' : 'Đăng nhập'} eyebrow="Quản lý căn hộ cho thuê">
      <Panel style={{ padding: 16 }}>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email"
          keyboardType="email-address" placeholder="ban@congty.vn" textContentType="username" />
        {!forgot ? <Field label="Mật khẩu" value={pw} onChangeText={setPw} secureTextEntry autoComplete="password"
          textContentType="password" placeholder="••••••••••" onSubmitEditing={go} /> : null}
        {err ? <Text style={{ color: c.danger, fontWeight: '600', marginBottom: 10 }}>{err}</Text> : null}
        {sent ? <Callout tone="ok" style={{ marginTop: 0, marginBottom: 12 }}><Txt>Đã gửi link đặt lại mật khẩu tới <Txt b>{email}</Txt>. Mở email trên chính điện thoại này và bấm link.</Txt></Callout> : null}
        <Btn label={forgot ? 'Gửi link đặt lại' : 'Đăng nhập'} busy={busy}
          disabled={!email.includes('@') || (!forgot && pw.length < 1)} onPress={go} />
        <Pressable onPress={() => { setForgot(!forgot); setErr(null); setSent(false); }} style={{ marginTop: 14, alignSelf: 'center' }}>
          <Text style={{ color: c.accentDeep, fontWeight: '700' }}>{forgot ? '← Quay lại đăng nhập' : 'Quên mật khẩu?'}</Text>
        </Pressable>
      </Panel>
      <Callout tone="info"><Txt>Chưa có tài khoản? Tài khoản quản lý do <Txt b>chủ nhà mời</Txt> — bạn sẽ nhận email kèm link đặt mật khẩu.</Txt></Callout>
    </Shell>
  );
}

export function SetPasswordScreen() {
  const c = useTheme();
  const { setPassword, signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Cùng quy tắc với Supabase Auth (config.toml): ≥ 10 ký tự, có chữ và số.
  const ok = pw.length >= 10 && /[A-Za-z]/.test(pw) && /\d/.test(pw);

  const go = async () => {
    if (pw !== pw2) { setErr('Hai lần nhập không khớp'); return; }
    setBusy(true); setErr(null);
    try { await setPassword(pw); } catch (e) { setErr(await errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Shell title="Đặt mật khẩu">
      <Panel style={{ padding: 16 }}>
        <Field label="Mật khẩu mới" value={pw} onChangeText={setPw} secureTextEntry textContentType="newPassword" />
        <Field label="Nhập lại" value={pw2} onChangeText={setPw2} secureTextEntry textContentType="newPassword" />
        <Text style={{ fontSize: 12, color: ok ? c.stFull : c.muted, marginBottom: 12 }}>
          {ok ? '✓ ' : ''}Ít nhất 10 ký tự, có cả chữ và số.</Text>
        {err ? <Text style={{ color: c.danger, fontWeight: '600', marginBottom: 10 }}>{err}</Text> : null}
        <Btn label="Lưu mật khẩu" busy={busy} disabled={!ok || !pw2} onPress={go} />
        <Pressable onPress={() => void signOut()} style={{ marginTop: 14, alignSelf: 'center' }}>
          <Text style={{ color: c.muted, fontWeight: '600' }}>Huỷ</Text>
        </Pressable>
      </Panel>
    </Shell>
  );
}

export function LockedScreen({ orphan }: { orphan?: boolean }) {
  const c = useTheme();
  const { signOut, session } = useAuth();
  return (
    <Shell title={orphan ? 'Tài khoản chưa sẵn sàng' : 'Tài khoản đã bị khoá'}>
      <Panel style={{ padding: 18, alignItems: 'center' }}>
        <Icon name="lock" color={c.danger} size={34} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.ink, marginTop: 12, textAlign: 'center' }}>{session?.user.email}</Text>
        <Txt muted style={{ textAlign: 'center', marginTop: 6 }}>
          {orphan ? 'Tài khoản này chưa được gắn vào chủ nhà nào. Liên hệ chủ nhà để được mời lại.'
            : 'Chủ nhà đã khoá tài khoản này. Bạn không còn xem hay ghi được dữ liệu. Liên hệ chủ nhà nếu đây là nhầm lẫn.'}
        </Txt>
        <Btn kind="s" label="Đăng xuất" onPress={() => void signOut()} style={{ marginTop: 16, alignSelf: 'stretch' }} />
      </Panel>
    </Shell>
  );
}

export function NotConfiguredScreen() {
  const c = useTheme();
  return (
    <Shell title="Chưa cấu hình" eyebrow="Dành cho người cài đặt">
      <Panel style={{ padding: 16 }}>
        <Txt>App chưa biết kết nối tới Supabase nào. Tạo file <Txt b>apps/mobile/.env</Txt> (chép từ <Txt b>.env.example</Txt>) với hai dòng:</Txt>
        <Text style={{ fontFamily: mono, fontSize: 12, color: c.ink, backgroundColor: c.surface2, padding: 10, borderRadius: 8, marginTop: 10 }}>
          EXPO_PUBLIC_SUPABASE_URL=https://….supabase.co{'\n'}EXPO_PUBLIC_SUPABASE_ANON_KEY=…</Text>
        <Txt muted style={{ marginTop: 10 }}>Rồi tắt Metro và chạy lại. Xem docs/RUN.md.</Txt>
      </Panel>
    </Shell>
  );
}
