FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV CI=true

COPY package.json package-lock.json ./
COPY scripts/install-husky.mjs ./scripts/install-husky.mjs
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY scripts/install-husky.mjs ./scripts/install-husky.mjs
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/memory/core/prompts/memory.md ./src/memory/core/prompts/memory.md

CMD ["node", "--require", "./dist/telemetry/instrumentation.js", "./dist/index.js"]
