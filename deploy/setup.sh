#!/usr/bin/env bash
# Run on a fresh Ubuntu server as root:  DOMAIN=mr.example.com bash deploy/setup.sh
set -euo pipefail
: "${DOMAIN:?Set DOMAIN, for example DOMAIN=mr.example.com}"
apt-get update && apt-get install -y nginx certbot python3-certbot-nginx curl git
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs; }
id mrconnect >/dev/null 2>&1 || useradd --system --create-home mrconnect
mkdir -p /opt/mr-connect && cp -r . /opt/mr-connect && chown -R mrconnect /opt/mr-connect
cd /opt/mr-connect && sudo -u mrconnect npm ci && sudo -u mrconnect npm run build -w @mr/admin
[ -f .env ] || { cp .env.example .env
  sed -i "s|^NODE_ENV=.*|NODE_ENV=production|; s|^HOST=.*|HOST=127.0.0.1|; s|^APP_ORIGINS=.*|APP_ORIGINS=https://$DOMAIN|" .env
  echo "TRUST_PROXY=1" >> .env
  echo ">> Edit /opt/mr-connect/.env (DATABASE_URL etc.) before relying on this server."; }
sed "s/mr.example.com/$DOMAIN/g" deploy/nginx.conf > /etc/nginx/sites-available/mr-connect
# Certificate first (nginx config needs it), using the plain HTTP challenge.
certbot certonly --nginx -d "$DOMAIN" --register-unsafely-without-email --agree-tos -n || true
ln -sf /etc/nginx/sites-available/mr-connect /etc/nginx/sites-enabled/mr-connect
cp deploy/mr-connect.service /etc/systemd/system/ && systemctl daemon-reload
systemctl enable --now mr-connect && nginx -t && systemctl reload nginx
echo "Done: https://$DOMAIN/api/health"
