# Stage 1: Build client
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
ARG COMMIT_HASH=dev
ENV VITE_COMMIT_HASH=$COMMIT_HASH
RUN npm run build

# Stage 2: Install server deps
FROM node:20-alpine AS server-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 3: Production
FROM node:20-alpine

RUN apk add --no-cache dumb-init fontconfig ttf-dejavu

RUN addgroup -g 1001 -S inkframe && \
    adduser -S inkframe -u 1001 -G inkframe

WORKDIR /app

COPY --from=server-builder /app/node_modules ./node_modules
COPY --from=client-builder /app/client/dist ./client/dist
COPY src/ ./src/
COPY package.json .

USER inkframe

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
