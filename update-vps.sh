#!/bin/bash
echo "🚀 Iniciando atualização automática na VPS..."

# 1. Pull updates from Git
echo "📥 Buscando atualizações do Git..."
git pull

# 2. Rebuild container images and restart
echo "📦 Reconstruindo imagens Docker (Next.js e Worker)..."
docker compose up -d --build

# 3. Apply Prisma schema mappings inside the web container
echo "🗄️ Sincronizando schema do banco de dados (Prisma db push)..."
docker compose exec -T web npx prisma db push

echo "🎉 Atualização concluída com sucesso!"
