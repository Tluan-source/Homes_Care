#!/usr/bin/env bash
# ============================================================================
# Quét khoá bí mật trong mã APP và mã LÕI.
#
# Mọi thứ trong apps/ và packages/ đều đi vào bản build React Native — giải nén
# file app là đọc được. Khoá lọt vào đây một lần là lộ vĩnh viễn (SECURITY.md §1).
#
# Cố ý KHÔNG quét supabase/functions/: Edge Function chạy phía server và được phép
# đọc SUPABASE_SERVICE_ROLE_KEY từ biến môi trường.
#
# CI chạy thêm gitleaks trên toàn bộ lịch sử git; script này là bản nhanh chạy được
# trên máy trước khi commit.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

TARGETS=(apps packages)
EXCLUDES=(--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dist-tests
          --exclude-dir=.expo --exclude-dir=android --exclude-dir=ios)

# Mẫu cần chặn:
#   service_role / SERVICE_ROLE     — tên khoá bỏ qua toàn bộ RLS
#   SEPAY_                          — khoá webhook SePay
#   eyJ...\.eyJ...                  — một JWT dán thẳng (anon key cũng không được dán cứng:
#                                     đi qua EXPO_PUBLIC_SUPABASE_ANON_KEY)
#   sb_secret_                      — định dạng secret key mới của Supabase
#   -----BEGIN ... PRIVATE KEY----- — khoá ký
PATTERN='service_role|SERVICE_ROLE|SEPAY_[A-Z_]*(KEY|SECRET|TOKEN)|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}|sb_secret_[A-Za-z0-9]|-----BEGIN [A-Z ]*PRIVATE KEY-----'

if hits=$(grep -rEn "${EXCLUDES[@]}" "$PATTERN" "${TARGETS[@]}"); then
  echo "❌ Có dấu hiệu khoá bí mật trong mã sẽ đi vào bản build app:" >&2
  echo "$hits" >&2
  echo >&2
  echo "Khoá server chỉ được nằm trong biến môi trường của Edge Function." >&2
  exit 1
fi

# File .env không bao giờ được vào git (trừ .env.example — chỉ chứa tên biến, không giá trị).
if git rev-parse --git-dir >/dev/null 2>&1; then
  envs=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.example$' || true)
  if [ -n "$envs" ]; then
    echo "❌ Có file .env đang được git theo dõi:" >&2
    echo "$envs" >&2
    exit 1
  fi
fi

echo "✅ Không thấy khoá bí mật trong apps/ và packages/."
