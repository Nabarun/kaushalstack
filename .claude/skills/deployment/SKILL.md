---
name: deployment
description: Deploy KaushalStack to the production VPS at kaushalstack.com
version: 1
---

# Deploy KaushalStack

Use this skill whenever code changes need to be pushed live to https://kaushalstack.com.

## Architecture

| Service | Image | Port | Notes |
|---------|-------|------|-------|
| **pocketbase** | `nabarun1/kaushalstack-pocketbase` | 8090 | Database + auth |
| **api** | `nabarun1/kaushalstack-api` | 3001 | Express API |
| **web** | `nabarun1/kaushalstack-web` | 80 | React (Vite + nginx static) |
| **proxy** | `nginx:alpine` | 8080→80 | Internal reverse proxy |

Host nginx on VPS handles SSL termination and proxies public traffic → Docker on localhost:8080.

## Prerequisites (one-time setup on your Mac)
- Docker Desktop running with buildx multiarch builder:
  ```bash
  docker buildx create --use --name multibuilder
  ```
- Logged into Docker Hub: `docker login` (username: `nabarun1`)
- `sshpass` installed: `brew install sshpass`

---

## SSH Connection

All VPS commands use this pattern:
```bash
sshpass -p 'R@jeshshukl@123' ssh -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password -o KbdInteractiveAuthentication=no \
  root@187.127.147.87 "<command>"
```

---

## First-Time VPS Setup (run once)

```bash
# Install Docker, nginx, certbot on the VPS
sshpass -p 'R@jeshshukl@123' ssh -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password -o KbdInteractiveAuthentication=no \
  root@187.127.147.87 \
  "curl -fsSL https://get.docker.com | sh && apt-get install -y nginx certbot python3-certbot-nginx && mkdir -p /opt/kaushalstack"

# Copy compose files to VPS
sshpass -p 'R@jeshshukl@123' scp -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password -o KbdInteractiveAuthentication=no \
  docker-compose.yml docker-compose.prod.yml deploy/nginx-host.conf \
  root@187.127.147.87:/opt/kaushalstack/

# Create .env on VPS
sshpass -p 'R@jeshshukl@123' ssh -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password -o KbdInteractiveAuthentication=no \
  root@187.127.147.87 'cat > /opt/kaushalstack/.env << EOF
PB_SUPERUSER_EMAIL=admin@kaushalstack.com
PB_SUPERUSER_PASSWORD=Kaushal_Prod_2025!
PB_ENCRYPTION_KEY=kaushal-prod-32char-key-xxxxxxxx
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://kaushalstack.com
POCKETBASE_URL=http://pocketbase:8090
WEBSITE_DOMAIN=kaushalstack.com
INTEGRATED_AI_API_URL=
INTEGRATED_AI_API_KEY=
WEBSITE_ID=
PROXY_ENTRANCE_ID=
EOF'

# Set up host nginx config
sshpass -p 'R@jeshshukl@123' ssh -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password -o KbdInteractiveAuthentication=no \
  root@187.127.147.87 \
  "cp /opt/kaushalstack/deploy/nginx-host.conf /etc/nginx/sites-available/kaushalstack && \
   ln -sf /etc/nginx/sites-available/kaushalstack /etc/nginx/sites-enabled/kaushalstack && \
   rm -f /etc/nginx/sites-enabled/default && \
   nginx -t && systemctl reload nginx"

# Get SSL certificate (DNS must already point to 187.127.147.87)
sshpass -p 'R@jeshshukl@123' ssh -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password -o KbdInteractiveAuthentication=no \
  root@187.127.147.87 \
  "certbot --nginx -d kaushalstack.com -d www.kaushalstack.com \
   --non-interactive --agree-tos -m sengupta.nabarun@gmail.com --redirect"

# Open firewall
sshpass -p 'R@jeshshukl@123' ssh -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password -o KbdInteractiveAuthentication=no \
  root@187.127.147.87 \
  "ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable"
```

---

## Deployment Steps (every release)

### Step 1 — Build and push PocketBase image (only if migrations changed)
```bash
docker buildx build --platform linux/amd64 \
  -t nabarun1/kaushalstack-pocketbase:latest --push \
  -f apps/pocketbase/Dockerfile .
```

### Step 2 — Build and push API image (if server code changed)
```bash
docker buildx build --platform linux/amd64 \
  -t nabarun1/kaushalstack-api:latest --push \
  -f apps/api/Dockerfile .
```

### Step 3 — Build and push Web image (if frontend changed)
```bash
docker buildx build --platform linux/amd64 \
  -t nabarun1/kaushalstack-web:latest --push \
  -f apps/web/Dockerfile .
```

### Step 4 — Update docker-compose to use Hub images and pull on VPS

First update `docker-compose.prod.yml` to use the Hub images instead of building:

The prod compose already sets `restart: always`. On the VPS we pull and restart:
```bash
sshpass -p 'R@jeshshukl@123' ssh -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password -o KbdInteractiveAuthentication=no \
  root@187.127.147.87 \
  "cd /opt/kaushalstack && \
   docker pull nabarun1/kaushalstack-web:latest && \
   docker pull nabarun1/kaushalstack-api:latest && \
   docker pull nabarun1/kaushalstack-pocketbase:latest && \
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
```

### Step 5 — Verify containers are running
```bash
sshpass -p 'R@jeshshukl@123' ssh -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password -o KbdInteractiveAuthentication=no \
  root@187.127.147.87 \
  "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

### Step 6 — Check API logs for errors
```bash
sshpass -p 'R@jeshshukl@123' ssh -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password -o KbdInteractiveAuthentication=no \
  root@187.127.147.87 \
  "docker logs kaushalstack-api-1 --tail 20"
```

---

## Quick Reference

| What changed | Steps to run |
|---|---|
| Frontend only (web) | 3 → 4 → 5 |
| API only | 2 → 4 → 5 → 6 |
| PocketBase migrations | 1 → 4 → 5 → 6 |
| Frontend + API | 2 → 3 → 4 → 5 → 6 |
| Everything | 1 → 2 → 3 → 4 → 5 → 6 |

---

## Infrastructure

| Item | Value |
|------|-------|
| VPS IP | `187.127.147.87` |
| VPS user | `root` |
| VPS password | `R@jeshshukl@123` |
| App directory | `/opt/kaushalstack` |
| PocketBase data | `/opt/kaushalstack/pb_data` (persisted volume) |
| Docker Hub org | `nabarun1` |
| Domain | `kaushalstack.com` |
| SSL | Let's Encrypt via certbot (auto-renews) |

---

## Common Issues

**"no matching manifest for linux/amd64"** — You're on Apple Silicon. Always build with `--platform linux/amd64` via `docker buildx`.

**PocketBase data lost after redeploy** — The `pocketbase_data` Docker volume persists data between restarts. Only a `docker volume rm` would destroy it. Never run `docker compose down -v` in production.

**502 Bad Gateway from host nginx** — Docker containers aren't running. Check `docker ps` and `docker logs kaushalstack-proxy-1`.

**SSL cert expired** — Certbot auto-renews via systemd timer. Check with: `certbot renew --dry-run`.

**CORS errors in browser** — Ensure `CORS_ORIGIN=https://kaushalstack.com` in `/opt/kaushalstack/.env` and restart the api container.
