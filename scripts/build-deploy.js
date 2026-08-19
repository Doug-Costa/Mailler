const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.join(__dirname, '..');
const deployDir = path.join(rootDir, 'deploy');
const zipFile = path.join(rootDir, 'mailler-deploy.zip');

function deleteFolderRecursive(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file) => {
      const curPath = path.join(directoryPath, file);
      if (fs.statSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
  }
}

function copyFolderRecursiveSync(source, target) {
  let files = [];
  const targetFolder = path.join(target, path.basename(source));
  
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  if (fs.statSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach((file) => {
      const curSource = path.join(source, file);
      if (fs.statSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, targetFolder);
      } else {
        fs.copyFileSync(curSource, path.join(targetFolder, file));
      }
    });
  }
}

function copyFolderContentsSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  const files = fs.readdirSync(source);
  files.forEach((file) => {
    const curSource = path.join(source, file);
    const curTarget = path.join(target, file);
    if (fs.statSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, target);
    } else {
      fs.copyFileSync(curSource, curTarget);
    }
  });
}

async function main() {
  console.log('🏗️  Iniciando compilação do Next.js...');
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

  console.log('🧹 Limpando diretórios de deploy anteriores...');
  deleteFolderRecursive(deployDir);
  if (fs.existsSync(zipFile)) {
    fs.unlinkSync(zipFile);
  }

  fs.mkdirSync(deployDir, { recursive: true });

  console.log('📁 Copiando arquivos compilados standalone...');
  // Copia o conteúdo de .next/standalone para a raiz de deploy/
  const standaloneDir = path.join(rootDir, '.next', 'standalone');
  if (!fs.existsSync(standaloneDir)) {
    throw new Error('Pasta .next/standalone não encontrada. Verifique se o "output: \'standalone\'" está configurado no next.config.ts');
  }
  copyFolderContentsSync(standaloneDir, deployDir);

  console.log('📁 Copiando assets públicos e arquivos estáticos...');
  // Copia .next/static para deploy/.next/static
  const nextStaticSource = path.join(rootDir, '.next', 'static');
  const nextStaticTarget = path.join(deployDir, '.next');
  copyFolderRecursiveSync(nextStaticSource, nextStaticTarget);

  // Copia public para deploy/public
  const publicSource = path.join(rootDir, 'public');
  if (fs.existsSync(publicSource)) {
    copyFolderRecursiveSync(publicSource, deployDir);
  }

  console.log('📁 Copiando configurações do Prisma e Banco de Dados...');
  // Copia prisma para deploy/prisma
  const prismaSource = path.join(rootDir, 'prisma');
  if (fs.existsSync(prismaSource)) {
    copyFolderRecursiveSync(prismaSource, deployDir);
  }

  // Copia deploy.sh para deploy/deploy.sh
  const deployScriptSource = path.join(rootDir, 'deploy.sh');
  if (fs.existsSync(deployScriptSource)) {
    fs.copyFileSync(deployScriptSource, path.join(deployDir, 'deploy.sh'));
  }

  // Copia deploy.php para deploy/deploy.php
  const deployPhpSource = path.join(rootDir, 'deploy.php');
  if (fs.existsSync(deployPhpSource)) {
    fs.copyFileSync(deployPhpSource, path.join(deployDir, 'deploy.php'));
  }

  console.log('📄 Gerando .env.example pré-configurado...');
  // Gera uma chave AES_SECRET aleatória de 32 bytes em formato hex
  const randomSecret = crypto.randomBytes(32).toString('hex');
  const envExampleContent = `# Web Bulk Mailer - Configurações do Ambiente
# URL base de execução do sistema
APP_URL=http://mailler.dentalgo.com.br

# Chave secreta de criptografia (AES-256 e Sessão) - Pré-gerada aleatória
AES_SECRET=${randomSecret}

# URL de conexão com o banco de dados PostgreSQL
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:PORTA/NOME_BANCO?schema=public

# OPCIONAL: Configuração do Redis (Deixe em branco ou "none" para usar o banco de dados como fila)
REDIS_URL=none
`;

  fs.writeFileSync(path.join(deployDir, '.env.example'), envExampleContent);

  console.log('🤐 Compactando arquivos em mailler-deploy.zip...');
  try {
    if (process.platform === 'win32') {
      // No Windows, usa PowerShell para criar o zip
      console.log('Running PowerShell Compress-Archive...');
      execSync(`powershell.exe -Command "Compress-Archive -Path '${deployDir}/*' -DestinationPath '${zipFile}' -Force"`, { cwd: rootDir, stdio: 'inherit' });
    } else {
      // Em sistemas baseados em Unix, usa o comando zip
      console.log('Running zip command...');
      execSync(`zip -r mailler-deploy.zip deploy/*`, { cwd: rootDir, stdio: 'inherit' });
    }
    console.log(`\n🎉 Web Bulk Mailer empacotado com sucesso!`);
    console.log(`📦 Arquivo gerado: ${zipFile}`);
  } catch (zipError) {
    console.error('⚠️  Aviso: Não foi possível compactar automaticamente o ZIP (comando do sistema indisponível).');
    console.log(`👉 A pasta "deploy/" está pronta. Compacte o conteúdo dessa pasta manualmente para "mailler-deploy.zip".`);
  }
}

main().catch(err => {
  console.error('❌ Erro durante o processo de build/deploy:', err);
  process.exit(1);
});
