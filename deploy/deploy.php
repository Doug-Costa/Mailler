<?php
/**
 * Web Bulk Mailer - HTTP Deploy Script
 * 
 * Este script permite executar a migração e inicialização do banco de dados (Prisma db push)
 * diretamente pelo navegador, sem necessidade de acesso SSH.
 * 
 * Uso: acesse http://mailler.dentalgo.com.br/deploy.php?token=SEU_AES_SECRET
 */

// 1. Carrega e parseia o arquivo .env para obter a chave de segurança AES_SECRET
$aes_secret = '';
if (file_exists('.env')) {
    $env_content = file_get_contents('.env');
    // Regex para capturar o valor do AES_SECRET
    if (preg_match('/AES_SECRET\s*=\s*["\']?([^"\n\r\t#"\']*)["\']?/', $env_content, $matches)) {
        $aes_secret = trim($matches[1]);
    }
}

// Se não houver AES_SECRET configurado no .env, tenta ler do .env.example
if (empty($aes_secret) && file_exists('.env.example')) {
    $env_example = file_get_contents('.env.example');
    if (preg_match('/AES_SECRET\s*=\s*["\']?([^"\n\r\t#"\']*)["\']?/', $env_example, $matches)) {
        $aes_secret = trim($matches[1]);
    }
}

// 2. Valida o token de segurança enviado na URL
$token = $_GET['token'] ?? '';
if (empty($aes_secret) || empty($token) || $token !== $aes_secret) {
    header('HTTP/1.1 401 Unauthorized');
    header('Content-Type: text/html; charset=utf-8');
    echo '<div style="font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 30px; border: 1px solid #ef4444; background: #fef2f2; border-radius: 8px; color: #991b1b; text-align: center;">';
    echo '<h2 style="margin-top:0;">Acesso Não Autorizado</h2>';
    echo '<p>O token fornecido na URL é inválido ou está ausente.</p>';
    echo '<p style="font-size: 0.9em; color: #7f1d1d;">Verifique a chave <strong>AES_SECRET</strong> no seu arquivo <strong>.env</strong>.</p>';
    echo '</div>';
    exit;
}

header('Content-Type: text/plain; charset=utf-8');
echo "=============================================\n";
echo "🚀 Web Bulk Mailer - Deploy HTTP iniciado\n";
echo "=============================================\n\n";

// 3. Verifica se as funções do sistema estão disponíveis
if (!function_exists('shell_exec')) {
    die("❌ Erro: A função 'shell_exec' está desabilitada nas configurações do PHP (php.ini) desta hospedagem.\nEntre em contato com o suporte ou use um terminal SSH se disponível.");
}

// 4. Executa o Prisma db push
// Tenta utilizar o binário local do prisma no node_modules para garantir compatibilidade
$prisma_path = 'node_modules/.bin/prisma';
if (file_exists($prisma_path)) {
    $cmd = "node $prisma_path db push --schema=prisma/schema.prisma 2>&1";
} else {
    $cmd = "npx prisma db push --schema=prisma/schema.prisma 2>&1";
}

echo "📂 Executando comando: $cmd\n";
echo "⏳ Processando tabelas no banco de dados...\n";
echo "---------------------------------------------\n";

$output = shell_exec($cmd);

if (empty($output)) {
    echo "⚠️ O comando não retornou nenhuma saída. Verifique se o Node.js está instalado no ambiente de hospedagem.\n";
} else {
    echo $output;
}

echo "---------------------------------------------\n";
echo "✅ Processo de Deploy via HTTP concluído!\n";
echo "Use as credenciais abaixo para entrar no sistema:\n";
echo "Login: admin@dentalgo.com.br\n";
echo "Senha: Admin2026@\n";
