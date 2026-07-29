# Build from the repo root:  docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w apps/api

FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --omit=dev --no-audit --no-fund -w apps/api

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/migrations ./migrations
COPY apps/api/package.json ./package.json
RUN mkdir -p /data && addgroup -S app && adduser -S app -G app && chown -R app:app /data /app
USER app
ENV STORAGE_DIR=/data
EXPOSE 4000
CMD ["node", "dist/index.js"]
