/** Bảng lọc hai trục — mỗi lựa chọn hiện sẵn SỐ LƯỢNG, bấm trước đã biết ra bao nhiêu căn. */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { MoneyStateKind, UnitStatus } from '@homescare/core';
import type { UnitVM } from '../../data/model';
import { useTheme } from '../../theme/useTheme';
import { moneyTone, unitTone } from '../../theme/statusStyle';
import { Btn, Sheet } from '../../ui/kit';
import { passes, SORT_LABEL, type Filters, type SortKey } from './filters';

const MONEY_KEYS: MoneyStateKind[] = ['late', 'term', 'wait', 'ext', 'soon', 'ok', 'none'];
const HOUSE_KEYS: UnitStatus[] = ['empty', 'partial', 'full', 'maint'];

export function FilterSheet({ visible, onClose, scope, value, onChange }: {
  visible: boolean; onClose: () => void; scope: UnitVM[]; value: Filters; onChange: (f: Filters) => void;
}) {
  const c = useTheme();
  const ut = unitTone(c), mt = moneyTone(c);
  const n = scope.filter(u => passes(u, value)).length;

  const toggle = <T,>(arr: T[], k: T) => (arr.includes(k) ? arr.filter(x => x !== k) : [...arr, k]);
  const chip = (key: string, label: string, fg: string, bg: string, count: number, on: boolean, press: () => void) => (
    <Pressable key={key} onPress={press} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 10,
        paddingVertical: 8, paddingHorizontal: 11, borderColor: on ? fg : c.line, backgroundColor: on ? bg : c.surface }}>
      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: fg }} />
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? fg : c.ink2 }}>{label}</Text>
      <Text style={{ fontSize: 11, fontWeight: '600', opacity: 0.55, color: on ? fg : c.ink2 }}>{count}</Text>
    </Pressable>
  );
  const lab = (t: string, extra?: string) => (
    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.3, color: c.muted, marginTop: 14, marginBottom: 9 }}>
      {t}{extra ? <Text style={{ letterSpacing: 0, fontWeight: '500' }}>{extra}</Text> : null}
    </Text>
  );

  return (
    <Sheet visible={visible} title="Bộ lọc" onClose={onClose}
      right={<Pressable onPress={() => onChange({ ...value, house: [], money: [], endsSoon: false })}>
        <Text style={{ color: c.accentDeep, fontWeight: '700', fontSize: 12.5 }}>Xoá hết</Text></Pressable>}
      footer={<>
        <Btn kind="s" label="Xoá lọc" onPress={() => onChange({ ...value, house: [], money: [], endsSoon: false })} />
        <Btn label={`Xem ${n} căn`} onPress={onClose} style={{ flex: 1 }} />
      </>}>
      {lab('TÌNH TRẠNG NHÀ')}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {HOUSE_KEYS.map(k => chip(k, ut[k].label, ut[k].fg, ut[k].bg,
          scope.filter(u => u.state.status === k).length, value.house.includes(k),
          () => onChange({ ...value, house: toggle(value.house, k) })))}
      </View>
      {lab('TIỀN', ' · chọn nhiều được')}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {MONEY_KEYS.map(k => chip(k, mt[k].label, mt[k].fg, mt[k].bg,
          scope.filter(u => u.money.kind === k).length, value.money.includes(k),
          () => onChange({ ...value, money: toggle(value.money, k) })))}
      </View>
      {lab('HỢP ĐỒNG')}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {chip('exp', 'Sắp hết HĐ', c.mSoon, c.mSoonBg, scope.filter(u => u.endsSoon).length, value.endsSoon,
          () => onChange({ ...value, endsSoon: !value.endsSoon }))}
      </View>
      {lab('SẮP XẾP')}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {(Object.keys(SORT_LABEL) as SortKey[]).map(k => {
          const on = value.sort === k;
          return (
            <Pressable key={k} onPress={() => onChange({ ...value, sort: k })} accessibilityRole="button"
              style={{ borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12,
                borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? c.accentInk : c.ink2 }}>{SORT_LABEL[k]}</Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
