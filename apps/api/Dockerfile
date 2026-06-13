FROM node:20-alpine

# openssh-client + rsync + sshpass power Ananya's "Deploy to Hostinger" button,
# which pushes a built site to the VPS over SSH (see src/builder/deployer.js).
RUN apk add --no-cache openssh-client rsync sshpass

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
