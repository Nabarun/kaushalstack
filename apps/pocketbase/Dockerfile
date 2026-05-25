FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ARG PB_VERSION=0.38.0

RUN curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
    -o pocketbase.zip && \
    unzip pocketbase.zip pocketbase && \
    rm pocketbase.zip && \
    chmod +x ./pocketbase

COPY apps/pocketbase/pb_migrations ./pb_migrations
COPY apps/pocketbase/pb_hooks ./pb_hooks

VOLUME ["/data"]

EXPOSE 8090

CMD ["./pocketbase", "serve", \
     "--http=0.0.0.0:8090", \
     "--encryptionEnv=PB_ENCRYPTION_KEY", \
     "--dir=/data", \
     "--migrationsDir=./pb_migrations", \
     "--hooksDir=./pb_hooks", \
     "--hooksWatch=false"]
