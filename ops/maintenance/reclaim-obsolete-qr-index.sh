#!/usr/bin/env bash
# Reclaim an obsolete QR ordering index; retain all rows, unique constraints,
# batch lookup indexes and the batch/status index used by exports.
set -Eeuo pipefail
source /opt/srv/secrets/migration.env
export PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGUSER="$DB_USERNAME" PGPASSWORD="$DB_PASSWORD"
export PGSSLMODE=verify-full PGSSLROOTCERT=/opt/srv/secrets/managed-postgres-ca.crt
export PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s'
database="${1:?database required}"
case "$database" in srv_staging|srv_production_20260716) ;; *) exit 1 ;; esac
backup="/opt/srv/backups/qr-order-index-${database}-$(date -u +%Y%m%d-%H%M%S).sql"
psql -X -v ON_ERROR_STOP=1 -d "$database" -Atc "SELECT indexdef || ';' FROM pg_indexes WHERE schemaname='public' AND indexname='IDX_qr_codes_batch_sequence'" > "$backup"
psql -X -v ON_ERROR_STOP=1 -d "$database" -c "SELECT pg_database_size(current_database()) AS before_bytes;"
psql -X -v ON_ERROR_STOP=1 -d "$database" -c 'DROP INDEX CONCURRENTLY IF EXISTS public."IDX_qr_codes_batch_sequence";'
psql -X -v ON_ERROR_STOP=1 -d "$database" -c "SELECT pg_database_size(current_database()) AS after_bytes; SELECT indexrelname FROM pg_stat_user_indexes WHERE relname='qr_codes' ORDER BY indexrelname;"
echo "Index definition saved for rollback: $backup"
