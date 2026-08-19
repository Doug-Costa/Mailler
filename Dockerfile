FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Instala dependências
COPY package.json package-lock.json ./
RUN npm ci

# Copia código fonte
COPY . .

# Gera o Prisma Client
RUN npx prisma generate

# Compila o Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Imagem final de execução
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app ./

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# O comando padrão roda o Next.js. O worker irá sobrescrever este comando no docker-compose.yml
CMD ["npm", "start"]
