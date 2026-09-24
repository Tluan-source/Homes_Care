/**
 * Metro trong monorepo.
 *
 * Mặc định Metro chỉ nhìn vào thư mục app. Ở monorepo thì `@homescare/core` nằm ở
 * `packages/core`, ngoài tầm nhìn đó — nên phải chỉ rõ hai thứ:
 *   watchFolders    : nơi Metro theo dõi thay đổi (sửa core thì app nạp lại)
 *   nodeModulesPaths: nơi Metro tìm thư viện (node_modules dùng chung ở gốc)
 *
 * Thiếu cấu hình này thì lỗi là "Unable to resolve @homescare/core" — rất hay gặp
 * và rất mất thời gian dò nếu không biết trước.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Không cho Metro tự leo lên tìm node_modules ở ngoài — tránh nạp hai bản React.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
