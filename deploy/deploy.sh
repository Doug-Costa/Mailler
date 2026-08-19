#!/bin/bash

# Web Bulk Mailer - Deploy script for shared hosting
echo "🚀 Iniciando preparação do deploy..."

# 1. Copia o .env.example se não existir .env
if [ ! -f .env ]; then
  echo "⚠️ Arquivo .env não encontrado. Copiando .env.example para .env..."
  cp .env.example .env
  echo "👉 IMPORTANTE: Edite o arquivo .env com suas configurações de Banco de Dados e AES_SECRET antes de iniciar!"
fi

# 2. Roda a migração do banco usando db push (ideal para inicializar sem histórico de migrações complexas)
echo "📦 Executando migração do banco de dados (Prisma db push)..."
npx prisma db push --schema=./prisma/schema.prisma

echo "✅ Setup de deploy concluído com sucesso!"
echo "👉 Como rodar:"
echo "   Você pode rodar usando: 'node server.js' ou configurar o cPanel Node.js Application Manager apontando para 'server.js'."
echo "   O administrador padrão será criado no primeiro acesso à página:"
echo "   Email: admin@dentalgo.com.br"
echo "   Senha: Admin2026@"
