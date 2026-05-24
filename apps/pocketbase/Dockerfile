FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY apps/pocketbase/pocketbase ./pocketbase
RUN chmod +x ./pocketbase

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
