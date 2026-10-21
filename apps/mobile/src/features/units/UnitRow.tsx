/**
 * Một dòng căn hộ — thành phần được nhìn nhiều nhất của cả app.
 *
 *  1. HAI TRỤC TRẠNG THÁI độc lập: dải màu bên trái = tình trạng nhà, nhãn bên phải
 *     = trạng thái tiền. Căn "đã đầy" vẫn có thể "đang nợ".
 *  2. KHÔNG TỰ TÍNH TIỀN. Mọi con số do `@homescare/core` tính; màn hình chỉ vẽ.
 *  3. KHÔNG TỰ CHỌN MÀU. Hỏi bảng tra `moneyTone` / `unitTone`.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatShortVND, formatVND } from '@homescare/core';
import type { UnitVM } from '../../data/model';
import { useTheme } from '../../theme/useTheme';
import { moneyTone, unitTone } from '../../theme/statusStyle';
import { Icon } from '../../ui/Icon';
import { Pill, mono } from '../../ui/kit';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Nhãn tiền: câu cụ thể do core tính ("trễ 14 ngày", "còn 2 ngày"), không thì nhãn chung. */
export function moneyLabel(vm: UnitVM, generic: string): string {
  const m = vm.money;
  if (m.kind === 'ok' || m.kind === 'none' || m.kind === 'bill') return generic;
  return cap(m.detail);
}

export function UnitRow({ vm, onPress, bare, matched }: {
  vm: UnitVM; onPress: (id: string) => void; bare?: boolean;
  matched?: { name: string; phone: string; more: number };
}) {
  const c = useTheme();
  const st = unitTone(c)[vm.state.status];
  const mn = moneyTone(c)[vm.money.kind];
  const m = vm.money;
  const label = moneyLabel(vm, mn.label);
  const rent = vm.unit.rooms.reduce((a, r) => a + r.rent, 0);
  const amount = m.owed > 0 ? formatVND(m.owed)
    : m.kind === 'soon' && m.upcomingAmount ? formatVND(m.upcomingAmount) : null;

  return (
    <Pressable
      onPress={() => onPress(vm.unit.id)}
      accessibilityRole="button"
      accessibilityLabel={`Căn ${vm.unit.code}, ${st.label}, ${label}`}
      style={({ pressed }) => [s.row, { borderBottomColor: c.line2 }, pressed && { backgroundColor: c.surface2 }]}
    >
      {!bare && <View style={[s.rail, { backgroundColor: st.fg }]} />}
      <View style={[s.body, bare && { paddingLeft: 13, paddingRight: 13 }]}>
        <View style={s.l1}>
          <Text style={[s.code, { color: c.ink }]} numberOfLines={1}>{vm.unit.code}</Text>
          <Text style={[s.pn, { color: c.muted }]}>{vm.unit.bedrooms}PN·{vm.unit.bathrooms}WC</Text>
          <View style={{ flex: 1 }} />
          <Pill label={label} fg={mn.fg} bg={mn.bg} dashed={m.kind === 'wait'} style={{ maxWidth: 190 }} />
        </View>
        <View style={s.l2}>
          <View style={[s.sq, { backgroundColor: st.fg }]} />
          <Text style={[s.meta, { color: st.fg, fontWeight: '700' }]}>{st.label}</Text>
          <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
            {' · '}{vm.state.held}/{vm.state.capacity} chỗ · {formatShortVND(rent)}/tháng
          </Text>
          <View style={{ flex: 1 }} />
          {amount ? <Text style={[s.amt, { color: mn.fg }]}>{amount}</Text> : null}
        </View>
        {matched ? (
          <View style={s.l3}>
            <Icon name="search" size={12} color={c.accentDeep} />
            <Text style={{ fontSize: 11, color: c.accentDeep, fontWeight: '600' }} numberOfLines={1}>
              {matched.name} · {matched.phone}{matched.more > 0 ? ` +${matched.more} người nữa` : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', borderBottomWidth: 1 },
  rail: { width: 3, borderRadius: 2, marginVertical: 10 },
  body: { flex: 1, minWidth: 0, paddingVertical: 10, paddingLeft: 11 },
  l1: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { fontSize: 14.5, fontWeight: '700', letterSpacing: -0.2, fontFamily: mono },
  pn: { fontSize: 10, fontWeight: '600' },
  l2: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  sq: { width: 7, height: 7, borderRadius: 2, marginRight: 5 },
  meta: { fontSize: 11, fontWeight: '500' },
  amt: { fontSize: 11.5, fontWeight: '700' },
  l3: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
});
