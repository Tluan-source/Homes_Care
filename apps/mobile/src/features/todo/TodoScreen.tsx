/**
 * CẦN XỬ LÝ — gộp mọi tòa. Bốn nhóm gập được, xếp theo mức gấp:
 *   Chưa gửi QR · Đã tới hạn · Ngoại lệ SePay · Sắp tới hạn (gập sẵn — chỉ để biết).
 */
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { formatDay, formatShortVND, formatVND, isUrgent } from '@homescare/core';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../app/auth';
import { useData } from '../../app/data';
import { dismissTx, resolveTx } from '../../data/api';
import type { ExceptionVM, OpenRequestVM, UnitVM } from '../../data/model';
import { errorText } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';
import { Icon } from '../../ui/Icon';
import {
  Avatar, Btn, Callout, Empty, Header, Loading, SecH, Sheet, StatBar, Txt, mono, shadowSm, st as kit, useToast,
} from '../../ui/kit';
import { initialsOf } from '../account/initials';
import { UnitRow } from '../units/UnitRow';
import { ExceptionCard } from './ExceptionCard';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function TodoScreen() {
  const c = useTheme();
  const nav = useNavigation<any>();
  const toast = useToast();
  const { profile } = useAuth();
  const { bundle, loading, refresh } = useData();
  const [openG, setOpenG] = useState<Record<string, boolean>>({});
  const [matching, setMatching] = useState<ExceptionVM | null>(null);
  const [dismissing, setDismissing] = useState<ExceptionVM | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!bundle) return <Loading />;
  const units = bundle.units;
  const openUnit = (id: string) => nav.navigate('UnitDetail', { unitId: id });

  const needQR = units.filter(u => u.needsQR);
  const due = units.filter(u => isUrgent(u.money.kind));
  const owed = due.reduce((a, u) => a + u.money.owed, 0);
  const soon = units.filter(u => u.money.kind === 'soon')
    .sort((a, b) => (a.money.nextDue?.getTime() ?? 0) - (b.money.nextDue?.getTime() ?? 0));
  const soonAmt = soon.reduce((a, u) => a + (u.money.upcomingAmount ?? 0), 0);
  const exc = bundle.exceptions;
  const excAmt = exc.reduce((a, x) => a + x.amount, 0);

  const requests: { req: OpenRequestVM; unit: UnitVM }[] = units.flatMap(u =>
    u.contracts.filter(cv => cv.openRequest).map(cv => ({ req: cv.openRequest!, unit: u })));
  const reqById = new Map(requests.map(r => [r.req.id, r]));

  // Mặc định: mở nhóm cần quyết ngay, gập nhóm "sắp tới hạn" — nhóm đó chỉ để biết.
  const isOpen = (k: string) => openG[k] ?? k !== 'soon';

  const group = (key: string, title: string, sub: string, color: string, bg: string, count: number, amt: number, body: React.ReactNode) => (
    <View key={key} style={[kit.panel, { borderColor: c.line, backgroundColor: c.surface, marginBottom: 12, ...shadowSm }]}>
      <Pressable onPress={() => setOpenG({ ...openG, [key]: !isOpen(key) })} accessibilityRole="button" accessibilityState={{ expanded: isOpen(key) }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, backgroundColor: c.surface2 }}>
        <View style={{ transform: [{ rotate: isOpen(key) ? '0deg' : '-90deg' }] }}><Icon name="chevron" color={c.muted} size={16} /></View>
        <Text style={{ fontSize: 15, fontWeight: '800', color }}>{title}</Text>
        <Text style={{ fontSize: 12, color: c.muted }}>{count} mục</Text>
        <View style={{ flex: 1 }} />
        {amt ? <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{formatShortVND(amt)}</Text></View> : null}
      </Pressable>
      <Text style={{ fontSize: 12, color: c.muted, paddingHorizontal: 13, paddingTop: 8, paddingBottom: isOpen(key) ? 0 : 10 }}>{sub}</Text>
      {isOpen(key) ? <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>{body}</View> : null}
    </View>
  );

  const byTower = (xs: UnitVM[]) => bundle.towers.map(t => {
    const us = xs.filter(u => u.tower.id === t.id);
    if (!us.length) return null;
    return (
      <View key={t.id}>
        <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, color: c.muted, paddingTop: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.line2 }}>
          TÒA <Text style={{ fontFamily: mono }}>{t.code}</Text> · {us.length} CĂN</Text>
        {us.map(u => <UnitRow key={u.unit.id} vm={u} onPress={openUnit} bare />)}
      </View>
    );
  });

  const unitOfException = (x: ExceptionVM) => (x.requestId ? reqById.get(x.requestId)?.unit : undefined);

  const doMatch = async (x: ExceptionVM, requestId: string) => {
    setBusy(true);
    try {
      const receipt = await resolveTx(x.id, requestId);
      toast(`Đã ghép — phiếu thu ${receipt}`);
      setMatching(null);
      await refresh();
    } catch (e) { toast(await errorText(e)); }
    finally { setBusy(false); }
  };
  const doDismiss = async () => {
    if (!dismissing) return;
    setBusy(true);
    try { await dismissTx(dismissing.id, note.trim()); toast('Đã đánh dấu xử lý ngoài'); setDismissing(null); setNote(''); await refresh(); }
    catch (e) { toast(await errorText(e)); }
    finally { setBusy(false); }
  };

  const nothing = !needQR.length && !due.length && !soon.length && !exc.length;

  return (
    <View style={{ flex: 1, backgroundColor: c.app }}>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />} contentContainerStyle={{ paddingBottom: 40 }}>
        <Header eyebrow={`Hôm nay · ${formatDay(bundle.today)}`} title="Cần xử lý"
          right={<Avatar label={initialsOf(profile?.fullName ?? '')} onPress={() => nav.navigate('Account')} />} />
        <View style={{ paddingHorizontal: 16 }}>
          <StatBar>
            <Text style={{ fontSize: 11.5, color: c.accentDeep }}><Text style={{ fontWeight: '800', fontSize: 14 }}>{needQR.length}</Text> chưa gửi QR</Text>
            <View style={{ width: 1, height: 15, backgroundColor: c.line }} />
            <Text style={{ fontSize: 11.5, color: c.danger }}><Text style={{ fontWeight: '800', fontSize: 14 }}>{due.length}</Text> đã tới hạn</Text>
            <View style={{ width: 1, height: 15, backgroundColor: c.line }} />
            <Text style={{ fontSize: 11.5, color: c.mSoon }}><Text style={{ fontWeight: '800', fontSize: 14 }}>{soon.length}</Text> sắp tới hạn</Text>
            <View style={{ width: 1, height: 15, backgroundColor: c.line }} />
            <Text style={{ fontSize: 11.5, color: c.mExt }}><Text style={{ fontWeight: '800', fontSize: 14 }}>{exc.length}</Text> ngoại lệ</Text>
          </StatBar>
          <Callout tone="info"><Txt>Cả {bundle.towers.length} tòa gộp lại. Tiền vào sổ khi SePay đối soát khớp; phần lệch tiền hay sai mã nằm ở nhóm <Txt b>ngoại lệ</Txt> chờ bạn quyết.</Txt></Callout>
          <View style={{ height: 18 }} />

          {needQR.length ? group('qr', 'Chưa gửi QR', 'Kỳ đã tới hạn mà khách chưa nhận được mã QR. Bấm vào căn → Tạo yêu cầu thanh toán → Gửi qua Zalo.',
            c.accentDeep, c.accentSoft, needQR.length, 0,
            needQR.map(u => <UnitRow key={u.unit.id} vm={u} bare onPress={id => {
              const cv = u.contracts.find(x => x.invoices.some(iv => !iv.paid && iv.due <= bundle.today));
              if (cv) nav.navigate('PaymentRequest', { contractId: cv.contract.id, unitId: id }); else openUnit(id);
            }} />)) : null}

          {due.length ? group('due', 'Đã tới hạn', 'Tiền đã tới hạn mà chưa vào sổ — nhắc khách ngay.', c.mLate, c.mLateBg, due.length, owed, byTower(due)) : null}

          {exc.length ? group('exc', 'Ngoại lệ SePay', 'Tiền đã về nhưng máy không tự ghi nhận được. Chỉ những ca này mới cần bạn quyết.',
            c.mExt, c.mExtBg, exc.length, excAmt,
            <View style={{ paddingTop: 10 }}>{exc.map(x => {
              const r = x.requestId ? reqById.get(x.requestId) : undefined;
              return <ExceptionCard key={x.id} x={x} unit={unitOfException(x)} requestAmount={r?.req.amount}
                onMatch={() => (x.requestId && r ? void doMatch(x, x.requestId) : setMatching(x))}
                onDismiss={() => { setNote(''); setDismissing(x); }} />;
            })}</View>) : null}

          {soon.length ? group('soon', 'Sắp tới hạn', 'Chưa nợ đồng nào. Mốc nhắc D-3 → D0, xếp theo ngày tới hạn.', c.mSoon, c.mSoonBg, soon.length, soonAmt,
            soon.map(u => <UnitRow key={u.unit.id} vm={u} onPress={openUnit} bare />)) : null}

          {nothing ? <Empty title="Không có việc nào cần làm" detail="Không căn nào quá hạn, chưa căn nào tới hạn, không giao dịch nào lệch." /> : null}
        </View>
      </ScrollView>

      {/* ---- chọn phiếu để ghép giao dịch không rõ mã ---- */}
      <Sheet visible={!!matching} title="Ghép vào phiếu nào?" onClose={() => setMatching(null)}>
        {matching ? <>
          <Txt muted>Giao dịch <Text style={{ fontFamily: mono }}>{matching.providerTxId}</Text> · {formatVND(matching.amount)}{'\n'}Nội dung: {matching.content}</Txt>
          <SecH style={{ marginTop: 14 }}>Phiếu đang mở cùng tài khoản nhận</SecH>
          {requests.length === 0 ? <Txt muted>Không có phiếu nào đang mở.</Txt> : requests
            .sort((a, b) => Math.abs(a.req.amount - matching.amount) - Math.abs(b.req.amount - matching.amount))
            .slice(0, 20).map(({ req, unit }) => (
              <Pressable key={req.id} disabled={busy} onPress={() => void doMatch(matching, req.id)}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 7, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: mono, fontWeight: '700', color: c.ink }}>{unit.unit.code} · {req.code}</Text>
                  <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 2 }}>{req.docNo} · {req.status === 'SENT' ? 'đã gửi' : 'chưa gửi'}</Text>
                </View>
                <Text style={{ fontWeight: '700', color: req.amount === matching.amount ? c.stFull : c.ink }}>{formatVND(req.amount)}</Text>
              </Pressable>
            ))}
          <Callout tone="warn"><Txt>Ghép là ghi nhận <Txt b>đúng số tiền thật đã chuyển</Txt>. Chuyển thiếu thì kỳ vẫn còn nợ phần thiếu.</Txt></Callout>
        </> : null}
      </Sheet>

      {/* ---- đánh dấu đã xử lý ngoài app ---- */}
      <Sheet visible={!!dismissing} title="Đã xử lý ngoài app" onClose={() => setDismissing(null)}
        footer={<>
          <Btn kind="s" label="Huỷ" onPress={() => setDismissing(null)} />
          <Btn label="Xác nhận" busy={busy} disabled={note.trim().length < 3} onPress={doDismiss} style={{ flex: 1 }} />
        </>}>
        <Txt>Ví dụ: đã hoàn lại tiền cho khách, tiền không phải tiền nhà. <Txt b>Bắt buộc ghi lý do</Txt> — sau này đối chiếu sao kê phải đọc ra được vì sao khoản này không nằm trong sổ.</Txt>
        <TextInput value={note} onChangeText={setNote} placeholder="Lý do" placeholderTextColor={c.muted} multiline
          style={{ marginTop: 12, minHeight: 70, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, color: c.ink, textAlignVertical: 'top' }} />
      </Sheet>
    </View>
  );
}

export function useTodoBadge(): { n: number; tone: 'exc' | 'due' | 'soon' } | null {
  const { bundle } = useData();
  if (!bundle) return null;
  // Ưu tiên: NGOẠI LỆ (tiền thật chưa gán cho ai) > đã tới hạn > sắp tới hạn.
  const exc = bundle.exceptions.length;
  const due = bundle.units.filter(u => isUrgent(u.money.kind) || u.needsQR).length;
  const soon = bundle.units.filter(u => u.money.kind === 'soon').length;
  if (exc) return { n: exc, tone: 'exc' };
  if (due) return { n: due, tone: 'due' };
  if (soon) return { n: soon, tone: 'soon' };
  return null;
}

