#!/usr/bin/env node
/**
 * Sinh `supabase/functions/_shared/core.ts` từ `packages/core/src`.
 *
 * Edge Function chạy Deno, app chạy Hermes — nhưng cả hai PHẢI dùng CHUNG một bộ quy
 * tắc tiền. App hiện "phải trả 52 triệu" thì server ghi sổ cũng phải ra 52 triệu.
 *
 * Cách làm: chép nguyên mã nguồn TypeScript của core sang `_shared/core/`, chỉ đổi
 * đuôi import `.js` → `.ts` (core viết theo NodeNext nên import ghi `.js`; Deno cần
 * đúng tên file thật). Không biên dịch, không gộp — giữ nguyên kiểu dữ liệu, Deno
 * kiểm kiểu được như ở core.
 *
 * File sinh ra được gitignore. Sinh lại trước mỗi lần deploy (`npm run functions:deploy`)
 * và trong CI. KHÔNG sửa tay: sửa tay là bắt đầu có hai bộ quy tắc tiền khác nhau.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/core/src');
const shared = join(root, 'supabase/functions/_shared');
const out = join(shared, 'core');

const BANNER =
  '// ⚠️ FILE SINH RA bởi scripts/bundle-edge.mjs từ packages/core/src — KHÔNG SỬA TAY.\n' +
  '// Sửa ở packages/core rồi chạy: npm run bundle:edge\n\n';

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

rmSync(out, { recursive: true, force: true });

const files = walk(src).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
for (const file of files) {
  const code = readFileSync(file, 'utf8')
    // chỉ đổi import TƯƠNG ĐỐI ('./x.js', '../y/z.js'); import gói ngoài giữ nguyên
    .replace(/(from\s+['"])(\.{1,2}\/[^'"]+)\.js(['"])/g, '$1$2.ts$3')
    .replace(/(import\s*\(\s*['"])(\.{1,2}\/[^'"]+)\.js(['"]\s*\))/g, '$1$2.ts$3');
  const dest = join(out, relative(src, file));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, BANNER + code);
}

writeFileSync(join(shared, 'core.ts'), BANNER + "export * from './core/index.ts';\n");
console.log(`✅ bundle:edge — ${files.length} file core → supabase/functions/_shared/core/`);
