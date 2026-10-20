#!/usr/bin/env bash
# Run a Django management command on the live server with the live settings, as the service user.
#   sudo bash /opt/annur/deploy/manage.sh migrate
#   sudo bash /opt/annur/deploy/manage.sh create_management --username pengarah --name "Nama Penuh"
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo." >&2
  exit 1
fi

exec sudo -u annur bash -c 'set -a; . /etc/annur/annur.env; set +a; cd /opt/annur/backend && exec /opt/annur/venv/bin/python manage.py "$@"' _ "$@"
