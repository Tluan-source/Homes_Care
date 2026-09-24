/**
 * TÀI KHOẢN — hồ sơ, hộp thư nhắc hạn, và (chỉ chủ nhà) quản lý tài khoản quản lý:
 * mời bằng email, KHOÁ khi nghỉ việc (chốt S2 — khoá chứ không xoá, hiệu lực ngay).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../app/auth';
import { useData } from '../../app/data';
import {
  inviteMember, loadMembers, loadNotifications, lockMember, markAllRead, unlockMember,
  type MemberVM, type NotificationVM,
} from '../../data/api';
import { errorText } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';
import {
  BackBar, Btn, Callout, Chip, ChipRow, Empty, Initials, Panel, Pill, Row, SecH, Sheet, Txt, useToast,
} from '../../ui/kit';
import { fmtTime } from '../units/UnitDetailScreen';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function AccountScreen() {
  const c = useTheme();
  const nav = useNavigation<any>();
  const toast = useToast();
  const { profile, isOwner, roles, signOut, session } = useAuth();
  const { bundle } = useData();
  const [members, setMembers] = useState<MemberVM[] | null>(null);
  const [notes, setNotes] = useState<NotificationVM[] | null>(null);
  const [invite, setInvite] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [n, m] = await Promise.all([loadNotifications(), isOwner ? loadMembers() : Promise.resolve(null)]);
      setNotes(n); setMembers(m);
      void markAllRead(n.filter(x => !x.readAt).map(x => x.id)).catch(() => {});
    } catch (e) { toast(await errorText(e)); }
    finally { setLoading(false); }
  }, [isOwner, toast]);
  useEffect(() => { void load(); }, [load]);

  const toggleLock = (m: MemberVM) => {
    if (m.lockedAt) {
      void unlockMember(m.profileId).then(() => { toast(`Đã mở khoá ${m.name}`); void load(); })
        .catch(async e => toast(await errorText(e)));
      return;
    }
    Alert.alert(`Khoá tài khoản ${m.name}?`,
      'Người này mất quyền xem và ghi mọi dữ liệu NGAY LẬP TỨC, kể cả khi điện thoại vẫn đang đăng nhập. Lịch sử họ đã ghi vẫn giữ nguyên. Mở khoá lại được.',
      [{ text: 'Huỷ', style: 'cancel' },
       { text: 'Khoá', style: 'destructive', onPress: () => void lockMember(m.profileId, 'nghỉ việc')
          .then(() => { toast(`Đã khoá ${m.name}`); void load(); }).catch(async e => toast(await errorText(e))) }]);
  };

  const roleLabel = isOwner ? 'Chủ nhà' : roles.some(r => r.role === 'MANAGER') ? 'Quản lý' : 'Nhân viên';
  const towersOf = roles.filter(r => r.towerId).map(r => bundle?.towers.find(t => t.id === r.towerId)?.code).filter(Boolean);

  return (
    <View style={{ flex: 1, backgroundColor: c.app }}>
      <BackBar title="Tài khoản" sub={profile?.orgName} onBack={() => nav.goBack()} />
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Panel style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Initials name={profile?.fullName ?? '?'} size={46} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>{profile?.fullName}</Text>
            <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{session?.user.email}</Text>
            <Text style={{ fontSize: 12, color: c.accentDeep, fontWeight: '700', marginTop: 4 }}>
              {roleLabel}{towersOf.length ? ` · tòa ${towersOf.join(', ')}` : ' · toàn bộ tòa'}</Text>
          </View>
        </Panel>

        <SecH style={{ marginTop: 22 }}>Nhắc hạn trong app</SecH>
        {notes === null ? <Txt muted>Đang tải…</Txt> : notes.length === 0
          ? <Panel style={{ padding: 14 }}><Txt muted>Chưa có bản tin nào. Mỗi sáng 8:00 app tổng hợp việc thu tiền trong ngày.</Txt></Panel>
          : notes.slice(0, 10).map(n => (
            <Panel key={n.id} style={{ padding: 13, marginBottom: 8, borderLeftWidth: n.readAt ? 1 : 3, borderLeftColor: n.readAt ? c.line : c.accent }}>
              <Text style={{ fontWeight: '700', color: c.ink }}>{n.title}</Text>
              <Text style={{ fontSize: 12.5, color: c.ink2, marginTop: 3, lineHeight: 18 }}>{n.body}</Text>
              <Text style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>{fmtTime(n.createdAt)}</Text>
            </Panel>
          ))}

        {isOwner ? <>
          <SecH style={{ marginTop: 22 }}>Tài khoản quản lý</SecH>
          {members === null ? <Txt muted>Đang tải…</Txt> : (
            <Panel>
              {members.filter(m => m.role === 'MANAGER').length === 0
                ? <Empty icon="user" title="Chưa có quản lý nào" detail="Mời quản lý bằng email — họ nhận link đặt mật khẩu." />
                : members.filter(m => m.role === 'MANAGER').map(m => (
                  <View key={m.profileId + (m.tower ?? '')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: c.line2 }}>
                    <Initials name={m.name} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: c.ink }}>{m.name}</Text>
                      <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 2 }}>{m.tower ? `Tòa ${m.tower}` : 'Toàn bộ tòa'}{m.phone ? ` · ${m.phone}` : ''}</Text>
                    </View>
                    {m.lockedAt ? <Pill label="Đã khoá" fg={c.danger} bg={c.mLateBg} /> : null}
                    <Pressable onPress={() => toggleLock(m)} accessibilityRole="button" style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: c.line }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: m.lockedAt ? c.stFull : c.danger }}>{m.lockedAt ? 'Mở khoá' : 'Khoá'}</Text>
                    </Pressable>
                  </View>
                ))}
            </Panel>
          )}
          <Row><Btn icon="plus" label="Mời quản lý" block onPress={() => setInvite(true)} /></Row>
          <Callout tone="info"><Txt>Quản lý nghỉ việc thì bấm <Txt b>Khoá</Txt>: mất quyền ngay, kể cả khi còn đăng nhập trên máy. Không xoá — để còn biết ai đã ghi khoản tiền nào.</Txt></Callout>
        </> : null}

        <Row style={{ marginTop: 26 }}><Btn kind="danger" block label="Đăng xuất" onPress={() => void signOut()} /></Row>
      </ScrollView>

      <InviteSheet visible={invite} onClose={() => setInvite(false)} towers={bundle?.towers ?? []}
        onDone={email => { setInvite(false); toast(`Đã gửi lời mời tới ${email}`); void load(); }} />
    </View>
  );
}

function InviteSheet({ visible, onClose, towers, onDone }: {
  visible: boolean; onClose: () => void; towers: { id: string; code: string }[]; onDone: (email: string) => void;
}) {
  const c = useTheme();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tower, setTower] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = { borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, fontSize: 14, color: c.ink, backgroundColor: c.surface, marginBottom: 10 } as const;

  const submit = async () => {
    setBusy(true); setErr(null);
    try { await inviteMember(email.trim(), name.trim(), phone.trim(), tower); onDone(email.trim()); setEmail(''); setName(''); setPhone(''); setTower(null); }
    catch (e) { setErr(await errorText(e)); }
    finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} title="Mời quản lý" onClose={onClose}
      footer={<>
        <Btn kind="s" label="Huỷ" onPress={onClose} />
        <Btn label="Gửi lời mời" busy={busy} disabled={!email.includes('@') || name.trim().length < 2} onPress={submit} style={{ flex: 1 }} />
      </>}>
      <TextInput value={name} onChangeText={setName} placeholder="Họ tên" placeholderTextColor={c.muted} style={input} />
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={c.muted} autoCapitalize="none" keyboardType="email-address" style={input} />
      <TextInput value={phone} onChangeText={setPhone} placeholder="Số điện thoại (tuỳ chọn)" placeholderTextColor={c.muted} keyboardType="phone-pad" style={input} />
      <SecH style={{ marginTop: 6 }}>Phụ trách</SecH>
      <ChipRow>
        <Chip label="Toàn bộ tòa" on={tower === null} onPress={() => setTower(null)} small />
        {towers.map(t => <Chip key={t.id} monoLabel small label={t.code} on={tower === t.id} onPress={() => setTower(t.id)} />)}
      </ChipRow>
      <Txt muted style={{ marginTop: 12 }}>Người được mời nhận email, bấm link để đặt mật khẩu rồi đăng nhập app.</Txt>
      {err ? <Text style={{ color: c.danger, marginTop: 10, fontWeight: '600' }}>{err}</Text> : null}
    </Sheet>
  );
}
