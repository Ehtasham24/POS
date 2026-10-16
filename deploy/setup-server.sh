#!/usr/bin/env bash
# Sets up the cloud backend on a fresh Ubuntu 24.04 VM (Oracle Cloud, any x86_64 or arm64):
#
#   Internet --HTTPS:443--> nginx --HTTP--> Express 127.0.0.1:4000 --> Supabase Postgres
#
# Safe to run again: every step checks before it changes anything. Usage, as the VM's sudo user:
#
#   curl -fsSL https://raw.githubusercontent.com/Ehtasham24/POS/main/deploy/setup-server.sh -o setup-server.sh
#   DOMAIN=pos01.duckdns.org bash setup-server.sh
#
# Before running it:
#   - The domain's DNS points at this VM's public IP.
#   - The cloud's own firewall (Oracle: the subnet's security list) lets in TCP 80 and 443.
#   - The backend's env file is at /tmp/pos.env (copied with scp, never committed). It needs
#     DATABASE_URL, JWT_SECRET, NOTIFICATION_FORWARDER_SECRET, and for running behind nginx:
#     NODE_ENV=production PORT=4000 TRUST_PROXY=loopback APP_HTTPS=false
#     CORS_ORIGIN=https://$DOMAIN POS_TIMEZONE=Asia/Karachi
#
# Afterwards, deploy a new version with deploy/update-server.sh.
set -euo pipefail

: "${DOMAIN:?Set DOMAIN, e.g. DOMAIN=pos01.duckdns.org}"
REPO="${REPO:-https://github.com/Ehtasham24/POS.git}"
APP_DIR=/opt/pos
export DEBIAN_FRONTEND=noninteractive

echo "== Swap (small VMs) and timezone"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi
echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/99-pos-swap.conf >/dev/null && sudo sysctl -q -p /etc/sysctl.d/99-pos-swap.conf
sudo timedatectl set-timezone Asia/Karachi

echo "== Firewall: Oracle's Ubuntu images only allow SSH in iptables; open 80 and 443 (never 4000/4001)"
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null ||
    sudo iptables -I INPUT 5 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
sudo netfilter-persistent save >/dev/null 2>&1 || true

echo "== Packages: Node 22, nginx, certbot, git"
sudo -E apt-get update -qq
sudo -E apt-get install -y -qq ca-certificates curl gnupg git nginx certbot >/dev/null
if ! node -v 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo -E apt-get install -y -qq nodejs >/dev/null
fi

echo "== App: $REPO -> $APP_DIR, run as the 'pos' system user"
id pos >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /home/pos --shell /usr/sbin/nologin pos
[ -d "$APP_DIR/.git" ] || sudo git clone --depth 1 "$REPO" "$APP_DIR"
sudo chown -R pos:pos "$APP_DIR"
(cd "$APP_DIR/ExpressBackend" && sudo -u pos npm ci --omit=dev --no-audit --no-fund)
if [ -f /tmp/pos.env ]; then
  sudo install -o pos -g pos -m 600 /tmp/pos.env "$APP_DIR/ExpressBackend/Development.env"
  shred -u /tmp/pos.env
fi
[ -f "$APP_DIR/ExpressBackend/Development.env" ] || { echo "Missing env file: copy it to /tmp/pos.env and run again"; exit 1; }

echo "== Service: systemd keeps the backend running (restart on crash and on boot)"
sudo tee /etc/systemd/system/pos.service >/dev/null <<EOF
[Unit]
Description=POS cloud backend (ExpressBackend)
After=network-online.target
Wants=network-online.target

[Service]
User=pos
Group=pos
WorkingDirectory=$APP_DIR/ExpressBackend
ExecStart=/usr/bin/node Server.js
Restart=always
RestartSec=5
# Small VMs: keep Node from growing into swap.
Environment=NODE_OPTIONS=--max-old-space-size=384
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now pos >/dev/null 2>&1
sudo systemctl restart pos

echo "== HTTPS: a Let's Encrypt certificate (renewed by certbot's own timer, nginx reloaded after)"
sudo mkdir -p /var/www/certbot
sudo rm -f /etc/nginx/sites-enabled/default
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  sudo tee /etc/nginx/sites-available/pos-acme.conf >/dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
EOF
  sudo ln -sf /etc/nginx/sites-available/pos-acme.conf /etc/nginx/sites-enabled/pos-acme.conf
  sudo nginx -t -q && sudo systemctl reload nginx
  sudo certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --agree-tos --register-unsafely-without-email \
    --non-interactive --deploy-hook "systemctl reload nginx"
  sudo rm -f /etc/nginx/sites-enabled/pos-acme.conf
fi

echo "== nginx: the repository's site config, for $DOMAIN"
sed "s/pos\.example\.com/$DOMAIN/g" "$APP_DIR/deploy/nginx/pos.conf" | sudo tee /etc/nginx/sites-available/pos.conf >/dev/null
sudo install -m 644 "$APP_DIR/deploy/nginx/security-headers.conf" /etc/nginx/snippets/pos-security-headers.conf
sudo ln -sf /etc/nginx/sites-available/pos.conf /etc/nginx/sites-enabled/pos.conf
sudo nginx -t -q && sudo systemctl restart nginx

sleep 3
curl -fsS -o /dev/null "https://$DOMAIN/api/health" && echo "== Done: https://$DOMAIN is up"
