#!/bin/bash
# KaushalStack VPS setup — run once as root on Ubuntu 22.04
# Usage: bash setup.sh
set -e

DOMAIN="kaushalstack.com"
REPO="git@github.com:Nabarun/kaushalstack.git"
APP_DIR="/opt/kaushalstack"
EMAIL="sengupta.nabarun@gmail.com"   # used for Let's Encrypt notifications

echo "=== [1/7] Installing Docker ==="
apt-get update -qq
apt-get install -y ca-certificates curl gnupg lsb-release git nginx certbot python3-certbot-nginx ufw
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable docker
systemctl start docker

echo "=== [2/7] Cloning repo ==="
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR" && git pull
else
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

echo "=== [3/7] Creating .env ==="
if [ ! -f .env ]; then
  PB_PASS=$(openssl rand -base64 24 | tr -d '/+=')
  PB_KEY=$(openssl rand -hex 16)
  cat > .env <<EOF
# PocketBase
PB_SUPERUSER_EMAIL=admin@kaushalstack.com
PB_SUPERUSER_PASSWORD=${PB_PASS}
PB_ENCRYPTION_KEY=${PB_KEY}

# API
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://${DOMAIN}
POCKETBASE_URL=http://pocketbase:8090

# Integrated AI (add keys if using)
INTEGRATED_AI_API_URL=
INTEGRATED_AI_API_KEY=
WEBSITE_ID=
WEBSITE_DOMAIN=${DOMAIN}
PROXY_ENTRANCE_ID=
EOF
  echo ""
  echo ">>> .env created. Save these credentials:"
  echo "    PocketBase password : ${PB_PASS}"
  echo "    Encryption key      : ${PB_KEY}"
  echo ""
else
  echo ".env already exists, skipping."
fi

echo "=== [4/7] Starting Docker containers ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo "=== [5/7] Configuring host nginx ==="
mkdir -p /var/www/certbot
cp deploy/nginx-host.conf /etc/nginx/sites-available/kaushalstack
ln -sf /etc/nginx/sites-available/kaushalstack /etc/nginx/sites-enabled/kaushalstack
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== [6/7] Obtaining SSL certificate ==="
certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" \
  --non-interactive --agree-tos -m "${EMAIL}" --redirect
systemctl reload nginx

echo "=== [7/7] Setting up firewall ==="
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "==================================================================="
echo " KaushalStack is live at https://${DOMAIN}"
echo "==================================================================="
