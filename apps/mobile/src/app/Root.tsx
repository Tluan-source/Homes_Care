/**
 * Khung điều hướng. Thanh dưới 3 mục như bản demo: Căn hộ · Cần xử lý · Sổ quỹ.
 * Tài khoản mở từ ảnh đại diện góc phải trên.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isConfigured } from '../lib/env';
import { useTheme } from '../theme/useTheme';
import { Icon, type IconName } from '../ui/Icon';
import { Loading } from '../ui/kit';
import { useAuth } from './auth';
import { DataProvider } from './data';
import { UnitsScreen } from '../features/units/UnitsScreen';
import { UnitDetailScreen } from '../features/units/UnitDetailScreen';
import { PaymentRequestScreen } from '../features/payments/PaymentRequestScreen';
import { TodoScreen, useTodoBadge } from '../features/todo/TodoScreen';
import { LedgerScreen } from '../features/ledger/LedgerScreen';
import { AccountScreen } from '../features/account/AccountScreen';
import { LockedScreen, LoginScreen, NotConfiguredScreen, SetPasswordScreen } from '../features/auth/AuthScreens';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const TAB_META: Record<string, { label: string; icon: IconName }> = {
  Units: { label: 'Căn hộ', icon: 'grid' },
  Todo: { label: 'Cần xử lý', icon: 'bell' },
  Ledger: { label: 'Sổ quỹ', icon: 'book' },
};

function TabBar({ state, navigation }: BottomTabBarProps) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const badge = useTodoBadge();
  const badgeColor = badge?.tone === 'exc' ? c.mExt : badge?.tone === 'soon' ? c.mSoon : c.danger;
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, paddingBottom: insets.bottom + 6, paddingTop: 8 }}>
      {state.routes.map((r, i) => {
        const on = state.index === i;
        const meta = TAB_META[r.name]!;
        const color = on ? c.accentDeep : c.muted;
        return (
          <Pressable key={r.key} onPress={() => navigation.navigate(r.name)} accessibilityRole="tab"
            accessibilityState={{ selected: on }} accessibilityLabel={meta.label}
            style={{ flex: 1, alignItems: 'center', gap: 3 }}>
            <View>
              <Icon name={meta.icon} color={color} size={22} />
              {r.name === 'Todo' && badge ? (
                <View style={{ position: 'absolute', top: -5, right: -11, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4,
                  backgroundColor: badgeColor, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.surface }}>
                  <Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800' }}>{badge.n > 99 ? '99+' : badge.n}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 11, fontWeight: on ? '800' : '600', color }}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }} tabBar={p => <TabBar {...p} />}>
      <Tabs.Screen name="Units" component={UnitsScreen} />
      <Tabs.Screen name="Todo" component={TodoScreen} />
      <Tabs.Screen name="Ledger" component={LedgerScreen} />
    </Tabs.Navigator>
  );
}

export function Root() {
  const scheme = useColorScheme();
  const c = useTheme();
  const { ready, session, profile, orphan, needsPassword } = useAuth();
  const navTheme = { ...(scheme === 'dark' ? DarkTheme : DefaultTheme), colors: { ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors, background: c.app } };

  if (!isConfigured) return <NotConfiguredScreen />;
  if (!ready) return <Loading label="Đang mở…" />;
  if (!session) return <LoginScreen />;
  if (needsPassword) return <SetPasswordScreen />;
  if (orphan) return <LockedScreen orphan />;
  if (!profile) return <Loading />;
  if (profile.lockedAt) return <LockedScreen />;

  return (
    <DataProvider key={session.user.id}>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="UnitDetail" component={UnitDetailScreen} />
          <Stack.Screen name="PaymentRequest" component={PaymentRequestScreen} />
          <Stack.Screen name="Account" component={AccountScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </DataProvider>
  );
}
