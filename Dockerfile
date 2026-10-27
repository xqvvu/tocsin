# syntax=docker/dockerfile:1

# --- Build stage: use the official Vite+ toolchain image ---
FROM ghcr.io/voidzero-dev/vite-plus:1.1.0 AS build

# The vp image already ships the C/C++ toolchain (`gcc`, `make`, `python3`), so
# no extra packages are needed for native addons. node-gyp is not in the image,
# but better-sqlite3 ships a `binding.gyp` with no `install` script, and npm and
# pnpm both run the implicit `node-gyp rebuild` for that case. It does not
# actually compile: `binding.gyp` shells out to `node lib/binding.js`, sees the
# bundled prebuilt binary, and takes the empty branch.
USER root
RUN npm install -g node-gyp

WORKDIR /app

# Copy manifests first so the dependency layer stays cached across source edits.
# `--parents` keeps the workspace layout, so every package manifest comes from
# one instruction instead of one per package.
COPY --parents --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version ./apps/console/package.json ./apps/docs/package.json ./packages/*/package.json /app/

# Provision the pinned Node.js runtime, then install dependencies.
# `vp env install` reads .node-version, so the runtime never drifts from it.
RUN --mount=type=cache,id=tocsin-pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    vp env install \
 && vp install --frozen-lockfile

# Build the console app
COPY --chown=vp:vp . .
RUN vp -C apps/console build \
 && cp "$(vp env which node | head -1)" /tmp/node

# --- Runtime stage: slim glibc, no vp toolchain ---
# A bare Debian base plus the resolved Node.js binary is smaller than any
# `node:*` image, which also carries npm. Stay on glibc: the copied binary is
# built against it, so a musl image cannot run it.
FROM debian:trixie-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV TOCSIN_DATABASE_PATH=/data/tocsin.sqlite

WORKDIR /app

# gosu drops privileges in the entrypoint, curl backs the healthcheck.
# libatomic1 is required by the Node.js binary and is absent from a bare Debian,
# so the container fails to boot without it. The `node` user is created at uid
# 1000 to match the previous `node:*` base image, which is what the entrypoint
# and existing data volumes expect.
RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu curl libatomic1 ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 1000 node \
 && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin node \
 && mkdir -p /data /app \
 && chown -R node:node /data /app

# The Node.js release pinned by `.node-version`, as provisioned during the build.
COPY --from=build /tmp/node /usr/local/bin/node

# Build output: the Nitro server bundle plus the production dependencies Nitro
# vendors into `.output/server/node_modules`, so the runtime stage needs no
# install step or package manager.
COPY --from=build --chown=node:node /app/apps/console/.output ./.output
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD curl -fsS http://127.0.0.1:3000/api/ready || exit 1

CMD ["node","--enable-source-maps", ".output/server/index.mjs"]
