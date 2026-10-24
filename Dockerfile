# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS dependencies
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true SKIP_INSTALL_SIMPLE_GIT_HOOKS=1
RUN npm install --global pnpm@10.34.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
# Only client-visible settings are build arguments. Private keys are runtime inputs.
ARG PUBLIC_APP_NAME=MobiliX
ARG PUBLIC_BASE_URL=http://localhost:3000
ARG PUBLIC_BASE_PATH=
ARG PUBLIC_R2_BUCKET_NAME=
ARG PUBLIC_R2_BUCKET_URL=
ENV PUBLIC_APP_NAME=$PUBLIC_APP_NAME PUBLIC_BASE_URL=$PUBLIC_BASE_URL \
    PUBLIC_BASE_PATH=$PUBLIC_BASE_PATH \
    PUBLIC_R2_BUCKET_NAME=$PUBLIC_R2_BUCKET_NAME PUBLIC_R2_BUCKET_URL=$PUBLIC_R2_BUCKET_URL \
    DATABASE_URL=file:/tmp/build.db BETTER_AUTH_URL=$PUBLIC_BASE_URL \
    BETTER_AUTH_SECRET=build-only-placeholder-not-a-production-secret
COPY vite.config.ts tsconfig.json ./
COPY src ./src
COPY static ./static
RUN pnpm build

FROM dependencies AS production-dependencies
RUN pnpm prune --prod --ignore-scripts

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 BODY_SIZE_LIMIT=16M
WORKDIR /app
COPY --from=production-dependencies /app/package.json ./package.json
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# Immutable source data is part of the image. The live database is mounted separately.
COPY data/mobility ./data/mobility
RUN mkdir -p /app/data/runtime && chown node:node /app/data/runtime
USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000'+(process.env.HEALTHCHECK_PATH||'/api/health')).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
