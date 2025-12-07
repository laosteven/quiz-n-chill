FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/games ./games
COPY --from=builder /app/server.js ./
COPY --from=builder /app/src/lib/constants.ts ./src/lib/constants.ts
COPY --from=builder /app/src/lib/server ./src/lib/server
COPY --from=builder /app/src/lib/types.ts ./src/lib/types.ts

RUN npm ci --omit=dev && \
    npm cache clean --force

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV CONFIG_PATH=/app/games

CMD ["npx", "tsx", "server.js"]
