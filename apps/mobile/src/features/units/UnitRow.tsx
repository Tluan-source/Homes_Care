/**
 * Một dòng căn hộ trong danh sách — thành phần được nhìn nhiều nhất của cả app,
 * nên nó là KHUÔN MẪU cho mọi thành phần khác. Bốn điều nó thể hiện:
 *
 *  1. HAI TRỤC TRẠNG THÁI độc lập: dải màu bên trái = tình trạng nhà, nhãn bên phải
 *     = trạng thái tiền. Căn "đã đầy" vẫn có thể "đang nợ".
 *  2. KHÔNG TỰ TÍNH TIỀN. Mọi con số do `@homescare/core` tính; màn hình chỉ vẽ.
 *  3. KHÔNG TỰ CHỌN MÀU. Hỏi bảng tra `moneyTone` / `unitTone`.
 *  4. KHÔNG ĐỌC ĐỒNG HỒ. `today` truyền từ trên xuống, để test cố định được.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatShortVND, formatVND,
  type MoneyState, type Unit, type UnitState,
} from '@homescare/core';
import { useTheme } from '../../theme/useTheme';
import { moneyTone, unitTone } from '../../theme/statusStyle';
import { space, type } from '../../theme/tokens';

export interface UnitRowProps {
  unit: Unit;
  state: UnitState;
  money: MoneyState;
  /** Người thuê khớp từ khoá tìm kiếm — hiện ra để người dùng biết VÌ SAO dòng này
   *  xuất hiện khi họ gõ tên thay vì gõ mã căn. */
  matchedOccupant?: { name: string; phone: string };
  onPress: (unitId: string) => void;
}

export function UnitRow({ unit, state, money, matchedOccupant, onPress }: UnitRowProps) {
  const c = useTheme();
  const st = unitTone(c)[state.status];
  const mn = moneyTone(c)[money.kind];

  // Nhãn tiền: ưu tiên câu mô tả cụ thể do core tính ("trễ 14 ngày", "còn 2 ngày"),
  // chỉ rơi về nhãn chung khi không có gì cụ thể hơn để nói.
  const moneyLabel =
    money.kind === 'ok' || money.kind === 'none' ? mn.label : capitalize(money.detail);

  // Số tiền bên phải: nợ gốc nếu đang nợ, số sắp phải đóng nếu sắp tới hạn.
  const amount =
    money.owed > 0 ? formatVND(money.owed)
    : money.kind === 'soon' && money.upcomingAmount ? formatVND(money.upcomingAmount)
    : null;

  return (
    <Pressable
      onPress={() => onPress(unit.id)}
      accessibilityRole="button"
      accessibilityLabel={`Căn ${unit.code}, ${st.label}, ${moneyLabel}`}
      style={({ pressed }) => [
        s.row,
        { borderBottomColor: c.line2, backgroundColor: pressed ? c.surface2 : 'transparent' },
      ]}
    >
      <View style={[s.rail, { backgroundColor: st.fg }]} />

      <View style={s.body}>
        <View style={s.line1}>
          <Text style={[s.code, { color: c.ink }]} numberOfLines={1}>{unit.code}</Text>
          <Text style={[s.rooms, { color: c.muted }]}>
            {unit.bedrooms}PN·{unit.bathrooms}WC
          </Text>
          <View style={s.grow} />
          <View style={[s.pill, { backgroundColor: mn.bg }]}>
            <View style={[s.dot, { backgroundColor: mn.fg }]} />
            <Text style={[s.pillText, { color: mn.fg }]} numberOfLines={1}>{moneyLabel}</Text>
          </View>
        </View>

        <View style={s.line2}>
          <View style={[s.chip, { backgroundColor: st.fg }]} />
          <Text style={[s.meta, { color: st.fg, fontWeight: '700' }]}>{st.label}</Text>
          <Text style={[s.meta, { color: c.muted }]}>
            {' · '}{state.held}/{state.capacity} chỗ{' · '}
            {formatShortVND(unit.rooms.reduce((a, r) => a + r.rent, 0))}/tháng
          </Text>
          <View style={s.grow} />
          {amount && <Text style={[s.amount, { color: mn.fg }]}>{amount}</Text>}
        </View>

        {matchedOccupant && (
          <View style={[s.match, { backgroundColor: c.accentSoft }]}>
            <Text style={[s.matchText, { color: c.accentDeep }]} numberOfLines={1}>
              {matchedOccupant.name} · {matchedOccupant.phone}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const s = StyleSheet.create({
  row:   { flexDirection: 'row', borderBottomWidth: 1 },
  rail:  { width: 3, borderRadius: 2, marginVertical: 10 },
  body:  { flex: 1, minWidth: 0, paddingVertical: 10, paddingLeft: space.md },
  line1: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  line2: { flexDirection: 'row', alignItems: 'center', marginTop: space.xs },
  grow:  { flex: 1 },
  code:  { ...type.title, fontSize: 14.5, letterSpacing: -0.2 },
  rooms: { ...type.tiny, fontWeight: '600' },
  pill:  { flexDirection: 'row', alignItems: 'center', gap: 5,
           paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: 6, maxWidth: 170 },
  pillText: { ...type.tiny },
  dot:   { width: 5, height: 5, borderRadius: 3 },
  chip:  { width: 7, height: 7, borderRadius: 2, marginRight: 5 },
  meta:  { ...type.meta, fontSize: 11 },
  amount:{ ...type.meta, fontSize: 11.5, fontWeight: '700' },
  match: { marginTop: 5, paddingHorizontal: space.sm, paddingVertical: 4,
           borderRadius: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  matchText: { ...type.tiny, fontWeight: '600' },
});
