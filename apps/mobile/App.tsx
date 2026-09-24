/**
 * Màn hình danh sách căn hộ — sợi chỉ đầu tiên chạy xuyên suốt từ lõi lên giao diện.
 *
 * Chưa nối Supabase: dữ liệu lấy từ `src/data/demo.ts`. Khi nối API thật thì chỉ đổi
 * nguồn dữ liệu, màn hình không phải sửa — đó là lý do màn hình không tự đi lấy dữ liệu.
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList, Platform, Pressable, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatShortVND, isUrgent } from '@homescare/core';

import { DEMO_ROWS, type DemoRow } from './src/data/demo';
import { UnitRow } from './src/features/units/UnitRow';
import { useTheme } from './src/theme/useTheme';
import { radius, space, type } from './src/theme/tokens';

/** Bỏ dấu tiếng Việt để so khớp tên — quản lý gõ nhanh trên điện thoại thì hiếm khi bỏ dấu. */
const noTone = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const normText = (s: string) => noTone(s).toLowerCase().trim();
const normCode = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const digits = (s: string) => s.replace(/\D/g, '');

type Mode = 'all' | 'tasks';

function UnitsScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('all');

  const { rows, urgentCount } = useMemo(() => {
    const q = query.trim();
    const qc = normCode(q), qt = normText(q), qd = digits(q);

    // Tìm được cả MÃ CĂN, TÊN và SỐ ĐIỆN THOẠI: khi khách gọi tới, quản lý biết tên
    // và số máy chứ không ai nhớ 'S219.2108'.
    const matched = (r: DemoRow) => {
      if (!q) return true;
      if (qc && normCode(r.unit.code).includes(qc)) return true;
      return r.occupants.some(p =>
        (qt.length >= 2 && normText(p.name).includes(qt)) ||
        (qd.length >= 3 && digits(p.phone).includes(qd)));
    };

    const all = DEMO_ROWS.filter(matched);
    return {
      rows: mode === 'tasks'
        ? all.filter(r => isUrgent(r.money.kind) || r.state.status === 'empty')
        : all,
      urgentCount: DEMO_ROWS.filter(r => isUrgent(r.money.kind)).length,
    };
  }, [query, mode]);

  const owed = rows.reduce((a, r) => a + r.money.owed, 0);

  const whoMatched = (r: DemoRow) => {
    const q = query.trim(); if (!q) return undefined;
    const qt = normText(q), qd = digits(q);
    return r.occupants.find(p =>
      (qt.length >= 2 && normText(p.name).includes(qt)) ||
      (qd.length >= 3 && digits(p.phone).includes(qd)));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.app }}>
      <StatusBar barStyle="dark-content" />

      {/* vùng đầu trang vàng */}
      <View style={[s.header, { backgroundColor: c.hdr2, paddingTop: insets.top + space.md }]}>
        <Text style={[s.eyebrow, { color: c.accentInk }]}>KHU CĂN HỘ NEXUS</Text>
        <Text style={[s.h1, { color: c.accentInk }]}>Quản lý Căn hộ</Text>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Tìm mã căn, tên hoặc SĐT khách"
          placeholderTextColor={c.muted}
          accessibilityLabel="Ô tìm kiếm"
          style={[s.search, { backgroundColor: c.surface, color: c.ink }]}
        />
      </View>

      {/* thẻ số liệu, đè lên mép vùng vàng */}
      <View style={[s.stat, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Text style={[s.statText, { color: c.ink2 }]}>
          <Text style={s.statNum}>{rows.length}</Text> căn
        </Text>
        {owed > 0 && (
          <Text style={[s.statText, { color: c.danger }]}>
            {'  ·  '}<Text style={s.statNum}>{formatShortVND(owed)}</Text> đang nợ
          </Text>
        )}
      </View>

      <View style={s.segWrap}>
        <View style={[s.seg, { backgroundColor: c.surface2, borderColor: c.line }]}>
          {(['all', 'tasks'] as const).map(m => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m }}
              style={[s.segBtn, mode === m && { backgroundColor: c.surface }]}
            >
              <Text style={[s.segText, { color: mode === m ? c.ink : c.muted }]}>
                {m === 'all' ? 'Tất cả' : 'Việc cần làm'}
                <Text style={{ color: c.muted }}>
                  {'  '}{m === 'all' ? DEMO_ROWS.length : urgentCount}
                </Text>
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={r => r.unit.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => (
          <UnitRow
            unit={item.unit}
            state={item.state}
            money={item.money}
            matchedOccupant={whoMatched(item)}
            onPress={() => {}}
          />
        )}
        ListEmptyComponent={
          <Text style={[s.empty, { color: c.muted }]}>
            Không có căn nào khớp. Thử bỏ bớt từ khoá.
          </Text>
        }
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <UnitsScreen />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  header:  { paddingHorizontal: space.lg, paddingBottom: space.xxl + space.md },
  eyebrow: { ...type.tiny, letterSpacing: 1.6, opacity: 0.65 },
  h1:      { ...type.h1, marginTop: 2 },
  search:  { marginTop: space.lg, height: 46, borderRadius: radius.md,
             paddingHorizontal: space.md, fontSize: 14 },
  stat:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: space.lg,
             marginTop: -22, paddingHorizontal: space.md, paddingVertical: 11,
             borderRadius: radius.md, borderWidth: 1 },
  statText:{ ...type.meta },
  statNum: { fontWeight: '800', fontSize: 14 },
  segWrap: { paddingHorizontal: space.lg, paddingVertical: space.md },
  seg:     { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  segBtn:  { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segText: { ...type.meta, fontSize: 12.5, fontWeight: '600' },
  empty:   { ...type.body, textAlign: 'center', marginTop: 40 },
});
