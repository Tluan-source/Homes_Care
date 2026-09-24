/**
 * DANH SÁCH CĂN HỘ — màn hình chính (đặc tả 6.1). Dựng theo bản demo:
 * khu → tòa → gập theo tòa, thẻ số liệu, "Tất cả / Việc cần làm", lọc hai trục.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { formatShortVND, formatVND, isUrgent } from '@homescare/core';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../app/auth';
import { useData } from '../../app/data';
import type { UnitVM } from '../../data/model';
import { useTheme } from '../../theme/useTheme';
import { moneyTone, unitTone } from '../../theme/statusStyle';
import { Icon } from '../../ui/Icon';
import {
  Avatar, Callout, Chip, ChipRow, Empty, Header, Loading, Pill, Seg, StatBar, Txt, mono, shadowSm, st as kit, useToast,
} from '../../ui/kit';
import { FilterSheet } from './FilterSheet';
import { NO_FILTERS, SORT_LABEL, countFilters, isSoon, isTask, matchQuery, passes, sortUnits, type Filters } from './filters';
import { UnitRow } from './UnitRow';
import { initialsOf } from '../account/initials';

export function UnitsScreen() {
  const c = useTheme();
  const nav = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const toast = useToast();
  const { profile } = useAuth();
  const { bundle, loading, error, refresh } = useData();

  const [zoneId, setZoneId] = useState<string | null>(null);
  const [towerId, setTowerId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'all' | 'tasks'>('all');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [expand, setExpand] = useState<Record<string, boolean>>({});

  const zones = bundle?.zones ?? [];
  const zone = zones.find(z => z.id === zoneId) ?? zones[0];
  const searching = q.trim().length > 0;

  // Phạm vi: đang tìm thì XUYÊN mọi khu/tòa (quản lý chỉ nhớ mã căn hoặc tên khách);
  // không tìm thì theo khu + tòa đang chọn.
  const { scope, matches } = useMemo(() => {
    const all = bundle?.units ?? [];
    const matches = new Map<string, { name: string; phone: string }[]>();
    if (searching) {
      const hit = all.filter(u => {
        const m = matchQuery(u, q);
        if (m.hit && m.people.length) matches.set(u.unit.id, m.people);
        return m.hit;
      });
      return { scope: hit, matches };
    }
    return {
      scope: all.filter(u => u.zone.id === zone?.id && (!towerId || u.tower.id === towerId)),
      matches,
    };
  }, [bundle, searching, q, zone?.id, towerId]);

  if (!bundle) {
    if (error) return <View style={{ flex: 1, backgroundColor: c.app, padding: 24, justifyContent: 'center' }}>
      <Empty icon="x" title="Không tải được dữ liệu" detail={error} />
      <Pressable onPress={refresh}><Text style={{ textAlign: 'center', color: c.accentDeep, fontWeight: '700' }}>Thử lại</Text></Pressable>
    </View>;
    return <Loading />;
  }

  const list = sortUnits(scope.filter(u => passes(u, filters)), filters.sort);
  const cnt = (k: string) => scope.filter(u => u.state.status === k).length;
  const tasks = scope.filter(isTask).length;
  const ut = unitTone(c), mt = moneyTone(c);
  const towersInZone = bundle.towers.filter(t => t.zoneId === zone?.id);
  const openUnit = (id: string) => nav.navigate('UnitDetail', { unitId: id });

  const active = [
    ...filters.house.map(k => ({ key: `h:${k}`, label: ut[k].label, color: ut[k].fg, off: () => setFilters({ ...filters, house: filters.house.filter(x => x !== k) }) })),
    ...filters.money.map(k => ({ key: `m:${k}`, label: mt[k].label, color: mt[k].fg, off: () => setFilters({ ...filters, money: filters.money.filter(x => x !== k) }) })),
    ...(filters.endsSoon ? [{ key: 'exp', label: 'Sắp hết HĐ', color: c.mSoon, off: () => setFilters({ ...filters, endsSoon: false }) }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.app }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[]}
      >
        <Header eyebrow={profile?.orgName || 'HomesCare'} title="Quản lý Căn hộ"
          right={<Avatar label={initialsOf(profile?.fullName ?? '')} onPress={() => nav.navigate('Account')} />}>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <View style={[searchBox, { backgroundColor: c.surface }]}>
              <Icon name="search" color={c.muted} size={17} />
              <TextInput value={q} onChangeText={setQ} placeholder="Tìm mã căn, tên hoặc SĐT khách"
                placeholderTextColor={c.muted} accessibilityLabel="Tìm kiếm căn hộ"
                style={{ flex: 1, fontSize: 14, color: c.ink, paddingVertical: 0 }} returnKeyType="search" />
              {q ? <Pressable onPress={() => setQ('')} accessibilityLabel="Xoá tìm kiếm"><Icon name="x" color={c.muted} size={16} /></Pressable> : null}
            </View>
            <Pressable onPress={() => toast('Thêm căn hộ — làm ở đợt sau')} accessibilityRole="button"
              style={[searchBox, { flex: 0, paddingHorizontal: 15, backgroundColor: c.surface }]}>
              <Icon name="plus" color={c.accentDeep} size={17} />
              <Text style={{ fontWeight: '700', fontSize: 14, color: c.ink }}>Thêm</Text>
            </Pressable>
          </View>
          <ChipRow style={{ marginTop: 14 }}>
            {zones.map(z => (
              <Chip key={z.id} onHeader label={z.name} on={!searching && zone?.id === z.id}
                count={bundle.units.filter(u => u.zone.id === z.id).length}
                onPress={() => { setZoneId(z.id); setTowerId(null); setQ(''); }} />
            ))}
          </ChipRow>
          <ChipRow style={{ marginTop: 8 }}>
            <Chip onHeader small label="Tất cả" count={`${towersInZone.length} tòa`} on={!searching && !towerId}
              onPress={() => { setTowerId(null); setQ(''); }} />
            {towersInZone.map(t => (
              <Chip key={t.id} onHeader small monoLabel label={t.code} on={!searching && towerId === t.id}
                count={bundle.units.filter(u => u.tower.id === t.id).length}
                onPress={() => { setTowerId(t.id); setQ(''); }} />
            ))}
          </ChipRow>
        </Header>

        <View style={{ paddingHorizontal: 16 }}>
          <StatBar>
            <StatItem n={scope.length} label="căn" color={c.ink2} />
            <Sep />
            <StatItem n={cnt('full')} label="đầy" color={c.stFull} />
            <Sep />
            <StatItem n={cnt('partial')} label="còn chỗ" color={c.stPartial} />
            <Sep />
            <StatItem n={cnt('empty')} label="trống" color={c.stEmpty} />
            <Sep />
            <StatItem n={cnt('maint')} label="bảo trì" color={c.stMaint} />
          </StatBar>

          {searching ? (
            <Callout tone="info"><Txt>Đang tìm <Txt b>“{q.trim()}”</Txt> theo <Txt b>mã căn, tên người thuê và số điện thoại</Txt> — cả {zones.length} khu, {bundle.towers.length} tòa. Gõ không dấu vẫn ra.</Txt></Callout>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 13 }}>
            <Seg value={mode} onChange={setMode} items={[
              { key: 'all', label: 'Tất cả', count: scope.length },
              { key: 'tasks', label: 'Việc cần làm', count: tasks },
            ]} />
            <Pressable onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel="Lọc"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accent, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 13 }}>
              <Icon name="filter" color={c.accentInk} size={16} />
              <Text style={{ color: c.accentInk, fontWeight: '700', fontSize: 12.5 }}>Lọc</Text>
              {countFilters(filters) ? <View style={{ backgroundColor: c.accentInk, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ color: c.accent, fontSize: 9.5, fontWeight: '700' }}>{countFilters(filters)}</Text></View> : null}
            </Pressable>
          </View>
        </View>

        {active.length ? (
          <ChipRow style={{ paddingHorizontal: 16, marginTop: 11 }}>
            {active.map(a => (
              <Pressable key={a.key} onPress={a.off} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 }}>
                <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: a.color }} />
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: c.ink2 }}>{a.label}</Text>
                <Text style={{ color: c.muted, fontSize: 13 }}>×</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setFilters({ ...NO_FILTERS, sort: filters.sort })} style={{ borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: c.accentDeep }}>Xoá hết</Text>
            </Pressable>
          </ChipRow>
        ) : null}

        <View style={{ paddingHorizontal: 16 }}>
          {mode === 'tasks'
            ? <TasksPane scope={scope.filter(u => passes(u, filters))} total={scope.length} expand={expand} setExpand={setExpand} onOpen={openUnit} />
            : <AllPane list={list} grouped={filters.sort === 'code' && !towerId && !searching} searching={searching}
                sortLabel={SORT_LABEL[filters.sort]} open={open} setOpen={setOpen} onOpen={openUnit}
                matches={matches} onSort={() => setSheet(true)} />}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 }}>
            {(['empty', 'partial', 'full', 'maint'] as const).map(k => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: ut[k].fg }} />
                <Text style={{ fontSize: 11, color: c.muted }}>{ut[k].label}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <FilterSheet visible={sheet} onClose={() => setSheet(false)} scope={scope} value={filters} onChange={setFilters} />
    </View>
  );

  function StatItem({ n, label, color }: { n: number; label: string; color: string }) {
    return <Text style={{ fontSize: 11.5, color }}><Text style={{ fontWeight: '800', fontSize: 14 }}>{n}</Text> {label}</Text>;
  }
  function Sep() { return <View style={{ width: 1, height: 15, backgroundColor: c.line }} />; }
}

const searchBox = {
  flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9, height: 46, borderRadius: 15,
  paddingHorizontal: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)', ...shadowSm,
};

/* ------------------------------------------------------------------ Tất cả */

function AllPane({ list, grouped, searching, sortLabel, open, setOpen, onOpen, matches, onSort }: {
  list: UnitVM[]; grouped: boolean; searching: boolean; sortLabel: string;
  open: Record<string, boolean>; setOpen: (o: Record<string, boolean>) => void;
  onOpen: (id: string) => void; matches: Map<string, { name: string; phone: string }[]>; onSort: () => void;
}) {
  const c = useTheme();
  if (!list.length) return <Empty icon="search" title="Không có căn nào khớp" detail="Thử bỏ bớt bộ lọc hoặc xoá từ khoá tìm kiếm." />;
  const owed = list.reduce((a, u) => a + u.money.owed, 0);
  const groups: { id: string; units: UnitVM[] }[] = [];
  for (const u of list) {
    const g = groups.find(x => x.id === u.tower.id);
    if (g) g.units.push(u); else groups.push({ id: u.tower.id, units: [u] });
  }
  const allOpen = grouped && groups.every(g => open[g.id]);
  const matchOf = (u: UnitVM) => {
    const p = matches.get(u.unit.id);
    return p?.length ? { name: p[0]!.name, phone: p[0]!.phone, more: p.length - 1 } : undefined;
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 13, marginBottom: 4, marginHorizontal: 2 }}>
        <Text style={{ fontSize: 11.5, color: c.muted }}>
          <Text style={{ color: c.ink, fontWeight: '700' }}>{list.length}</Text> căn
          {owed ? <Text> · đang nợ <Text style={{ color: c.danger, fontWeight: '700' }}>{formatVND(owed)}</Text></Text> : null}
        </Text>
        {grouped
          ? <Pressable onPress={() => setOpen(allOpen ? {} : Object.fromEntries(groups.map(g => [g.id, true])))}>
              <Text style={{ color: c.accentDeep, fontWeight: '700', fontSize: 11.5 }}>{allOpen ? 'Thu gọn hết' : 'Mở hết'}</Text></Pressable>
          : <Pressable onPress={onSort}><Text style={{ color: c.accentDeep, fontWeight: '700', fontSize: 11.5 }}>↓ {sortLabel}</Text></Pressable>}
      </View>

      {grouped
        ? groups.map(g => <TowerGroup key={g.id} units={g.units} open={!!open[g.id]}
            onToggle={() => setOpen({ ...open, [g.id]: !open[g.id] })} onOpen={onOpen} />)
        : searching
          ? groups.map(g => (
              <View key={g.id}>
                <View style={{ flexDirection: 'row', gap: 8, paddingTop: 14, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.line2 }}>
                  <Text style={{ fontFamily: mono, fontWeight: '700', color: c.ink }}>{g.units[0]!.tower.code}</Text>
                  <Text style={{ color: c.muted, fontSize: 12 }}>{g.units[0]!.zone.name}</Text>
                </View>
                {g.units.map(u => <UnitRow key={u.unit.id} vm={u} onPress={onOpen} matched={matchOf(u)} />)}
              </View>))
          : <FloorRows units={list} onOpen={onOpen} />}
    </View>
  );
}

function FloorRows({ units, onOpen, bare }: { units: UnitVM[]; onOpen: (id: string) => void; bare?: boolean }) {
  const c = useTheme();
  const out: React.ReactNode[] = [];
  let last: number | null = null;
  for (const u of units) {
    if (u.unit.floor !== last) {
      last = u.unit.floor;
      out.push(<Text key={`f${u.tower.id}${last}`} style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, color: c.muted, paddingTop: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.line2, paddingHorizontal: bare ? 13 : 0 }}>TẦNG {last}</Text>);
    }
    out.push(<UnitRow key={u.unit.id} vm={u} onPress={onOpen} />);
  }
  return <>{out}</>;
}

/** Một tòa, gập lại được. Lúc thu gọn vẫn phải đọc ra tình hình tòa — nếu không thì
 *  gập lại chỉ để giấu thông tin. */
function TowerGroup({ units, open, onToggle, onOpen }: {
  units: UnitVM[]; open: boolean; onToggle: () => void; onOpen: (id: string) => void;
}) {
  const c = useTheme();
  const ut = unitTone(c);
  const t = units[0]!.tower;
  const need = units.filter(u => isUrgent(u.money.kind)).length;
  const soon = units.filter(u => isSoon(u.money.kind)).length;
  const owed = units.reduce((a, u) => a + u.money.owed, 0);
  const pill = (k: 'full' | 'partial' | 'empty' | 'maint') => {
    const n = units.filter(u => u.state.status === k).length;
    return n ? <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ut[k].bg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: ut[k].fg }} />
      <Text style={{ color: ut[k].fg, fontSize: 10.5, fontWeight: '700' }}>{n}</Text></View> : null;
  };
  return (
    <View style={[kit.panel, { borderColor: c.line, backgroundColor: c.surface, marginTop: 10, ...shadowSm }]}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13, paddingHorizontal: 13, backgroundColor: c.surface2 }}>
        <View style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }}><Icon name="chevron" color={c.muted} size={16} /></View>
        <Text style={{ fontFamily: mono, fontWeight: '800', fontSize: 16, color: c.ink }}>{t.code}</Text>
        <Text style={{ fontSize: 12, color: c.muted }}>{units.length} căn</Text>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', gap: 4 }}>{pill('full')}{pill('partial')}{pill('empty')}{pill('maint')}</View>
      </Pressable>
      {need || soon ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: need ? c.mLateBg : c.mSoonBg }}>
          {need ? <Pill label={`${need} căn cần thu`} fg={c.mLate} bg={c.mLateBg} /> : null}
          {soon ? <Pill label={`${soon} căn sắp tới hạn`} fg={c.mSoon} bg={c.mSoonBg} /> : null}
          <View style={{ flex: 1 }} />
          {owed ? <Text style={{ fontWeight: '700', color: c.danger, fontSize: 13 }}>{formatVND(owed)}</Text> : null}
        </View>
      ) : null}
      {open ? <View style={{ paddingHorizontal: 13 }}><FloorRows units={units} onOpen={onOpen} /></View> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ Việc cần làm */

function TasksPane({ scope, total, expand, setExpand, onOpen }: {
  scope: UnitVM[]; total: number; expand: Record<string, boolean>;
  setExpand: (e: Record<string, boolean>) => void; onOpen: (id: string) => void;
}) {
  const c = useTheme();
  const by = (k: string) => scope.filter(u => u.money.kind === k);
  const late = [...by('term'), ...by('late')];
  const wait = by('wait');
  // Sắp tới hạn xếp theo NGÀY TỚI HẠN — căn đóng ngày mai phải nằm trên căn đóng sau 3 ngày.
  const soon = by('soon').sort((a, b) => (a.money.nextDue?.getTime() ?? 0) - (b.money.nextDue?.getTime() ?? 0));
  const empty = scope.filter(u => u.state.status === 'empty');
  const calm = total - late.length - wait.length - soon.length - empty.length;
  const sum = (xs: UnitVM[]) => xs.reduce((a, u) => a + u.money.owed, 0);
  const sumSoon = (xs: UnitVM[]) => xs.reduce((a, u) => a + (u.money.upcomingAmount ?? 0), 0);

  const block = (key: string, title: string, color: string, bg: string, items: UnitVM[], extra?: string) => {
    if (!items.length) return null;
    const isOpen = expand[key];
    const show = isOpen ? items : items.slice(0, 3);
    return (
      <View key={key} style={[kit.panel, { borderColor: c.line, backgroundColor: c.surface, marginTop: 14, ...shadowSm }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, backgroundColor: c.surface2, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: color }} />
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: c.ink }}>{title}</Text>
          <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
            <Text style={{ color, fontSize: 11.5, fontWeight: '700' }}>{items.length} căn{extra ? ` · ${extra}` : ''}</Text></View>
        </View>
        {show.map(u => <UnitRow key={u.unit.id} vm={u} onPress={onOpen} bare />)}
        {items.length > 3 ? (
          <Pressable onPress={() => setExpand({ ...expand, [key]: !isOpen })} style={{ padding: 12, borderTopWidth: 1, borderTopColor: c.line2 }}>
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: c.accentDeep }}>{isOpen ? 'Thu gọn' : `Xem thêm ${items.length - 3} căn →`}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  if (!late.length && !wait.length && !soon.length && !empty.length)
    return <Empty title="Không có việc nào cần làm" detail={`Tất cả ${total} căn đang bình thường.`} />;

  return (
    <View>
      {block('late', 'Quá hạn tiền nhà', c.mLate, c.mLateBg, late, formatShortVND(sum(late)))}
      {block('wait', 'Xin đóng trễ — chờ duyệt', c.mSoon, c.mSoonBg, wait, formatShortVND(sum(wait)))}
      {block('soon', 'Sắp tới hạn trong 3 ngày', c.mSoon, c.mSoonBg, soon, formatShortVND(sumSoon(soon)))}
      {block('empty', 'Trống — cần tìm khách', c.stEmpty, c.stEmptyBg, empty)}
      {calm > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginTop: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, borderRadius: 15, backgroundColor: c.surface2 }}>
          <Icon name="check" color={c.muted} size={16} />
          <Text style={{ flex: 1, fontSize: 12, color: c.muted }}><Text style={{ fontWeight: '700', color: c.ink }}>{calm} căn</Text> còn lại đang bình thường — đã thu đủ, chưa tới kỳ.</Text>
        </View>
      ) : null}
    </View>
  );
}
