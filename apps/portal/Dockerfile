# Dependency-free on purpose — no npm step means no registry flakiness can
# ever corrupt this image (see the 2026-07-20 npm-ci incident).
FROM node:20-alpine
WORKDIR /app
COPY apps/portal/server.js .
EXPOSE 8080
CMD ["node", "server.js"]
