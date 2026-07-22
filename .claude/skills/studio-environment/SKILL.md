---
name: studio-environment
description: Provision, inspect, or remove a partner Studio portal environment (the per-partner login-gated portal container on the VPS, created from the admin Marketplace Studio tile)
version: 1
---

# Partner Studio Environments

One container per partner, all from the same image — a login-gated portal with
a Studio tab embedding kaushalstack Card Studio. Created from the admin UI
(Marketplace → Studio → subscribe partner → "Create environment") or manually
per below.

## Architecture

| Piece | Where |
|---|---|
| Portal app (dependency-free Node, no npm) | `apps/portal/server.js` |
| Image | `nabarun1/studio-portal:latest` (built on the VPS) |
| Provisioner | `apps/api/src/partner/environment.js` via Docker Engine API |
| Docker socket | mounted into kaushalstack api by `/docker/kaushalstack/docker-compose.override.yml` |
| Records | PB collection `partner_environments` (status: provisioning/running/failed/removed) |
| Routing | Traefik labels on the container — `Host(<slug>.srv1562298.hstgr.cloud)`, cert resolver `letsencrypt` |
| Frame-ancestors | DYNAMIC — `frameAncestors()` merges env `STUDIO_FRAME_ANCESTORS` + running `partner_environments` urls (60s cache); no api restart needed for new portals |

Container naming: `portal-<slug>`; volume `portal_<slug>_data` (kept on
removal so re-provisioning the same slug preserves its config).
Admin password is **only** in the container env — not stored anywhere else.

## Admin API

```
GET    /admin/environments                      list (+ docker_available flag)
POST   /admin/partners/:id/environment          { slug, portal_name, admin_user, admin_pass, session_id? }
DELETE /admin/partners/:id/environment          stop+remove container, mark record removed
```

## Manual provisioning fallback (SSH, if the UI/api path is down)

```bash
ssh root@187.127.147.87   # key auth — root password auth is dead
docker run -d --name portal-<slug> --restart unless-stopped \
  -v portal_<slug>_data:/data \
  -e PORTAL_NAME='<Display Name>' -e ADMIN_USER=admin -e ADMIN_PASS='<pass>' \
  -e KS_ORIGIN=https://kaushalstack.com -e DATA_DIR=/data -e PORT=8080 \
  -l traefik.enable=true \
  -l 'traefik.http.routers.portal-<slug>.rule=Host(`<slug>.srv1562298.hstgr.cloud`)' \
  -l traefik.http.routers.portal-<slug>.entrypoints=websecure \
  -l traefik.http.routers.portal-<slug>.tls.certresolver=letsencrypt \
  -l traefik.http.services.portal-<slug>.loadbalancer.server.port=8080 \
  nabarun1/studio-portal:latest
```

Then insert a `partner_environments` record (status `running`, url
`https://<slug>.srv1562298.hstgr.cloud`) so frame-ancestors picks it up —
without the record the portal loads but Studio shows "refused to connect".

## Rebuilding the portal image

No npm step — immune to the registry flakiness that corrupted api/web builds:

```bash
tar -czf /tmp/portal-src.tar.gz apps/portal
scp /tmp/portal-src.tar.gz root@187.127.147.87:/tmp/
ssh root@187.127.147.87 'rm -rf /tmp/portal-src && mkdir /tmp/portal-src && \
  tar -xzf /tmp/portal-src.tar.gz -C /tmp/portal-src && cd /tmp/portal-src && \
  docker build -t nabarun1/studio-portal:latest -f apps/portal/Dockerfile .'
```

Running portals keep the old image until recreated (`docker rm -f portal-<slug>`
then re-provision, or `docker run` again manually).

## Troubleshooting

- **"refused to connect" in the Studio iframe** — the portal's url isn't in
  frame-ancestors. Check the `partner_environments` record is `running`;
  cache is 60s. Custom domains must be added to the record url or the
  `STUDIO_FRAME_ANCESTORS` env.
- **Cert not issuing** — Traefik won't retry a failed ACME until the router
  changes; `docker rm -f portal-<slug>` and re-provision (same slug reuses
  the volume).
- **`docker socket not available` (503 from provision)** — the api container
  lost the `/var/run/docker.sock` mount; check the override yml and
  `docker compose up -d api` from `/docker/kaushalstack`.
- **Lost portal password** — remove the environment in the UI and create it
  again with the same slug (volume/config survives).

## Attaching a custom domain later

1. DNS A records for the domain → 187.127.147.87.
2. `docker rm -f portal-<slug>`, then `docker run` (manual command above) with
   the router rule extended:
   ``Host(`<slug>.srv1562298.hstgr.cloud`) || Host(`custom.in`)``
3. Add `https://custom.in` to the partner_environments record url (or the
   STUDIO_FRAME_ANCESTORS env + recreate api) so Studio embedding works.
