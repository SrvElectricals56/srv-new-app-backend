FROM node:20-bookworm-slim AS builder

WORKDIR /app
ENV NPM_CONFIG_LOGLEVEL=warn

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

RUN mkdir -p uploads && chown node:node uploads

USER node

EXPOSE 3001
CMD ["node", "dist/main.js"]
