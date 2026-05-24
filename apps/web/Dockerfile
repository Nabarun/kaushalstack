FROM node:20-alpine AS builder

WORKDIR /workspace

# Install root workspace deps (needed for workspace resolution)
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/

RUN npm ci

WORKDIR /workspace/apps/web

COPY apps/web/ .

ENV NODE_ENV=production

RUN node tools/generate-llms.js || true && \
    npx vite build --outDir /dist

FROM nginx:alpine

COPY --from=builder /dist /usr/share/nginx/html
# nginx config is injected from the proxy container; serve static only
EXPOSE 80
