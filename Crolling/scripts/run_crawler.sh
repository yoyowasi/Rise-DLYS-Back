#!/usr/bin/env bash
set -eo pipefail
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
LOG_DIR="/home/ec2-user/crolling_logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date +'%Y%m%d')_crawler.log"
echo "[RUN] start (BASE=$BASE)" | tee -a "$LOG_FILE"
set -a; source "$BASE/.env"; set +a
echo "[RUN] env loaded" | tee -a "$LOG_FILE"
PY="$BASE/.venv/bin/python"
"$PY" - <<'PYCODE' 2>&1 | tee -a "$LOG_FILE"
import os, mysql.connector
cfg=dict(host=os.environ["DB_HOST"], user=os.environ["DB_USER"],
         password=os.environ["DB_PASSWORD"], database=os.environ["DB_DATABASE"],
         port=int(os.environ.get("DB_PORT","3306")))
print("[RUN] truncating table via mysql-connector ...")
with mysql.connector.connect(**cfg) as conn:
    with conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE news;")
    conn.commit()
print("[RUN] truncate done")
PYCODE
echo "[RUN] launching crawler ..." | tee -a "$LOG_FILE"
cd "$BASE"
if ! "$PY" -u "$BASE/naver_news_crawler.py" 2>&1 | tee -a "$LOG_FILE"; then
  echo "[ERR] crawler failed (see log above)" | tee -a "$LOG_FILE"; exit 1
fi
echo "[RUN] crawler done" | tee -a "$LOG_FILE"
echo "[$(date '+%F %T')] DONE" | tee -a "$LOG_FILE"
