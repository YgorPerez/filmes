# The TanStack Start server, modeled on pesquisa-relacionamentos. The image
# only carries the build's `.output/`, and the `docker build` context is it:
# nitro already bundles into `.output/server/` what the server imports, and
# there is no `pnpm install` in here. No Python (map #72).
#
# The deploy builds the image on the VPS itself (`scripts/vps.ts`), with the
# commit SHA in the name. To build and run it here:
#
#   pnpm build
#   docker build -f frontend/Dockerfile -t filmes-app frontend/.output
#   docker run --rm -p 127.0.0.1:4391:3000 filmes-app
FROM node:24-alpine

# The engine commits each write to filmes-dados and pushes it over ssh with
# the deploy key (ADR 0005, `packages/engine/src/data/DataWriter.ts`).
RUN apk add --no-cache git openssh-client

# `FILMES_CONFIG`: the engine's config, in English, that `pnpm build`
# bundles (`scripts/bundle-config.ts`). `FILMES_CACHE`: the sources' cache
# outlives every database version, so it sits in the volume, not in `db/`
# (whose retention deletes all but two versions). The rest of the engine's
# paths come from `/opt/filmes/app.env` and the swap
# (`scripts/deploy-plan.ts`).
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    TZ=America/Sao_Paulo \
    FILMES_CONFIG=/app/config \
    FILMES_CACHE=/data/cache.sqlite

WORKDIR /app

# `--link`: the layer does not depend on the ones below, and a deploy that
# only changes the code does not download the Node image again.
COPY --link server ./server
COPY --link public ./public
COPY --link nitro.json ./
COPY --link config ./config

# UID 1000, the owner of the `/opt/filmes/data` volume the deploy mounts at
# `/data` (`scripts/deploy-plan.ts`).
USER node

# Documents the default. `docker run`'s `-p` picks the outside port, the one
# of the pair Nginx is not using (`scripts/vps.ts`).
EXPOSE 3000

# Each request goes to stdout as `GET /path 200 12ms`, without the query
# (`src/platform/request-log.ts`), and that is what `docker logs` shows.
CMD ["node", "server/index.mjs"]
