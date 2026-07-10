FROM node:20-alpine

# openssh-client + rsync + sshpass power Ananya's "Deploy to Hostinger" button,
# which pushes a built site to the VPS over SSH (see src/builder/deployer.js).
# chromium + font packages power Tara's platform-mockup screenshots (see
# src/builder/render-screenshots.js) — puppeteer-core talks to this binary
# over CDP rather than downloading its own copy (avoids ~170MB + glibc issues
# on Alpine). nss/freetype/harfbuzz are Chromium runtime deps; the two font
# packages avoid tofu boxes for any glyph that renders before the Google Fonts
# CDN request Tara's HTML makes resolves.
RUN apk add --no-cache openssh-client rsync sshpass \
    chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto-emoji
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /workspace

# Copy workspace manifests for dependency install
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

# Install only production deps for the api workspace
RUN npm ci --workspace=apps/api --omit=dev

WORKDIR /workspace/apps/api

COPY apps/api/src ./src
COPY apps/api/scripts ./scripts

EXPOSE 3001

CMD ["node", "src/main.js"]
