/** Định dạng tiền và đọc số thành chữ. */

import type { VND } from '../types.js';

/** 18.000.000đ */
export const formatVND = (n: VND): string => `${Math.round(n).toLocaleString('vi-VN')}đ`;

/**
 * Dạng rút gọn cho chỗ chật.
 *
 * Dưới 1 triệu thì GHI ĐẦY ĐỦ (700.000đ) chứ không rút thành "0,7tr" — chủ dự án yêu cầu
 * rõ, và đúng: số nhỏ mà rút gọn thì đọc lên mơ hồ hơn là ngắn hơn.
 */
export function formatShortVND(n: VND): string {
  const v = Math.round(n);
  if (v < 1_000_000) return formatVND(v);
  const tr = v / 1_000_000;
  const s = tr >= 100 ? tr.toFixed(0) : tr.toFixed(1).replace(/\.0$/, '');
  return `${s.replace('.', ',')}tr`;
}

const UNITS = ['', 'nghìn', 'triệu', 'tỷ'];
const DIGITS = ['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];

function readThree(n: number, full: boolean): string {
  const tram = Math.floor(n / 100), chuc = Math.floor((n % 100) / 10), donvi = n % 10;
  const out: string[] = [];
  if (tram > 0 || full) out.push(DIGITS[tram], 'trăm');
  if (chuc === 0 && donvi > 0 && (tram > 0 || full)) out.push('linh');
  if (chuc === 1) out.push('mười');
  else if (chuc > 1) out.push(DIGITS[chuc], 'mươi');
  if (donvi > 0) {
    if (donvi === 1 && chuc > 1) out.push('mốt');
    else if (donvi === 5 && chuc >= 1) out.push('lăm');
    else out.push(DIGITS[donvi]);
  }
  return out.join(' ').trim();
}

/**
 * Đọc số tiền thành chữ, để in lên hợp đồng.
 *
 * Ba chỗ tiếng Việt hay sai và đều có test: "hai mươi mốt" (không phải "một"),
 * "hai mươi lăm" (không phải "năm"), "một trăm linh năm" (không phải "một trăm năm").
 */
export function readVND(n: VND): string {
  let v = Math.round(n);
  if (v === 0) return 'không đồng';
  const groups: number[] = [];
  while (v > 0) { groups.push(v % 1000); v = Math.floor(v / 1000); }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    parts.push(readThree(groups[i], i < groups.length - 1 && parts.length > 0));
    if (UNITS[i]) parts.push(UNITS[i]);
  }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
}
