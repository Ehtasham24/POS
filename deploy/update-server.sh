#!/usr/bin/env bash
# Deploys the latest code to a server set up by deploy/setup-server.sh: pulls, installs the
# backend's dependencies, refreshes the nginx config, restarts, and checks it came back.
#
#   ssh ubuntu@<server> 'bash /opt/pos/deploy/update-server.sh'            # latest main
#   ssh ubuntu@<server> 'REF=v1.2.0 bash /opt/pos/deploy/update-server.sh' # a release tag
#
# Database migrations are not run here: apply new ones (ExpressBackend/migrations) first, since
# the old code keeps running against the new schema until the restart.
set -euo pipefail

APP_DIR=/opt/pos
REF="${REF:-main}"
DOMAIN=$(sed -n 's/^ *server_name \(.*\);/\1/p' /etc/nginx/sites-available/pos.conf | head -1)

cd "$APP_DIR"
sudo -u pos git fetch --depth 1 origin "$REF"
sudo -u pos git reset --hard FETCH_HEAD
echo "== Now at $(sudo -u pos git log --oneline -1)"

(cd ExpressBackend && sudo -u pos npm ci --omit=dev --no-audit --no-fund)

sed "s/pos\.example\.com/$DOMAIN/g" deploy/nginx/pos.conf | sudo tee /etc/nginx/sites-available/pos.conf >/dev/null
sudo install -m 644 deploy/nginx/security-headers.conf /etc/nginx/snippets/pos-security-headers.conf
sudo nginx -t -q && sudo systemctl reload nginx

sudo systemctl restart pos
for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null http://127.0.0.1:4000/api/health; then echo "== Up: https://$DOMAIN"; exit 0; fi
  sleep 1
done
echo "== The backend didn't come back — see: journalctl -u pos -n 50" >&2
exit 1
