#!/usr/bin/env bash
# Bring the live system up to the latest code on GitHub.
# Run on the server:   sudo bash /opt/annur/deploy/update.sh
# It takes a backup first, so a bad update can be undone (see DEPLOYMENT.md > Restore).
set -euo pipefail

APP=/opt/annur
ENVFILE=/etc/annur/annur.env

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo." >&2
  exit 1
fi

echo "== 1/5 Backup before the update"
systemctl start annur-backup.service

echo "== 2/5 Latest code"
sudo -u annur git -C "$APP" pull --ff-only

echo "== 3/5 Python packages"
sudo -u annur "$APP/venv/bin/pip" install --quiet -r "$APP/backend/requirements-production.txt"

echo "== 4/5 Database changes"
bash "$APP/deploy/manage.sh" migrate --noinput

echo "== 5/5 Restart and check"
systemctl restart annur
sleep 3
HOST=$(sed -n 's/^ANNUR_HOSTS=//p' "$ENVFILE" | cut -d, -f1 | tr -d ' ')
if curl -fsS -o /dev/null -H "Host: $HOST" -H "X-Forwarded-Proto: https" http://127.0.0.1:8180/api/v1/centre/; then
  echo "OK: the system is running the new version."
else
  echo "The system did not answer after the update. See: journalctl -u annur -n 50" >&2
  exit 1
fi
echo "If the screens changed, upload the new web app from your computer too (DEPLOYMENT.md > Updating)."
