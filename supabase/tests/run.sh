#!/usr/bin/env bash
# ============================================================================
# Dựng lại database từ số 0 rồi chạy toàn bộ test phân quyền.
#
#   npm run db:test                      # cách thường dùng
#   PGURL=postgres://... ./run.sh        # trỏ vào database khác
#
# Mặc định trỏ vào Postgres của `supabase start` (cổng 54322).
#
# LUÔN dựng lại từ đầu. Test phân quyền chạy trên database đã có dữ liệu cũ thì
# không nói lên điều gì: một policy hỏng vẫn "đạt" chỉ vì hàng dữ liệu đáng lẽ phải
# lộ ra lại tình cờ không tồn tại.
#
# CHỈ CHẠY TRÊN DATABASE DÙNG THỬ. Script này xoá sạch dữ liệu.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

URL="${PGURL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

# CHẶN XOÁ NHẦM DATABASE THẬT. Script ngay dưới đây `drop schema public cascade`.
# Chỉ cho chạy khi host là máy cục bộ (máy bạn, hoặc container Postgres của CI).
# Muốn chạy trên project Supabase DÙNG THỬ thì phải nói rõ: ALLOW_REMOTE_DB_RESET=yes.
# Không bao giờ đặt biến đó cho production.
HOST=$(printf '%s' "$URL" | sed -E 's#^[a-z]+://([^@/]*@)?(\[[^]]*\]|[^:/?]*).*#\2#')
case "$HOST" in
  localhost|127.0.0.1|::1|\[::1\]) ;;
  *)
    if [ "${ALLOW_REMOTE_DB_RESET:-}" != "yes" ]; then
      echo "⛔ Từ chối: '$HOST' không phải database cục bộ, mà script này XOÁ SẠCH dữ liệu." >&2
      echo "   Nếu đây chắc chắn là project DÙNG THỬ: ALLOW_REMOTE_DB_RESET=yes npm run db:test" >&2
      exit 2
    fi
    echo "⚠️  Đang xoá sạch database từ xa: $HOST (ALLOW_REMOTE_DB_RESET=yes)" >&2
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  echo "Không tìm thấy psql. Cài Postgres client, hoặc chạy 'supabase start' rồi thử lại." >&2
  exit 1
fi

run() { psql -v ON_ERROR_STOP=1 -q "$URL" -f "$1"; }

echo "── dọn sạch ─────────────────────────────────────────────"
psql -v ON_ERROR_STOP=1 -q "$URL" <<'SQL'
drop schema if exists t cascade;
drop schema if exists auth_helpers cascade;
drop schema if exists public cascade;
create schema public;
SQL

# Trên Supabase thì schema `auth` và `storage` đã có sẵn, shim sẽ bỏ qua nhờ
# "if not exists". Trên Postgres trắng thì shim dựng chúng lên.
echo "── shim (bỏ qua nếu đã là Supabase) ─────────────────────"
run "$HERE/00_shim.sql"

echo "── migrations ───────────────────────────────────────────"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "   $(basename "$f")"
  run "$f"
done

echo "── seed ─────────────────────────────────────────────────"
run "$ROOT/supabase/seed.sql"

echo "── test ─────────────────────────────────────────────────"
for f in "$HERE"/[1-9]*.sql; do run "$f"; done

echo
echo "✅ Toàn bộ test phân quyền ĐẠT."
