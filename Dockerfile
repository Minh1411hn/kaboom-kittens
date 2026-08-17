# syntax=docker/dockerfile:1

# ---- deps ----------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

# ---- development ---------------------------------------------------------
# Dev-only stage: full install *with* scripts so `postinstall: nuxt prepare`
# runs and .nuxt/ exists. Never builds — docker-compose.override.yml bind-mounts
# the source over /app and runs `nuxt dev`.
FROM node:24-alpine AS development
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install && npm cache clean --force
COPY . .
EXPOSE 3000 24678
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- build ---------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner --------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nuxt -G nodejs
COPY --from=build --chown=nuxt:nodejs /app/.output ./.output

USER nuxt
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
