import { useColorScheme } from 'react-native';
import { palette, type Colors } from './tokens';

/** Màu theo chế độ sáng/tối của hệ thống.
 *  Màn hình KHÔNG được đọc `palette` trực tiếp — luôn đi qua hook này, để sau này
 *  thêm tuỳ chọn ép sáng/ép tối thì chỉ sửa một chỗ. */
export function useTheme(): Colors {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}
