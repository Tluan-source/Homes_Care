/**
 * YÊU CẦU THANH TOÁN — 2 bước như bản demo: soát lại các khoản → mã QR + gửi Zalo.
 *
 * Số tiền, mã và QR do SERVER tính (Edge Function `create-payment-request`, dùng core).
 * App chỉ hiện ra và giúp quản lý gửi nhanh nhất có thể — gửi ~200 QR/tháng là việc
 * tay nhiều nhất còn lại của quản lý (chốt 24/09/2026).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { formatDay, formatDayMonth, formatVND, parseDay, planReminders } from '@homescare/core';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useData } from '../../app/data';
import { markRequestSent, requestQuote, type RequestQuote } from '../../data/api';
import { errorText } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';
import { Icon } from '../../ui/Icon';
import { BackBar, Btn, Callout, Empty, Loading, Panel, Row, SecH, Txt, mono, useToast } from '../../ui/kit';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function PaymentRequestScreen() {
  const c = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const toast = useToast();
  const { bundle, refresh } = useData();
  const contractId: string = route.params?.contractId;
  const vm = bundle?.units.find(u => u.contracts.some(x => x.contract.id === contractId));
  const cv = vm?.contracts.find(x => x.contract.id === contractId);

  // Đã có phiếu đang mở ("Xem mã QR") → vào thẳng bước 2; server trả lại phiếu cũ nếu khớp.
  const [step, setStep] = useState<1 | 2>(cv?.openRequest ? 2 : 1);
  const [q, setQ] = useState<RequestQuote | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setErr(null); setQ(null);
    requestQuote(contractId, step === 1)
      .then(r => { if (alive) setQ(r); })
      .catch(async e => { if (alive) setErr(await errorText(e)); });
    return () => { alive = false; };
  }, [contractId, step]);

  const title = step === 1 ? 'Soát lại các khoản' : 'Mã thanh toán';
  const sub = `${vm?.unit.code ?? ''} · bước ${step}/2`;

  return (
    <View style={{ flex: 1, backgroundColor: c.app }}>
      <BackBar title={title} sub={sub} onBack={() => nav.goBack()} />
      {err ? <View style={{ padding: 16 }}>
        <Empty icon="book" title="Không tạo được phiếu" detail={err} />
        <Btn kind="s" block label="Quay lại" onPress={() => nav.goBack()} />
      </View> : !q ? <Loading label={step === 1 ? 'Đang tính các khoản…' : 'Đang lập phiếu và sinh QR…'} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {step === 1
            ? <Review q={q} busy={busy} onCancel={() => nav.goBack()} onConfirm={() => { setBusy(true); setStep(2); }} />
            : <QRStep q={q} toast={toast} onSent={async () => {
                if (!q.request) return;
                try { await markRequestSent(q.request.id); toast('Đã đánh dấu: đã gửi cho khách'); void refresh(); }
                catch (e) { toast(await errorText(e)); }
              }} onBackToUnit={() => { void refresh(); nav.goBack(); }} />}
        </ScrollView>
      )}
    </View>
  );
}

const lineName = (q: RequestQuote, t: string) => (t === 'RENT' ? `Tiền nhà · ${q.cycle_months} tháng` : 'Tiền dịch vụ');

/* ------------------------------------------------------------------ bước 1 */

function Review({ q, busy, onCancel, onConfirm }: { q: RequestQuote; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const c = useTheme();
  const row = (key: string, t: string, s: string, amt: number, muted?: boolean) => (
    <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: c.line2, opacity: muted ? 0.55 : 1 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: c.ink }}>{t}</Text>
        <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 2 }}>{s}</Text>
      </View>
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.ink }}>{formatVND(amt)}</Text>
    </View>
  );
  return (
    <View>
      <Callout tone="info" style={{ marginTop: 0 }}><Txt>Đây là <Txt b>yêu cầu thanh toán</Txt> (phiếu báo tiền), chưa phải phiếu thu. Phiếu thu chỉ sinh sau khi tiền thật sự về tài khoản và đối soát khớp.</Txt></Callout>

      <SecH style={{ marginTop: 20 }}>Khách thuê</SecH>
      <Panel style={{ padding: 14 }}>
        <Text style={{ fontWeight: '700', fontSize: 14.5, color: c.ink }}>{q.tenant?.name ?? 'Khách thuê'}</Text>
        <Text style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>HĐ {q.contract_code}{q.tenant?.phone ? ` · ${q.tenant.phone}` : ''}</Text>
      </Panel>

      <SecH style={{ marginTop: 20 }}>Các khoản gom vào phiếu này</SecH>
      <Panel>
        {q.lines.map(l => row(l.period_id, lineName(q, l.type),
          l.late_days ? `Quá hạn ${l.late_days} ngày — hạn ${formatDay(parseDay(l.due_on))}` : `Kỳ tới hạn ${formatDay(parseDay(l.due_on))}`, l.amount))}
        {q.lines.filter(l => l.fee > 0).map(l => row(`fee${l.period_id}`, 'Phạt trễ hạn', `Kỳ ${formatDay(parseDay(l.due_on))} · trễ ${l.late_days} ngày`, l.fee))}
        {row('elec', 'Tiền điện', 'Chưa dựng — ghi nhận riêng ngoài app', 0, true)}
        {row('water', 'Tiền nước', 'Chưa dựng — ghi nhận riêng ngoài app', 0, true)}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 14, backgroundColor: c.accentSoft }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: c.ink }}>Tổng phải thanh toán</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: c.accentDeep }}>{formatVND(q.amount)}</Text>
        </View>
      </Panel>
      {q.penalty ? <Callout tone="warn"><Txt>Đã cộng <Txt b>{formatVND(q.penalty)}</Txt> tiền phạt. Quy tắc: <Txt b>100.000đ/ngày</Txt>, miễn 2 ngày đầu, trần <Txt b>1 triệu mỗi kỳ</Txt>, chỉ tính trên <Txt b>tiền nhà</Txt>. Được duyệt xin đóng trễ thì không bị phạt trong thời hạn đã khất.</Txt></Callout> : null}
      {q.lines.length > 1 ? <Callout tone="warn"><Txt>{q.lines.length} kỳ gom chung <Txt b>một mã, một số tiền, một QR</Txt>. Tách mỗi kỳ một QR thì khách phải chuyển nhiều lần — và chỉ cần họ gộp lại là đối soát hỏng ngay.</Txt></Callout> : null}

      <SecH style={{ marginTop: 20 }}>Tiền vào tài khoản</SecH>
      <Panel style={{ padding: 14 }}>
        <Text style={{ fontWeight: '700', color: c.ink }}>{q.bank.bank_name} · <Text style={{ fontFamily: mono }}>{q.bank.number}</Text></Text>
        <Text style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>{q.bank.holder}</Text>
      </Panel>
      <Callout tone="warn"><Txt>Tiền chạy <Txt b>thẳng vào tài khoản chủ nhà</Txt>, app chỉ đọc biến động số dư để đối soát. App không giữ tiền hộ.</Txt></Callout>

      <Row style={{ marginTop: 20 }}>
        <Btn kind="s" label="Huỷ" onPress={onCancel} />
        <Btn label="Xác nhận và tạo QR" onPress={onConfirm} busy={busy} style={{ flex: 1 }} />
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ bước 2 */

function messageOf(q: RequestQuote): string {
  const r = q.request!;
  const lines = q.lines.map(l => `- ${lineName(q, l.type)} (hạn ${formatDayMonth(parseDay(l.due_on))}): ${formatVND(l.amount)}`);
  if (q.penalty) lines.push(`- Phạt trễ hạn: ${formatVND(q.penalty)}`);
  return [
    `Căn ${q.unit_code} — yêu cầu thanh toán ${r.doc_no}`,
    ...lines,
    `TỔNG: ${formatVND(q.amount)}`,
    '',
    `Ngân hàng: ${q.bank.bank_name}`,
    `Số TK: ${q.bank.number} — ${q.bank.holder}`,
    `Nội dung CK: ${r.code}`,
    '',
    'Vui lòng GIỮ NGUYÊN nội dung chuyển khoản để hệ thống tự xác nhận. Quét mã QR đính kèm là tự điền đủ.',
  ].join('\n');
}

function QRStep({ q, toast, onSent, onBackToUnit }: {
  q: RequestQuote; toast: (m: string) => void; onSent: () => Promise<void>; onBackToUnit: () => void;
}) {
  const c = useTheme();
  const qrRef = useRef<any>(null);
  const r = q.request;
  if (!r) return <Empty title="Không có phiếu" />;
  const sent = r.status === 'SENT';

  const copy = async (label: string, v: string) => { await Clipboard.setStringAsync(v); toast(`Đã sao chép ${label}`); };

  /** Vẽ QR ra file PNG rồi mở bảng chia sẻ của máy (chọn Zalo). */
  const shareImage = async (): Promise<boolean> => {
    if (!(await Sharing.isAvailableAsync())) { toast('Máy này không hỗ trợ chia sẻ'); return false; }
    const b64: string = await new Promise(res => qrRef.current?.toDataURL((d: string) => res(d)));
    const uri = `${FileSystem.cacheDirectory}QR-${r.code}.png`;
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `QR ${q.unit_code}` });
    return true;
  };

  const sendZalo = async () => {
    // Bảng chia sẻ chỉ gửi được ẢNH, không kèm chữ — nên sao chép tin nhắn trước,
    // gửi ảnh xong dán tin vào ngay cuộc trò chuyện đó.
    await Clipboard.setStringAsync(messageOf(q));
    toast('Đã sao chép tin nhắn — gửi ảnh QR xong thì dán tin vào Zalo');
    if (!(await shareImage())) return;
    // App không biết chắc Zalo đã gửi hay chưa → HỎI, không tự đánh dấu.
    Alert.alert('Đã gửi cho khách chưa?', `Căn ${q.unit_code} · ${formatVND(q.amount)}`, [
      { text: 'Chưa', style: 'cancel' },
      { text: 'Đã gửi', onPress: () => void onSent() },
    ]);
  };

  const kv = (k: string, v: string, raw?: string, isMono?: boolean) => (
    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: c.line2 }}>
      <Text style={{ width: 96, fontSize: 12.5, color: c.muted }}>{k}</Text>
      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: c.ink, fontFamily: isMono ? mono : undefined }}>{v}</Text>
      <Pressable onPress={() => copy(k.toLowerCase(), raw ?? v)} accessibilityLabel={`Sao chép ${k}`} hitSlop={8}
        style={{ padding: 6, borderRadius: 8, backgroundColor: c.surface2 }}>
        <Icon name="copy" size={15} color={c.accentDeep} />
      </Pressable>
    </View>
  );
  const plan = q.lines.length ? planReminders(parseDay(q.lines[q.lines.length - 1]!.due_on), parseDay(q.lines[q.lines.length - 1]!.due_on)) : [];

  return (
    <View>
      {q.reused ? <Callout tone="ok" style={{ marginTop: 0, marginBottom: 12 }}><Txt>Phiếu <Txt b>{r.doc_no}</Txt> đang mở với đúng các khoản này — dùng lại, không lập phiếu mới.</Txt></Callout> : null}

      <Panel style={{ alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16 }}>
        <View style={{ padding: 10, backgroundColor: '#fff', borderRadius: 12 }}>
          <QRCode value={r.qr_payload} size={200} getRef={ref => { qrRef.current = ref; }} ecl="M" quietZone={8} backgroundColor="#fff" color="#111" />
        </View>
        <Text style={{ fontFamily: mono, fontSize: 20, fontWeight: '800', letterSpacing: 1.5, color: c.ink, marginTop: 14 }}>{r.code}</Text>
        <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 4, textAlign: 'center' }}>Mã thanh toán — khách giữ nguyên trong nội dung chuyển khoản</Text>
        <Text style={{ fontSize: 11, color: c.muted, marginTop: 6, fontFamily: mono }}>{r.doc_no}{sent ? ' · đã gửi khách' : ' · chưa gửi'}</Text>
      </Panel>

      <Panel style={{ marginTop: 14 }}>
        {kv('Ngân hàng', q.bank.bank_name)}
        {kv('Số tài khoản', q.bank.number, undefined, true)}
        {kv('Chủ TK', q.bank.holder)}
        {kv('Số tiền', formatVND(q.amount), String(q.amount), true)}
        {kv('Nội dung', r.code, undefined, true)}
      </Panel>

      <Row>
        <Btn icon="send" label="Gửi qua Zalo" onPress={sendZalo} style={{ flex: 1 }} />
        <Btn kind="s" icon="download" label="Lưu ảnh" onPress={() => void shareImage()} />
      </Row>
      <Row style={{ marginTop: 8 }}>
        <Btn kind="s" block label="Sao chép tin nhắn" onPress={() => copy('tin nhắn', messageOf(q))} />
      </Row>
      {!sent ? <Row style={{ marginTop: 8 }}>
        <Btn kind="g" block label="Đánh dấu đã gửi cho khách" onPress={() => void onSent()} />
      </Row> : null}

      <Callout tone="info" style={{ marginTop: 14 }}><Txt>QR là <Txt b>payload VietQR thật</Txt> theo chuẩn EMVCo. Khách quét bằng app ngân hàng sẽ tự điền đúng số tài khoản, số tiền và nội dung.</Txt></Callout>

      {plan.length ? <>
        <SecH style={{ marginTop: 22 }}>Lịch nhắc trong app của kỳ này</SecH>
        <Panel style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
          {plan.map(m => (
            <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 }}>
              <Text style={{ width: 38, fontFamily: mono, fontWeight: '700', color: c.accentDeep, fontSize: 12 }}>{m.key}</Text>
              <Text style={{ flex: 1, fontSize: 12.5, color: c.ink2 }}>{m.label}</Text>
              <Text style={{ fontSize: 12, color: c.muted }}>{formatDayMonth(m.on)}</Text>
            </View>
          ))}
        </Panel>
        <Callout tone="warn"><Txt>Nhắc chỉ hiện trong app cho chủ nhà và quản lý, và <Txt b>dừng ngay</Txt> khi kỳ được ghi nhận đã thanh toán.</Txt></Callout>
      </> : null}

      <Row style={{ marginTop: 18 }}><Btn kind="s" block label="Xong — về căn hộ" onPress={onBackToUnit} /></Row>
    </View>
  );
}
