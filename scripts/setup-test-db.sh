#!/usr/bin/env bash
# Запускает postgres:15 в Docker, прогоняет все миграции дважды (idempotency check).
# Использование:
#   ./scripts/setup-test-db.sh           — поднять + мигрировать + проверить
#   ./scripts/setup-test-db.sh --down    — остановить и удалить контейнер
set -euo pipefail

CONTAINER=content-radar-test-db
PG_PORT=5433
PG_USER=postgres
PG_PASS=testpassword
PG_DB=content_radar_test
DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# ── --down ───────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--down" ]]; then
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    docker rm -f "$CONTAINER"
    ok "Контейнер $CONTAINER удалён."
  else
    warn "Контейнер $CONTAINER не найден."
  fi
  exit 0
fi

# ── Префлайт ─────────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || fail "Docker не найден. Установите Docker Desktop или docker CLI."
cd "$(dirname "$0")/.."

# ── Запуск контейнера ─────────────────────────────────────────────────────────
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  ok "Контейнер $CONTAINER уже запущен."
elif docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  warn "Контейнер $CONTAINER остановлен — запускаю снова."
  docker start "$CONTAINER" >/dev/null
else
  echo "Поднимаю postgres:15 на порту $PG_PORT…"
  docker run -d \
    --name "$CONTAINER" \
    -e POSTGRES_USER="$PG_USER" \
    -e POSTGRES_PASSWORD="$PG_PASS" \
    -e POSTGRES_DB="$PG_DB" \
    -p "${PG_PORT}:5432" \
    postgres:15 >/dev/null
  ok "Контейнер создан."
fi

# ── Ожидание готовности ───────────────────────────────────────────────────────
echo "Жду готовности PostgreSQL…"
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
    ok "PostgreSQL готов (попытка $i)."
    break
  fi
  if [[ $i -eq 30 ]]; then
    fail "PostgreSQL не ответил за 30 секунд."
  fi
  sleep 1
done

# ── Прогон №1: применить миграции ────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Прогон №1 — применяю все миграции"
echo "═══════════════════════════════════════════════════════════"
if DATABASE_URL="$DATABASE_URL" npm run db:migrate --silent; then
  ok "Прогон №1 прошёл."
else
  fail "Прогон №1 упал. Миграции содержат ошибку."
fi

# ── Прогон №2: idempotency check ─────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Прогон №2 — idempotency check (повторное применение)"
echo "═══════════════════════════════════════════════════════════"
if DATABASE_URL="$DATABASE_URL" npm run db:migrate --silent; then
  ok "Прогон №2 прошёл — миграции идемпотентны."
else
  fail "Прогон №2 упал — миграции НЕ идемпотентны. Добавьте IF NOT EXISTS / IF EXISTS туда, где сейчас упало."
fi

# ── Итог ──────────────────────────────────────────────────────────────────────
echo ""
ok "Все проверки прошли."
echo "  DATABASE_URL: $DATABASE_URL"
echo ""
echo "Для работы с тестовой БД напрямую:"
echo "  docker exec -it $CONTAINER psql -U $PG_USER -d $PG_DB"
echo ""
echo "Чтобы остановить и удалить контейнер:"
echo "  ./scripts/setup-test-db.sh --down"
