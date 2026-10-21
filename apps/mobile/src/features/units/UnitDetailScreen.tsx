/**
 * CHI TIẾT CĂN HỘ — 5 tab như bản demo: Tổng quan · Phòng & người ở · Hợp đồng · Thu chi · Ghi chú.
 *
 * Nút thu tiền nằm ngay dưới phần đầu và theo người dùng qua mọi tab: thu tiền diễn ra
 * 12 lần/năm mỗi căn, cho thuê ~1 lần/năm.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import {
  LATE_POLICY, daysBetween, formatDay, formatDayMonth, formatShortVND, formatVND, slotPrice,
} from '@homescare/core';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../app/auth';
import { useData } from '../../app/data';
import { addNote, loadNotes, loadUnitLog, type LogVM, type NoteVM } from '../../data/api';
import type { ContractVM, OccupantVM, UnitVM } from '../../data/model';
import { errorText } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';
import { moneyTone, unitTone } from '../../theme/statusStyle';
import {
  BackBar, Btn, Callout, Empty, Initials, KV, Loading, Panel, Pill, Row, SecH, Txt, mono, useToast,
} from '../../ui/kit';
import { CashSheet } from './CashSheet';
import { PersonSheet } from './PersonSheet';

type Tab = 'overview' | 'rooms' | 'contracts' | 'money' | 'notes';
const TABS: [Tab, string][] = [
  ['overview', 'Tổng quan'], ['rooms', 'Phòng & người ở'], ['contracts', 'Hợp đồng'], ['money', 'Thu chi'], ['notes', 'Ghi chú'],
];

/* eslint-disable @typescript-eslint/no-explicit-any */

export function UnitDetailScreen() {
  const c = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const toast = useToast();
  const { profile } = useAuth();
  const { bundle, loading, refresh } = useData();
  const [tab, setTab] = useState<Tab>('overview');
  const [person, setPerson] = useState<OccupantVM | null>(null);
  const [cashFor, setCashFor] = useState<ContractVM | null>(null);

  const vm = bundle?.units.find(u => u.unit.id === route.params?.unitId);
  if (!bundle) return <Loading />;
  if (!vm) return <View style={{ flex: 1, backgroundColor: c.app }}>
    <BackBar title="Căn hộ" onBack={() => nav.goBack()} />
    <Empty icon="x" title="Không tìm thấy căn này" detail="Có thể bạn không còn quyền xem tòa này." />
  </View>;

  const today = bundle.today;
  const ut = unitTone(c)[vm.state.status];
  const mt = moneyTone(c)[vm.money.kind];
  const people = vm.contracts.flatMap(x => x.occupants);
  const who = people.find(p => p.primary) ?? people[0];
  const rent = vm.unit.rooms.reduce((a, r) => a + r.rent, 0);
  const payable = vm.contracts.find(x => x.invoices.some(iv => !iv.paid && daysBetween(iv.due, today) <= 3));
  const later = (what: string) => toast(`${what} — làm ở đợt sau`);

  const segs: React.ReactNode[] = [];
  for (const r of vm.unit.rooms) {
    const held = heldIn(vm, r.id, r.capacity);
    for (let i = 0; i < r.capacity; i++) segs.push(<View key={`${r.id}${i}`} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < held ? ut.fg : c.line }} />);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.app }}>
      <BackBar monoTitle title={vm.unit.code} onBack={() => nav.goBack()}
        sub={`${vm.zone.name} · ${vm.tower.name} · tầng ${vm.unit.floor} · căn ${vm.unit.unitNo}`}
        right={<View style={{ backgroundColor: ut.fg, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11.5 }}>{ut.label}</Text></View>} />
      <ScrollView stickyHeaderIndices={[1]} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ---------- phần đầu: AI đang ở đây ---------- */}
        <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: c.ink, letterSpacing: -0.4 }}>
              {who ? who.name : vm.state.status === 'maint' ? 'Đang bảo trì' : 'Chưa có khách thuê'}</Text>
            {people.length > 1 ? <View style={{ backgroundColor: c.accentSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: c.accentDeep, fontWeight: '700', fontSize: 11.5 }}>+{people.length - 1} người</Text></View> : null}
          </View>
          <Text style={{ fontSize: 12.5, color: c.muted, marginTop: 5 }}>
            {vm.unit.bedrooms} phòng ngủ · {vm.unit.bathrooms} WC{vm.unit.areaM2 ? ` · ${vm.unit.areaM2} m²` : ''} · sức chứa {vm.state.capacity} chỗ</Text>
          <View style={{ flexDirection: 'row', gap: 3, marginTop: 14 }}>{segs}</View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 10, marginTop: 13 }}>
            <Stat k="Chỗ đã chiếm" v={`${vm.state.held}/${vm.state.capacity}`} />
            <Stat k="Người đang ở" v={String(vm.state.people)} />
            <Stat k="Giá niêm yết" v={`${formatShortVND(rent)}/tháng`} />
            <Stat k="Dịch vụ" v={`${formatShortVND(vm.unit.serviceFee)}/tháng`} />
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            <Pill label={`${mt.label}${vm.money.owed ? ` · ${formatVND(vm.money.owed)}` : ''}`} fg={mt.fg} bg={mt.bg} />
            {vm.endsSoon ? <Pill label="Sắp hết HĐ" fg={c.mSoon} bg={c.mSoonBg} /> : null}
          </View>
          <Row>
            {payable ? <>
              <Btn icon="qr" label="Tạo yêu cầu thanh toán" style={{ flex: 1 }}
                onPress={() => nav.navigate('PaymentRequest', { contractId: payable.contract.id, unitId: vm.unit.id })} />
              <Btn kind="s" label="Tiền mặt" onPress={() => setCashFor(payable)} />
            </> : vm.state.status === 'maint'
              ? <Btn label="Kết thúc bảo trì" block onPress={() => later('Kết thúc bảo trì')} />
              : vm.state.status === 'empty' || vm.state.status === 'partial' ? <>
                <Btn label={vm.state.status === 'empty' ? 'Cho thuê' : 'Cho thuê thêm'} style={{ flex: 1 }} onPress={() => later('Luồng cho thuê')} />
                <Btn kind="s" label="Nhận cọc giữ chỗ" onPress={() => later('Cọc giữ chỗ')} />
              </> : <Btn kind="s" label="Đã thu đủ — chưa tới kỳ nào" block disabled />}
          </Row>
        </View>

        {/* ---------- tab ---------- */}
        <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10 }}>
            {TABS.map(([k, l]) => (
              <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}
                style={{ paddingVertical: 12, paddingHorizontal: 11, borderBottomWidth: 3, borderBottomColor: tab === k ? c.accent : 'transparent' }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: tab === k ? c.ink : c.muted }}>{l}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {tab === 'overview' && <Overview vm={vm} today={today} />}
          {tab === 'rooms' && <Rooms vm={vm} onPerson={setPerson} onRent={() => later('Luồng cho thuê')} />}
          {tab === 'contracts' && <Contracts vm={vm} today={today} />}
          {tab === 'money' && <Money vm={vm} today={today} onCash={setCashFor}
            onQR={cv => nav.navigate('PaymentRequest', { contractId: cv.contract.id, unitId: vm.unit.id })} />}
          {tab === 'notes' && <Notes vm={vm} me={profile?.id ?? ''} />}
        </View>
      </ScrollView>

      <PersonSheet person={person} vm={vm} onClose={() => setPerson(null)}
        contract={person ? vm.contracts.find(x => x.contract.id === person.contractId) : undefined} />
      <CashSheet contract={cashFor} me={profile?.id ?? ''} onClose={() => setCashFor(null)}
        onDone={msg => { setCashFor(null); toast(msg); void refresh(); }} />
    </View>
  );

  function Stat({ k, v }: { k: string; v: string }) {
    return <View>
      <Text style={{ fontSize: 10.5, color: c.muted, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>{k}</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color: c.ink, marginTop: 1 }}>{v}</Text>
    </View>;
  }
}

/** Số chỗ bị chiếm trong một phòng: EXCLUSIVE khoá TRỌN sức chứa, SHARED đúng số chỗ giữ. */
function heldIn(vm: UnitVM, roomId: string, capacity: number): number {
  let h = 0;
  for (const cv of vm.contracts) for (const cr of cv.contract.rooms) {
    if (cr.roomId !== roomId) continue;
    h += cr.mode === 'EXCLUSIVE' ? capacity : (cr.slotsHeld ?? 0);
  }
  return Math.min(h, capacity);
}

/* ------------------------------------------------------------------ Tổng quan */

function Overview({ vm, today }: { vm: UnitVM; today: Date }) {
  const c = useTheme();
  const m = vm.money;
  const ext = vm.contracts.map(x => x.contract.extension).find(Boolean);
  return (
    <View>
      {vm.unit.maintenance ? <Callout tone="warn" style={{ marginTop: 16 }}><Txt><Txt b>Đang bảo trì.</Txt>{vm.unit.maintenanceNote ? `\n${vm.unit.maintenanceNote}` : ''}</Txt></Callout> : null}
      {m.kind === 'term' ? <Callout tone="term" style={{ marginTop: 16 }}><Txt>
        <Txt b>Đã quá mốc thanh lý ({LATE_POLICY.terminateAfterDays} ngày).</Txt>{'\n'}{m.detail} · đang nợ <Txt b>{formatVND(m.owed)}</Txt>{m.penalty ? <Txt> + phạt <Txt b>{formatVND(m.penalty)}</Txt></Txt> : null}.{'\n'}
        Theo Điều 10.3 hợp đồng, chủ nhà có quyền đơn phương chấm dứt và thu hồi căn, không hoàn cọc.</Txt></Callout> : null}
      {ext ? <Callout tone={ext.status === 'PENDING' ? 'warn' : 'info'} style={{ marginTop: 16 }}><Txt>
        <Txt b>{ext.status === 'PENDING' ? 'Khách xin đóng trễ — chờ duyệt' : 'Đã cho khất'}</Txt>{'\n'}
        Dời hạn tới <Txt b>{formatDay(ext.newDue)}</Txt> · lý do: {ext.reason}{'\n'}
        Được duyệt thì <Txt b>không tính phạt</Txt> trong thời hạn đã khất. Quản lý tự duyệt nếu dời ≤ {LATE_POLICY.managerApproveMaxDays} ngày, quá thì cần chủ nhà.</Txt></Callout> : null}

      {vm.contracts.length ? <View style={{ marginTop: 18 }}>
        <SecH>Thời gian chuyển vào / ra</SecH>
        {vm.contracts.map(cv => {
          const d = daysBetween(cv.contract.endsOn, today);
          return (
            <Panel key={cv.contract.id} style={{ padding: 14, marginBottom: 9 }}>
              <Text style={{ fontFamily: mono, fontSize: 17, fontWeight: '700', color: c.ink }}>
                {formatDay(cv.contract.moveIn)} – {formatDay(cv.contract.endsOn)}</Text>
              <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 5, lineHeight: 17 }}>
                {d >= 0 ? `còn ${d <= 45 ? `${d} ngày` : `${Math.round(d / 30)} tháng`}` : `đã hết hạn ${-d} ngày`} · vào ở {cv.occupants.length} người{'\n'}
                HĐ <Text style={{ fontFamily: mono }}>{cv.contract.code}</Text></Text>
              {d >= 0 && d <= 30 ? <Pill label="Sắp hết hạn" fg={c.mSoon} bg={c.mSoonBg} style={{ marginTop: 9 }} /> : null}
            </Panel>
          );
        })}
      </View> : null}

      <View style={{ marginTop: 18 }}>
        <SecH>Thông tin căn hộ</SecH>
        <Panel>
          <KV k="Số lượng phòng ngủ" v={String(vm.unit.bedrooms)} />
          <KV k="Số lượng WC" v={String(vm.unit.bathrooms)} />
          <KV k="Người tối đa / phòng ngủ" v={vm.unit.rooms.map(r => `${r.name}: ${r.capacity}`).join(' · ')} />
          <KV k="Sức chứa cả căn" v={`${vm.state.capacity} chỗ`} />
          {vm.unit.rooms.map(r => <KV key={r.id} k={`Giá ${r.name}`} v={formatVND(r.rent)} small={`thuê lẻ ${formatVND(slotPrice(r))}/người`} />)}
          <KV k="Giá niêm yết cả căn" v={`${formatVND(vm.unit.rooms.reduce((a, r) => a + r.rent, 0))}/tháng`} vColor={c.accentDeep} small={`tổng giá ${vm.unit.rooms.length} phòng`} />
          <KV k="Phí dịch vụ" v={`${formatVND(vm.unit.serviceFee)}/tháng`} last />
        </Panel>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ Phòng & người ở */

function Rooms({ vm, onPerson, onRent }: { vm: UnitVM; onPerson: (p: OccupantVM) => void; onRent: () => void }) {
  const c = useTheme();
  return (
    <View style={{ marginTop: 18 }}>
      {vm.unit.rooms.map(r => {
        const held = heldIn(vm, r.id, r.capacity);
        const cs = vm.contracts.filter(cv => cv.contract.rooms.some(cr => cr.roomId === r.id));
        const mode = cs[0]?.contract.rooms.find(cr => cr.roomId === r.id)?.mode;
        const ps = cs.flatMap(cv => cv.occupants.filter(p => p.roomId === r.id).map(p => ({ p, code: cv.contract.code })));
        const tag = !cs.length ? ['Trống', c.stEmpty, c.stEmptyBg] : mode === 'EXCLUSIVE' ? ['Thuê trọn phòng', c.stFull, c.stFullBg] : ['Ở ghép', c.stPartial, c.stPartialBg];
        return (
          <Panel key={r.id} style={{ padding: 14, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.ink }}>{r.name}  <Text style={{ fontSize: 12, color: c.muted, fontWeight: '500' }}>{held}/{r.capacity} chỗ</Text></Text>
              <Pill label={tag[0]!} fg={tag[1]!} bg={tag[2]!} />
            </View>
            <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 4 }}>
              Bao phòng <Text style={{ color: c.accentDeep, fontWeight: '700' }}>{formatVND(r.rent)}</Text>/tháng · thuê lẻ <Text style={{ color: c.accentDeep, fontWeight: '700' }}>{formatVND(slotPrice(r))}</Text>/người</Text>
            <View style={{ flexDirection: 'row', gap: 5, marginTop: 11 }}>
              {Array.from({ length: r.capacity }, (_, i) => (
                <View key={i} style={{ flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: i < held ? c.stFullBg : c.surface2, borderWidth: i < held ? 0 : 1, borderStyle: 'dashed', borderColor: c.line }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: i < held ? c.stFull : c.muted }}>{i < held ? 'đã chiếm' : 'còn trống'}</Text>
                </View>
              ))}
            </View>
            {ps.map(({ p, code }) => (
              <Pressable key={p.id} onPress={() => onPerson(p)} accessibilityRole="button" accessibilityLabel={`Xem thông tin ${p.name}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.line2 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.accent, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: c.accentDeep }}>i</Text></View>
                <Initials name={p.name} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: c.ink }}>{p.name}{p.primary ? <Text style={{ fontSize: 10, fontWeight: '700', color: c.accentDeep }}> · đại diện</Text> : null}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 11.5, color: c.muted, marginTop: 1, fontFamily: mono }}>{code} · {p.phone}</Text>
                </View>
                {p.idFrontPath || p.idBackPath ? <Pill label="CCCD" fg={c.stFull} bg={c.stFullBg} /> : null}
              </Pressable>
            ))}
            {mode === 'EXCLUSIVE' && ps.length < r.capacity ? <Callout tone="info"><Txt style={{ fontSize: 11.5 }}>
              Phòng thuê trọn — <Txt b style={{ fontSize: 11.5 }}>vẫn tính là kín</Txt> dù mới {ps.length}/{r.capacity} người ở, nên app không mời thêm khách lạ vào đây.</Txt></Callout> : null}
            {held < r.capacity ? <Row><Btn kind="g" block label={`Cho thuê ${r.name}`} onPress={onRent} /></Row> : null}
          </Panel>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ Hợp đồng */

function Contracts({ vm, today }: { vm: UnitVM; today: Date }) {
  const c = useTheme();
  if (!vm.contracts.length) return <Empty icon="book" title="Chưa có hợp đồng" detail="Căn này đang trống." />;
  return (
    <View style={{ marginTop: 18 }}>
      {vm.contracts.length > 1 ? <Callout tone="info" style={{ marginTop: 0, marginBottom: 12 }}><Txt>
        Căn này có <Txt b>{vm.contracts.length} hợp đồng</Txt> chạy song song — mỗi HĐ có ngày đóng tiền riêng.</Txt></Callout> : null}
      {vm.contracts.map(cv => {
        const k = cv.contract;
        const d = daysBetween(k.endsOn, today);
        const rep = cv.occupants.find(p => p.primary);
        return (
          <View key={k.id}>
            <SecH style={{ marginTop: 6 }}>HĐ <Text style={{ fontFamily: mono }}>{k.code}</Text></SecH>
            <Panel style={{ marginBottom: 16 }}>
              <KV k="Phòng thuê" v={k.rooms.map(cr => {
                const r = vm.unit.rooms.find(x => x.id === cr.roomId);
                return `${r?.name ?? '?'} ${cr.mode === 'EXCLUSIVE' ? '(trọn phòng)' : `(ghép ${cr.slotsHeld} chỗ)`}`;
              }).join(' · ')} />
              <KV k="Tiền nhà" v={formatVND(k.rent)} small="mỗi tháng" />
              <KV k="Tiền dịch vụ" v={formatVND(k.serviceFee)} small="đóng ngày 1 hằng tháng" />
              <KV k="Phương thức" v={`${k.cycleMonths} tháng/lần`} small={`${formatVND(k.rent * k.cycleMonths)} mỗi kỳ`} />
              <KV k="Cách đóng tiền" v={`${k.cycleMonths} cọc ${k.depositMonths}`} vColor={c.accentDeep} small={`cọc ${formatVND(k.rent * k.depositMonths)}`} />
              <KV k="Thời hạn HĐ" v={`${formatDay(k.moveIn)} – ${formatDay(k.endsOn)}`} small={d <= 30 ? `còn ${d} ngày` : `còn ${Math.round(d / 30)} tháng`} />
              <KV k="Ngày đóng tiền" v={`Ngày ${k.moveIn.getDate()}`} small="neo theo ngày chuyển vào" />
              <KV k="Ai đóng tiền" v={k.payMode === 'SPLIT_EQUAL'
                ? `Chia đều ${cv.occupants.length} người` : `Đại diện đóng — ${rep?.name ?? '—'}`} last />
            </Panel>
            <SecH>Người ở — {cv.occupants.length} người</SecH>
            <Panel style={{ paddingHorizontal: 14, paddingVertical: 4, marginBottom: 22 }}>
              {cv.occupants.map(p => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 }}>
                  <Initials name={p.name} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '600', color: c.ink }}>{p.name}{p.primary ? <Text style={{ fontSize: 10, fontWeight: '700', color: c.accentDeep }}> · đại diện</Text> : null}</Text>
                    <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 1 }}>{vm.unit.rooms.find(r => r.id === p.roomId)?.name} · {p.phone}{p.idNumber ? ` · CCCD ${p.idNumber}` : ''}</Text>
                  </View>
                </View>
              ))}
            </Panel>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ Thu chi */

function Money({ vm, today, onQR, onCash }: {
  vm: UnitVM; today: Date; onQR: (cv: ContractVM) => void; onCash: (cv: ContractVM) => void;
}) {
  const c = useTheme();
  const [log, setLog] = useState<LogVM[] | null>(null);
  useEffect(() => { void loadUnitLog(vm.unit.id).then(setLog).catch(() => setLog([])); }, [vm.unit.id, vm.money.owed]);

  if (!vm.contracts.length) return <Empty icon="book" title="Chưa có khoản thu" detail="Kỳ thu tiền được sinh tự động khi hợp đồng bắt đầu." />;
  return (
    <View>
      {vm.contracts.map(cv => {
        const k = cv.contract;
        const upcoming = cv.invoices.filter(iv => !iv.paid).slice(0, 5);
        const recent = cv.invoices.filter(iv => iv.paid).slice(-3).reverse();
        const lateOnes = cv.invoices.filter(iv => iv.late);
        const owed = lateOnes.reduce((a, iv) => a + iv.owed, 0);
        const line = (iv: ContractVM['invoices'][number]) => {
          const dot = iv.paid ? c.stFull : iv.late ? c.danger : c.surface;
          return (
            <View key={iv.periodId} style={{ flexDirection: 'row', gap: 11, paddingVertical: 10 }}>
              <View style={{ width: 11, height: 11, borderRadius: 6, marginTop: 5, backgroundColor: dot, borderWidth: 2.5, borderColor: iv.paid ? c.stFull : iv.late ? c.danger : c.line }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: c.ink }}>{iv.type === 'RENT' ? `Tiền nhà · ${k.cycleMonths} tháng` : 'Tiền dịch vụ'}</Text>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.ink }}>{formatVND(iv.amount)}</Text>
                </View>
                <Text style={{ fontSize: 11.5, color: iv.late ? c.danger : c.muted, marginTop: 2 }}>
                  Hạn {formatDay(iv.due)} · kỳ {formatDayMonth(iv.periodFrom)}–{formatDayMonth(iv.periodTo)}
                  {iv.paid ? ' · đã đóng' : iv.late ? ' · QUÁ HẠN' : ''}
                  {!iv.paid && iv.paidAmount > 0 ? ` · đã nhận ${formatVND(iv.paidAmount)}, còn ${formatVND(iv.owed)}` : ''}</Text>
              </View>
            </View>
          );
        };
        return (
          <View key={k.id} style={{ marginTop: 18 }}>
            <SecH>HĐ <Text style={{ fontFamily: mono }}>{k.code}</Text></SecH>
            {owed ? <Callout tone="warn" style={{ marginTop: 0, marginBottom: 12 }}><Txt><Txt b>Đang nợ {formatVND(owed)}</Txt> — {lateOnes.length} kỳ quá hạn.</Txt></Callout> : null}
            {k.extension ? <Callout tone={k.extension.status === 'PENDING' ? 'warn' : 'info'} style={{ marginTop: 0, marginBottom: 12 }}><Txt>
              {k.extension.status === 'PENDING' ? 'Khách xin đóng trễ tới ' : 'Đã cho khất tới '}<Txt b>{formatDay(k.extension.newDue)}</Txt> — {k.extension.reason}.</Txt></Callout> : null}
            <Panel style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
              {upcoming.map(line)}
              {recent.length ? <Text style={{ fontSize: 11.5, color: c.muted, fontWeight: '600', paddingTop: 12, paddingBottom: 4 }}>Đã đóng gần đây</Text> : null}
              {recent.map(line)}
              {!upcoming.length && !recent.length ? <Txt muted style={{ paddingVertical: 12 }}>Chưa có kỳ thu nào.</Txt> : null}
            </Panel>

            {cv.openRequest ? <>
              <SecH style={{ marginTop: 22 }}>Yêu cầu thanh toán đang mở</SecH>
              <Panel style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={{ fontFamily: mono, fontWeight: '800', letterSpacing: 0.6, color: c.ink }}>{cv.openRequest.code}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ fontWeight: '700', color: c.ink }}>{formatVND(cv.openRequest.amount)}</Text>
                </View>
                <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 4 }}>
                  {cv.openRequest.docNo} · {cv.openRequest.periodIds.length} kỳ · {cv.openRequest.status === 'SENT' ? 'đã gửi khách' : 'chưa gửi'}</Text>
                <Row><Btn kind="s" block label="Xem mã QR" onPress={() => onQR(cv)} /></Row>
              </Panel>
            </> : null}
            {upcoming.some(iv => daysBetween(iv.due, today) <= 3) ? (
              <Row>
                {!cv.openRequest ? <Btn icon="qr" label="Tạo yêu cầu thanh toán" style={{ flex: 1 }} onPress={() => onQR(cv)} /> : null}
                <Btn kind="s" label="Ghi nhận tiền mặt" style={cv.openRequest ? { flex: 1 } : undefined} onPress={() => onCash(cv)} />
              </Row>
            ) : null}
          </View>
        );
      })}

      {log && log.length ? <>
        <SecH style={{ marginTop: 24 }}>Nhật ký xử lý · {log.length} dòng</SecH>
        <Panel style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          {log.map(l => (
            <View key={l.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.line2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: c.ink }}>{l.action}</Text>
                {l.amount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.ink }}>{formatVND(l.amount)}</Text> : null}
              </View>
              <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 2 }}>{fmtTime(l.at)} · {l.actor}</Text>
              {l.entityId ? <Text style={{ fontSize: 11, color: c.muted, fontFamily: mono, marginTop: 2 }}>{l.entityId}{l.meta?.receipt ? ` · ${l.meta.receipt}` : ''}</Text> : null}
            </View>
          ))}
        </Panel>
      </> : null}
    </View>
  );
}

export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ------------------------------------------------------------------ Ghi chú */

function Notes({ vm, me }: { vm: UnitVM; me: string }) {
  const c = useTheme();
  const toast = useToast();
  const [notes, setNotes] = useState<NoteVM[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => loadNotes(vm.unit.id).then(setNotes).catch(() => setNotes([])), [vm.unit.id]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try { await addNote(vm.unit.id, body, me); setDraft(''); await load(); toast('Đã thêm ghi chú'); }
    catch (e) { toast(await errorText(e)); }
    finally { setBusy(false); }
  };
  const idPhotos = vm.contracts.flatMap(x => x.occupants).reduce((a, p) => a + (p.idFrontPath ? 1 : 0) + (p.idBackPath ? 1 : 0), 0);

  return (
    <View style={{ marginTop: 18 }}>
      <SecH>Ghi chú</SecH>
      <TextInput value={draft} onChangeText={setDraft} multiline placeholder="Ghi chú mới — có dấu thời gian và tên người ghi"
        placeholderTextColor={c.muted} accessibilityLabel="Ghi chú mới"
        style={{ minHeight: 70, borderWidth: 1, borderColor: c.line, borderRadius: 15, padding: 12, fontSize: 13.5, color: c.ink, backgroundColor: c.surface, textAlignVertical: 'top' }} />
      <Row style={{ marginTop: 9 }}><Btn kind="g" block label="+ Thêm ghi chú" onPress={save} busy={busy} disabled={!draft.trim()} /></Row>
      <View style={{ marginTop: 12 }}>
        {notes === null ? <Txt muted>Đang tải…</Txt> : notes.length === 0
          ? <Empty title="Chưa có ghi chú" detail="Ghi chú có dấu thời gian và tên người ghi, không ghi đè lên nhau." />
          : notes.map(n => (
            <Panel key={n.id} style={{ padding: 13, marginBottom: 9 }}>
              <Text style={{ fontSize: 11, color: c.muted, fontWeight: '600', marginBottom: 4 }}>{fmtTime(n.createdAt)} · {n.by}</Text>
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: c.ink2 }}>{n.body}</Text>
            </Panel>
          ))}
      </View>
      <SecH style={{ marginTop: 24 }}>Tài liệu</SecH>
      <Panel>
        <KV k="Ảnh CCCD" v={idPhotos ? `${idPhotos} ảnh` : '—'} />
        <KV k="Video bàn giao" v="—" small="làm ở đợt sau" last />
      </Panel>
    </View>
  );
}
