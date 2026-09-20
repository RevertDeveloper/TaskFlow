FROM node:24-alpine AS base

WORKDIR /app

FROM base AS dependencies

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM base AS development

ENV NODE_ENV=development

COPY --from=dependencies /app/node_modules ./node_modules
COPY apps/web/package.json apps/web/package-lock.json ./
COPY apps/web ./

EXPOSE 3000

CMD ["npm", "run", "dev"]

FROM dependencies AS builder

ARG API_INTERNAL_URL=http://api:8000
ARG STORAGE_MODE=cloud
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ENV STORAGE_MODE=${STORAGE_MODE}

COPY apps/web ./
RUN npm run build

FROM node:24-alpine AS runner

ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	PORT=3000 \
	HOSTNAME=0.0.0.0

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
	&& adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
	CMD node -e "fetch('http://127.0.0.1:3000').then(() => process.exit(0)).catch(() => process.exit(1))"

CMD ["node", "server.js"]