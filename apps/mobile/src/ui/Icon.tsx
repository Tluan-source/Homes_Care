/** Biểu tượng nét mảnh, vẽ bằng SVG — cùng bộ với bản demo. */
import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

export type IconName =
  | 'search' | 'plus' | 'chevron' | 'back' | 'filter' | 'grid' | 'bell' | 'book'
  | 'qr' | 'send' | 'copy' | 'check' | 'user' | 'x' | 'download' | 'lock';

export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color: string }) {
  const p = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'search' && <><Circle cx={11} cy={11} r={7} {...p} /><Path d="M20 20l-3.5-3.5" {...p} /></>}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...p} />}
      {name === 'chevron' && <Path d="M6 9l6 6 6-6" {...p} />}
      {name === 'back' && <Path d="M15 18l-6-6 6-6" {...p} />}
      {name === 'filter' && <Path d="M4 6h16M7 12h10M10 18h4" {...p} />}
      {name === 'grid' && <><Rect x={4} y={4} width={7} height={7} rx={1.5} {...p} /><Rect x={13} y={4} width={7} height={7} rx={1.5} {...p} /><Rect x={4} y={13} width={7} height={7} rx={1.5} {...p} /><Rect x={13} y={13} width={7} height={7} rx={1.5} {...p} /></>}
      {name === 'bell' && <Path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16zM10 20a2 2 0 004 0" {...p} />}
      {name === 'book' && <Path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h11" {...p} />}
      {name === 'qr' && <><Rect x={4} y={4} width={6} height={6} rx={1} {...p} /><Rect x={14} y={4} width={6} height={6} rx={1} {...p} /><Rect x={4} y={14} width={6} height={6} rx={1} {...p} /><Path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" {...p} /></>}
      {name === 'send' && <Path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" {...p} />}
      {name === 'copy' && <><Rect x={8} y={8} width={12} height={12} rx={2} {...p} /><Path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" {...p} /></>}
      {name === 'check' && <Path d="M5 12.5l4.5 4.5L19 7" {...p} />}
      {name === 'user' && <><Circle cx={12} cy={8} r={4} {...p} /><Path d="M4 20a8 8 0 0116 0" {...p} /></>}
      {name === 'x' && <Path d="M6 6l12 12M18 6L6 18" {...p} />}
      {name === 'download' && <Path d="M12 4v11M7 10l5 5 5-5M5 20h14" {...p} />}
      {name === 'lock' && <><Rect x={5} y={11} width={14} height={9} rx={2} {...p} /><Path d="M8 11V8a4 4 0 118 0v3" {...p} /></>}
    </Svg>
  );
}
