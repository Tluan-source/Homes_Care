/**
 * Điểm vào của app. Thứ tự lớp bọc:
 *   SafeArea → Toast → Auth (phiên đăng nhập) → Root (điều hướng + dữ liệu)
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/app/auth';
import { Root } from './src/app/Root';
import { ToastProvider } from './src/ui/kit';

export default function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Root />
        </AuthProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
