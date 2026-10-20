# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

ARG PUBLIC_APP_NAME=MobiliX
ARG PUBLIC_BASE_URL=http://localhost:3000
ARG PUBLIC_R2_BUCKET_NAME=
ARG PUBLIC_R2_BUCKET_URL=

ENV PUBLIC_APP_NAME=$PUBLIC_APP_NAME
ENV PUBLIC_BASE_URL=$PUBLIC_BASE_URL
ENV PUBLIC_R2_BUCKET_NAME=$PUBLIC_R2_BUCKET_NAME
ENV PUBLIC_R2_BUCKET_URL=$PUBLIC_R2_BUCKET_URL
ENV DATABASE_URL=file:/app/data/local.db
ENV BETTER_AUTH_URL=$PUBLIC_BASE_URL
ENV BETTER_AUTH_SECRET=local-development-secret-change-me

COPY . .

RUN pnpm build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/data/mobility ./data/mobility

USER node

EXPOSE 3000

CMD ["node", "build"]
