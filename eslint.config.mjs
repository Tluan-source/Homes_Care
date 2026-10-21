/**
 * ESLint — chặn những lỗi KIẾN TRÚC, không phải để bắt bẻ khoảng trắng.
 *
 * Ba luật quan trọng nhất (ARCHITECTURE §3.2, CONVENTIONS "Import"):
 *   1. `packages/core` THUẦN: không React, không Expo, không Supabase, không import
 *      ngược vào `apps/` hay `supabase/`. Vỡ luật này là app và server bắt đầu tính
 *      tiền theo hai cách khác nhau.
 *   2. `core` không đọc đồng hồ: cấm `new Date()` không tham số và `Date.now()`.
 *      `today` luôn là tham số (ARCHITECTURE §3.3).
 *   3. Ngoài core chỉ import `@homescare/core`, không import sâu vào đường dẫn bên trong.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**', '**/dist/**', '**/dist-tests/**', '**/.expo/**',
      'apps/mobile/android/**', 'apps/mobile/ios/**',
      // Edge Function chạy Deno, import `jsr:`/`npm:` — lint riêng bằng `deno lint`.
      'supabase/functions/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // ---------------------------------------------------------------- 1 + 2: core
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react/*', 'react-native', 'react-native/*', 'expo', 'expo-*', '@expo/*'],
            message: 'core là nghiệp vụ THUẦN — không được biết gì về giao diện.' },
          { group: ['@supabase/*'],
            message: 'core không gọi database. Truyền dữ liệu vào làm tham số.' },
          { group: ['**/apps/**', '**/supabase/**', '@homescare/mobile'],
            message: 'Phụ thuộc MỘT CHIỀU: app và server import core, không có chiều ngược lại.' },
        ],
      }],
      'no-restricted-syntax': ['error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'core không đọc đồng hồ — nhận `today` làm tham số.' },
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'core không đọc đồng hồ — nhận `today` làm tham số.' },
      ],
    },
  },

  // ---------------------------------------------------------------- 3: app
  {
    files: ['apps/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@homescare/core/*', '**/packages/core/**'],
            message: 'Chỉ import từ `@homescare/core` — không import sâu vào bên trong.' },
          { group: ['@supabase/supabase-js/dist/*'],
            message: 'Dùng API công khai của supabase-js.' },
        ],
      }],
    },
  },

  // Test được phép dựng ngày cố định bằng new Date(y, m, d) — đã có tham số nên không dính luật 2.
);
