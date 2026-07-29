# Build from the repo root:  docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
# Rewrite target is baked at build time (next.config rewrites).
ARG API_ORIGIN=http://api:4000
# Browser-visible API origin for the dashboard WebSocket.
ARG NEXT_PUBLIC_API_ORIGIN=http://localhost:4000
ENV API_ORIGIN=$API_ORIGIN
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
