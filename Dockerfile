FROM node:24-bookworm-slim AS deps

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_DOMAIN=strategize.icapitalafrica.org
ARG NEXT_PUBLIC_API_URL=https://strategize-api.frontiertech.org
ARG NEXT_PUBLIC_GRAPHQL_URL=https://strategize-api.frontiertech.org/graphql
ARG NEXT_PUBLIC_GRAPHQL_ENDPOINT=/api/graphql
ARG NEXT_PUBLIC_API=https://strategize-api.frontiertech.org/graphql
ARG NEXT_PUBLIC_DATA=https://strategize-api.frontiertech.org
ARG NEXT_PUBLIC_SOCKET=wss://strategize-api.frontiertech.org/graphql
ARG API_BASE_URL=https://strategize-api.frontiertech.org

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    NEXT_PUBLIC_DOMAIN=$NEXT_PUBLIC_DOMAIN \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_GRAPHQL_URL=$NEXT_PUBLIC_GRAPHQL_URL \
    NEXT_PUBLIC_GRAPHQL_ENDPOINT=$NEXT_PUBLIC_GRAPHQL_ENDPOINT \
    NEXT_PUBLIC_API=$NEXT_PUBLIC_API \
    NEXT_PUBLIC_DATA=$NEXT_PUBLIC_DATA \
    NEXT_PUBLIC_SOCKET=$NEXT_PUBLIC_SOCKET \
    API_BASE_URL=$API_BASE_URL \
    NODE_OPTIONS=--max-old-space-size=1536

RUN pnpm run build

FROM node:24-bookworm-slim AS runner

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=4410 \
    HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_DOMAIN=strategize.icapitalafrica.org \
    NEXT_PUBLIC_API_URL=https://strategize-api.frontiertech.org \
    NEXT_PUBLIC_GRAPHQL_URL=https://strategize-api.frontiertech.org/graphql \
    NEXT_PUBLIC_GRAPHQL_ENDPOINT=/api/graphql \
    NEXT_PUBLIC_API=https://strategize-api.frontiertech.org/graphql \
    NEXT_PUBLIC_DATA=https://strategize-api.frontiertech.org \
    NEXT_PUBLIC_SOCKET=wss://strategize-api.frontiertech.org/graphql \
    API_BASE_URL=https://strategize-api.frontiertech.org

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 4410

CMD ["pnpm", "run", "start"]
