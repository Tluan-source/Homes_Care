/**
 * TOKEN THIẾT KẾ — MỘT NƠI DUY NHẤT.
 *
 * Không hardcode mã màu, khoảng cách hay cỡ chữ trong màn hình. Đổi tông màu thì sửa
 * đúng file này; rải ra thì lần đổi nào cũng sót vài chỗ và app trông chắp vá.
 */

export const palette = {
  light: {
    app: '#FFFFFF', surface: '#FFFFFF', surface2: '#FBF8F2',
    ink: '#241D12', ink2: '#4A4133', muted: '#968C7C',
    line: '#EBE5D9', line2: '#F4F0E7',
    hdr1: '#FFDD70', hdr2: '#FFC01F',
    accent: '#FFC72E', accentInk: '#2A2010', accentSoft: '#FFF6DD', accentDeep: '#9A6B05',

    // TRỤC 1 — tình trạng nhà (dải màu bên trái dòng)
    stEmpty: '#1B6FD2', stEmptyBg: '#E6F0FC',
    stPartial: '#7A3CC6', stPartialBg: '#F2E9FC',
    stFull: '#14803C', stFullBg: '#E3F5E9',
    stMaint: '#4F5E70', stMaintBg: '#ECEFF3',

    // TRỤC 2 — trạng thái tiền (nhãn bên phải dòng)
    mLate: '#C62B20', mLateBg: '#FCEAE8',
    mTerm: '#7A1013', mTermBg: '#F3D9D7',      // thanh lý: đỏ SẪM, tách khỏi đỏ thường
    mSoon: '#B04A0A', mSoonBg: '#FDEEE0',
    mExt:  '#0E7A74', mExtBg:  '#E1F4F2',
    mBill: '#9A6B05', mBillBg: '#FFF6DD',
    mOk:   '#6C7A6E', mOkBg:   '#F1F4F0',
    mNone: '#B3AB9C', mNoneBg: '#F7F4EE',

    danger: '#C62B20', warn: '#B04A0A', info: '#0E7A74',
  },
  dark: {
    app: '#14110B', surface: '#1D1912', surface2: '#252017',
    ink: '#F2EDE4', ink2: '#D6CDBE', muted: '#9A9184',
    line: '#332C21', line2: '#291F17',
    hdr1: '#C89A18', hdr2: '#9C7710',
    accent: '#E8B42A', accentInk: '#1A1408', accentSoft: '#332813', accentDeep: '#F0C55A',

    stEmpty: '#6FB0FF', stEmptyBg: '#12243A',
    stPartial: '#C49BFF', stPartialBg: '#261C3A',
    stFull: '#5BD68C', stFullBg: '#123322',
    stMaint: '#9FB0C4', stMaintBg: '#1E262F',

    mLate: '#FF9187', mLateBg: '#3A1A17',
    mTerm: '#FF6B6B', mTermBg: '#4A1412',
    mSoon: '#F0A25F', mSoonBg: '#352111',
    mExt:  '#5FD5CD', mExtBg:  '#0F2E2C',
    mBill: '#F0C55A', mBillBg: '#332813',
    mOk:   '#A9B6AB', mOkBg:   '#1E241F',
    mNone: '#7E766A', mNoneBg: '#211C15',

    danger: '#FF9187', warn: '#F0A25F', info: '#5FD5CD',
  },
} as const;

/* Kiểu màu: giữ ràng buộc TÊN khoá, nhưng giá trị là `string`.
   Nếu để `typeof palette.light` thì `as const` biến mỗi mã màu thành một kiểu literal
   riêng, và bảng tối không gán được vào bảng sáng — lỗi kiểu nhưng không phải lỗi thật. */
export type Colors = Record<keyof typeof palette.light, string>;

/** Thang khoảng cách bội số 4 — mọi padding/margin lấy từ đây. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 32 } as const;

export const radius = { sm: 10, md: 15, lg: 20, pill: 999 } as const;

export const type = {
  h1:    { fontSize: 24,   fontWeight: '800' as const, letterSpacing: -0.5 },
  h2:    { fontSize: 20,   fontWeight: '800' as const, letterSpacing: -0.4 },
  title: { fontSize: 15,   fontWeight: '700' as const },
  body:  { fontSize: 13.5, fontWeight: '500' as const },
  meta:  { fontSize: 11.5, fontWeight: '500' as const },
  tiny:  { fontSize: 10,   fontWeight: '700' as const },
} as const;
