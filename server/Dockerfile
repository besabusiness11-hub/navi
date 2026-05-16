# Navi backend — Node 22 (Debian slim: glibc, needed by @livekit/rtc-node
# prebuilt binaries; alpine/musl would break them).
FROM node:22-slim

WORKDIR /app

# Install deps first for layer caching.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY server/ ./
COPY public/widget.js public/vinile-*.png ./public/

ENV NODE_ENV=production
EXPOSE 8000

# Default = web server. The agent service overrides this in docker-compose.
CMD ["node", "index.js"]
