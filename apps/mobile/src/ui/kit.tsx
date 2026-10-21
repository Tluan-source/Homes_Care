/**
 * Thành phần giao diện dùng lại — dựng theo bản demo (HomesCare-demo.html).
 * KHÔNG biết gì về nghiệp vụ; màu lấy từ theme, khoảng cách từ tokens.
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { radius, space } from '../theme/tokens';
import { Icon, type IconName } from './Icon';

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/* ------------------------------------------------------------------ nền vàng */

/** Nền vàng đầu trang, mép dưới uốn lượn như bản demo. */
function HeaderBg({ wave }: { wave: boolean }) {
  const c = useTheme();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.hdr1} />
            <Stop offset="1" stopColor={c.hdr2} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#hg)" />
      </Svg>
      {wave && (
        <Svg width="100%" height={50} viewBox="0 0 400 50" preserveAspectRatio="none" style={{ position: 'absolute', bottom: -1 }}>
          <Path d="M0 28C34 4 72 42 124 32 178 22 208 48 262 38 312 29 352 6 400 15V50H0Z" fill={c.app} />
        </Svg>
      )}
    </View>
  );
}

export function Header({ eyebrow, title, right, children }: {
  eyebrow?: string; title: string; right?: React.ReactNode; children?: React.ReactNode;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 14, paddingHorizontal: space.lg, paddingBottom: 60 }}>
      <HeaderBg wave />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          {eyebrow ? <Text style={[st.eyebrow, { color: c.accentInk }]}>{eyebrow}</Text> : null}
          <Text style={[st.h1, { color: c.accentInk }]}>{title}</Text>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function BackBar({ title, sub, onBack, right, monoTitle }: {
  title: string; sub?: string; onBack: () => void; right?: React.ReactNode; monoTitle?: boolean;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 10, paddingBottom: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <HeaderBg wave={false} />
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Quay lại"
        style={[st.iconbtn]}>
        <Icon name="back" color={c.accentInk} size={20} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[st.backTitle, { color: c.accentInk }, monoTitle && { fontFamily: mono }]}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={[st.backSub, { color: c.accentInk }]}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Avatar({ label, onPress }: { label: string; onPress?: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Tài khoản"
      style={[st.avatar, { backgroundColor: c.surface }]}>
      <Text style={{ color: c.accentDeep, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ chip · seg */

export function Chip({ label, count, on, onPress, small, onHeader, monoLabel }: {
  label: string; count?: string | number; on: boolean; onPress: () => void;
  small?: boolean; onHeader?: boolean; monoLabel?: boolean;
}) {
  const c = useTheme();
  const bg = onHeader ? (on ? c.surface : 'rgba(255,255,255,0.55)') : (on ? c.accent : c.surface);
  const border = onHeader ? (on ? c.surface : 'rgba(255,255,255,0.7)') : (on ? c.accent : c.line);
  const fg = onHeader ? (on ? c.ink : c.accentInk) : (on ? c.accentInk : c.ink2);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[st.chip, small && st.chipSm, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[st.chipText, small && { fontSize: 12.5 }, { color: fg }, monoLabel && { fontFamily: mono, fontWeight: '700' }]}>{label}</Text>
      {count !== undefined ? <Text style={[st.chipText, { color: fg, fontWeight: '500', opacity: 0.7 }, small && { fontSize: 12.5 }]}>{count}</Text> : null}
    </Pressable>
  );
}

export function ChipRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style}
      contentContainerStyle={{ gap: 8 }}>{children}</ScrollView>
  );
}

export function Seg<T extends string>({ items, value, onChange }: {
  items: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void;
}) {
  const c = useTheme();
  return (
    <View style={[st.seg, { backgroundColor: c.surface2, borderColor: c.line }]}>
      {items.map(it => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[st.segBtn, on && { backgroundColor: c.surface, ...shadowSm }]}>
            <Text style={[st.segText, { color: on ? c.ink : c.muted }]}>
              {it.label}{it.count !== undefined ? <Text style={{ fontSize: 10.5, opacity: 0.65 }}>{' '}{it.count}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ nhãn */

/** Nhãn trạng thái nhỏ có chấm tròn (`.mp` trong demo). */
export function Pill({ label, fg, bg, dashed, style }: {
  label: string; fg: string; bg: string; dashed?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  return (
    <View style={[st.pill, { backgroundColor: dashed ? c.surface : bg },
      dashed && { borderWidth: 1, borderStyle: 'dashed', borderColor: fg }, style]}>
      <View style={[st.pillDot, { backgroundColor: fg }]} />
      <Text numberOfLines={1} style={[st.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ khối */

export function StatBar({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return <View style={[st.stat, { backgroundColor: c.surface, borderColor: c.line }]}>{children}</View>;
}

export function SecH({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useTheme();
  return <Text style={[st.secH, { color: c.muted }, style]}>{children}</Text>;
}

export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return <View style={[st.panel, { backgroundColor: c.surface, borderColor: c.line }, style]}>{children}</View>;
}

export function KV({ k, v, small, vColor, last, monoV }: {
  k: string; v: React.ReactNode; small?: string; vColor?: string; last?: boolean; monoV?: boolean;
}) {
  const c = useTheme();
  return (
    <View style={[st.row, { borderBottomColor: c.line2 }, last && { borderBottomWidth: 0 }]}>
      <Text style={[st.rowK, { color: c.muted }]}>{k}</Text>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
        {typeof v === 'string' || typeof v === 'number'
          ? <Text style={[st.rowV, { color: vColor ?? c.ink }, monoV && { fontFamily: mono }]}>{v}</Text> : v}
        {small ? <Text style={[st.rowSmall, { color: c.muted }]}>{small}</Text> : null}
      </View>
    </View>
  );
}

type Tone = 'info' | 'warn' | 'ok' | 'term';
export function Callout({ tone = 'info', children, style }: { tone?: Tone; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  const map = {
    info: { bg: c.mExtBg, bar: c.info },
    warn: { bg: c.mSoonBg, bar: c.warn },
    ok:   { bg: c.stFullBg, bar: c.stFull },
    term: { bg: c.mTermBg, bar: c.mTerm },
  }[tone];
  return (
    <View style={[st.callout, { backgroundColor: map.bg, borderLeftColor: map.bar }, style]}>
      {typeof children === 'string' ? <Txt>{children}</Txt> : children}
    </View>
  );
}

/** Chữ thân mặc định. `b` in đậm. */
export function Txt({ children, style, b, muted, numberOfLines }: {
  children: React.ReactNode; style?: StyleProp<TextStyle>; b?: boolean; muted?: boolean; numberOfLines?: number;
}) {
  const c = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ fontSize: 13, lineHeight: 19, color: muted ? c.muted : c.ink2 }, b && { fontWeight: '700', color: c.ink }, style]}>{children}</Text>;
}

export function Btn({ label, onPress, kind = 'p', icon, disabled, busy, style, block }: {
  label: string; onPress?: () => void; kind?: 'p' | 's' | 'g' | 'danger'; icon?: IconName;
  disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; block?: boolean;
}) {
  const c = useTheme();
  const look = {
    p: { bg: c.accent, fg: c.accentInk, border: c.accent },
    s: { bg: c.surface, fg: c.ink, border: c.line },
    g: { bg: c.accentSoft, fg: c.accentDeep, border: c.accentSoft },
    danger: { bg: c.surface, fg: c.danger, border: c.line },
  }[kind];
  return (
    <Pressable onPress={disabled || busy ? undefined : onPress} accessibilityRole="button"
      accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [st.btn, { backgroundColor: look.bg, borderColor: look.border },
        kind === 'p' && shadowSm, block && { alignSelf: 'stretch', flexGrow: 1 },
        (disabled || pressed) && { opacity: disabled ? 0.5 : 0.85 }, style]}>
      {busy ? <ActivityIndicator color={look.fg} size="small" />
        : icon ? <Icon name={icon} color={look.fg} size={17} /> : null}
      <Text style={[st.btnText, { color: look.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style, gap = 9 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', gap, marginTop: 14, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Empty({ icon = 'check', title, detail }: { icon?: IconName; title: string; detail?: string }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 42, paddingHorizontal: 24 }}>
      <Icon name={icon} color={c.muted} size={30} />
      <Text style={{ marginTop: 10, fontSize: 15, fontWeight: '700', color: c.ink }}>{title}</Text>
      {detail ? <Text style={{ marginTop: 5, fontSize: 12.5, color: c.muted, textAlign: 'center', lineHeight: 18 }}>{detail}</Text> : null}
    </View>
  );
}

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.app, padding: 24 }}>
      <ActivityIndicator color={c.accentDeep} />
      <Text style={{ marginTop: 10, color: c.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

/** Ảnh đại diện chữ cái đầu, màu cố định theo tên. */
export function Initials({ name, size = 32 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/);
  const ini = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '')).toUpperCase();
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${h}, 38%, 55%)`, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{ini}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ bảng trượt */

export function Sheet({ visible, title, onClose, right, children, footer }: {
  visible: boolean; title: string; onClose: () => void; right?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.scrim} onPress={onClose} accessibilityLabel="Đóng" />
      <View style={[st.sheet, { backgroundColor: c.surface }]}>
        <View style={[st.grip, { backgroundColor: c.line }]} />
        <View style={st.sheetTop}>
          <Text style={[st.sheetTitle, { color: c.ink }]}>{title}</Text>
          {right}
        </View>
        <ScrollView style={{ paddingHorizontal: 18 }} contentContainerStyle={{ paddingBottom: 10 }}>{children}</ScrollView>
        {footer ? (
          <View style={[st.sheetFoot, { borderTopColor: c.line, paddingBottom: 13 + insets.bottom }]}>{footer}</View>
        ) : <View style={{ height: insets.bottom + 8 }} />}
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ thông báo nổi */

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<string | null>(null);
  const op = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    Animated.timing(op, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(op, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
    }, 2800);
  }, [op]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View pointerEvents="none" style={[st.toast, { opacity: op, bottom: insets.bottom + 90, backgroundColor: c.ink }]}>
          <Text style={{ color: c.app, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{msg}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------ kiểu */

export const shadowSm: ViewStyle = Platform.select({
  ios: { shadowColor: '#241D12', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  default: { elevation: 1 },
}) as ViewStyle;

export const shadowFloat: ViewStyle = Platform.select({
  ios: { shadowColor: '#241D12', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  default: { elevation: 4 },
}) as ViewStyle;

export const st = StyleSheet.create({
  eyebrow: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.7, textTransform: 'uppercase', opacity: 0.62, marginBottom: 3 },
  h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, lineHeight: 28 },
  iconbtn: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  backTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  backSub: { fontSize: 11.5, opacity: 0.66, fontWeight: '500', marginTop: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.6)', ...shadowSm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: radius.pill,
    paddingVertical: 9, paddingHorizontal: 15 },
  chipSm: { paddingVertical: 7, paddingHorizontal: 13 },
  chipText: { fontSize: 13, fontWeight: '600' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, flex: 1 },
  segBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 9, alignItems: 'center' },
  segText: { fontSize: 12.5, fontWeight: '600' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 8,
    borderRadius: 6, alignSelf: 'flex-start', flexShrink: 1 },
  pillDot: { width: 5, height: 5, borderRadius: 3 },
  pillText: { fontSize: 10, fontWeight: '700', flexShrink: 1 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap', paddingVertical: 11, paddingHorizontal: 13,
    marginTop: -34, borderWidth: 1, borderRadius: radius.md, ...shadowFloat },
  secH: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 9 },
  panel: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1 },
  rowK: { fontSize: 13.5, fontWeight: '500', flexShrink: 0 },
  rowV: { fontSize: 13.5, fontWeight: '600', textAlign: 'right' },
  rowSmall: { fontSize: 11.5, fontWeight: '500', marginTop: 1, textAlign: 'right' },
  callout: { borderLeftWidth: 3, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13, marginTop: 12 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1,
    borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 18, minHeight: 46 },
  btnText: { fontSize: 14, fontWeight: '600' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(36,29,18,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  grip: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 9 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 13, paddingBottom: 11 },
  sheetTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, flex: 1 },
  sheetFoot: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 13, borderTopWidth: 1 },
  toast: { position: 'absolute', left: 24, right: 24, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14 },
});
