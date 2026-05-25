#!/bin/bash
# Pull latest code and restart — run from /opt/kaushalstack
set -e
cd /opt/kaushalstack
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
echo "Updated and restarted."
