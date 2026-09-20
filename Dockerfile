# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# base — runtime OS deps: ffmpeg, yt-dlp, tini (PID 1 so signals reach node and
# orphaned ffmpeg children get reaped).
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      curl \
      tini \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp_linux is the self-contained PyInstaller build: no python needed.
# Pinned so rebuilds are reproducible; bump this arg to update the extractor.
ARG YTDLP_VERSION=2025.09.05
RUN curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_linux" \
      -o /usr/local/bin/yt-dlp \
 && chmod 755 /usr/local/bin/yt-dlp \
 && yt-dlp --version

WORKDIR /app

# ---------------------------------------------------------------------------
# deps — compile native modules (better-sqlite3, sodium-native, @discordjs/opus)
# against linux-x64. Prebuilds usually apply; the toolchain is the fallback.
# ---------------------------------------------------------------------------
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential g++ make python3 \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------------------
# devdeps — same, plus dev tooling (nodemon) for the dev target
# ---------------------------------------------------------------------------
FROM deps AS devdeps
RUN npm install --no-audit --no-fund

# ---------------------------------------------------------------------------
# runtime — production image
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]

# ---------------------------------------------------------------------------
# dev — hot reload; src/ and scripts/ arrive via bind mount from compose.
# node_modules deliberately stays in the image layer so the Windows host's
# win32 binaries can never shadow the linux-x64 ones.
# ---------------------------------------------------------------------------
FROM base AS dev
ENV NODE_ENV=development
COPY --from=devdeps /app/node_modules ./node_modules
COPY package.json ./
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npx", "nodemon", "--watch", "src", "--ext", "js,json,sql", "src/index.js"]
