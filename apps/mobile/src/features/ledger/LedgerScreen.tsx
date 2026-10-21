/**
 * SỔ QUỸ — TIỀN CỦA AI, SỔ CỦA NGƯỜI ĐÓ. RLS chỉ trả về sổ của tổ chức đang đăng nhập,
 * nên màn hình này không cần (và không có) bộ chọn "xem chủ khác" như bản demo.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { findBank, formatVND } from '@homescare/core';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../app/auth';
import { useData } from '../../app/data';
import { loadLedger, type LedgerVM } from '../../data/api';
import { errorText } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';
import { Avatar, Callout, Empty, Header, Loading, Panel, SecH, StatBar, Txt, mono } from '../../ui/kit';
import { initialsOf } from '../account/initials';
import { fmtTime } from '../units/UnitDetailScreen';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function LedgerScreen() {
  const c = useTheme();
  const nav = useNavigation<any>();
  const { profile } = useAuth();
  const { bundle, refresh: refreshAll } = useData();
  const [led, setLed] = useState<LedgerVM | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const today = bundle?.today ?? new Date();
  const monthKey = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const load = useCallback(async () => {
    setLoading(true);
    try { setLed(await loadLedger(new Date(monthKey))); setErr(null); }
    catch (e) { setErr(await errorText(e)); }
    finally { setLoading(false); }
  }, [monthKey]);
  useEffect(() => { void load(); }, [load, bundle]);

  if (!bundle) return <Loading />;

  // kỳ → căn, để phiếu thu hiện được mã căn
  const unitOfPeriod = new Map<string, string>();
  for (const u of bundle.units) for (const cv of u.contracts) for (const iv of cv.invoices) unitOfPeriod.set(iv.periodId, u.unit.code);
  const owedAll = bundle.units.reduce((a, u) => a + u.money.owed, 0);
  const mm = String(today.getMonth() + 1).padStart(2, '0');

  return (
    <View style={{ flex: 1, backgroundColor: c.app }}>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refreshAll(); void load(); }} />}
        contentContainerStyle={{ paddingBottom: 40 }}>
        <Header eyebrow={`Tháng ${mm}/${today.getFullYear()} · ${profile?.orgName ?? ''}`} title="Sổ quỹ"
          right={<Avatar label={initialsOf(profile?.fullName ?? '')} onPress={() => nav.navigate('Account')} />} />
        <View style={{ paddingHorizontal: 16 }}>
          <StatBar>
            <View style={{ width: '100%' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: c.muted }}>Đã vào sổ tháng này</Text>
              <Text style={{ fontSize: 29, fontWeight: '800', letterSpacing: -0.8, color: c.ink, marginTop: 3 }}>{led ? formatVND(led.collectedThisMonth) : '…'}</Text>
              {led?.accounts.map(a => (
                <Text key={a.id} style={{ fontSize: 11.5, color: c.muted, marginTop: 3 }}>
                  {findBank(a.bankId)?.name ?? a.bankId} · <Text style={{ fontFamily: mono }}>{a.number}</Text> — {a.holder}</Text>
              ))}
              <Line k="Tự đối soát qua SePay" v={led ? formatVND(led.byAuto) : '…'} color={c.stFull} first />
              <Line k="Ghi nhận tay" v={led ? formatVND(led.byManual) : '…'} color={c.warn} />
              <Line k="Còn phải thu (đã quá hạn)" v={formatVND(owedAll)} color={c.danger} />
            </View>
          </StatBar>
          {err ? <Callout tone="warn"><Txt>{err}</Txt></Callout> : null}

          <SecH style={{ marginTop: 24 }}>Phiếu thu · {led?.receipts.length ?? 0}</SecH>
          <Callout tone="ok" style={{ marginTop: 0 }}><Txt>Những khoản này khớp <Txt b>đúng mã và đúng số tiền</Txt> nên vào sổ thẳng, không ai phải bấm gì. Phiếu thu chỉ sinh sau khi tiền thật sự về.</Txt></Callout>
          {led && !led.receipts.length ? <Empty icon="book" title="Chưa có phiếu thu" /> : null}
          {led?.receipts.map(r => (
            <Panel key={r.docNo} style={{ marginTop: 9, padding: 13, flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: mono, fontWeight: '700', fontSize: 13.5, color: c.ink }}>{r.docNo}</Text>
                <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 3 }}>
                  <Text style={{ fontFamily: mono }}>{unitOfPeriod.get(r.periodId) ?? ''}</Text> · {fmtTime(r.at)}</Text>
              </View>
              <Text style={{ fontWeight: '700', color: c.stFull }}>{formatVND(r.amount)}</Text>
            </Panel>
          ))}

          <SecH style={{ marginTop: 24 }}>Ghi nhận tay tháng này · {led?.manual.length ?? 0}</SecH>
          <Callout tone="warn" style={{ marginTop: 0 }}><Txt>Đường dự phòng cho <Txt b>ngoại lệ</Txt>: khách trả tiền mặt, chuyển từ ngân hàng chưa nối. Mỗi khoản lưu tên người ghi, không sửa không xoá.</Txt></Callout>
          {led?.manual.map((m, i) => (
            <Panel key={i} style={{ marginTop: 9, padding: 13 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ fontFamily: mono, fontWeight: '700', color: c.ink }}>{unitOfPeriod.get(m.periodId) ?? '—'}</Text>
                <Text style={{ fontWeight: '700', color: c.ink }}>{formatVND(m.amount)}</Text>
              </View>
              <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 3 }}>{fmtTime(m.at)} · {m.by}{m.note ? ` · ${m.note}` : ''}</Text>
            </Panel>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  function Line({ k, v, color, first }: { k: string; v: string; color: string; first?: boolean }) {
    return <View style={{ flexDirection: 'row', marginTop: first ? 11 : 7, paddingTop: first ? 11 : 0, borderTopWidth: first ? 1 : 0, borderTopColor: c.line2 }}>
      <Text style={{ fontSize: 12.5, color: c.muted }}>{k}</Text>
      <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: '700', color }}>{v}</Text>
    </View>;
  }
}
