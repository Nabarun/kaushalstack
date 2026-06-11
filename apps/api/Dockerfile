FROM node:20-alpine

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
