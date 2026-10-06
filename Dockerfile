# Verified local base; review updates through a new image build.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
# A non-routable placeholder permits module collection; no real secrets enter the image.
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL=postgresql://build:unused@127.0.0.1:1/build npm run build && npm run typecheck
RUN npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/src/lib ./src/lib
COPY --from=build --chown=node:node /app/src/scripts ./src/scripts
USER node
EXPOSE 3000
CMD ["sh","-c","node --experimental-transform-types src/scripts/check-deployment.ts && exec node server.js"]
