Especificação de Requisitos de Software
(PRD)
Projeto: Web Bulk Mailer (Disparador de E-mails via VPS)
Arquitetura Base: Next.js (App Router) + PostgreSQL + Redis (Fila)
Ambiente de Destino: VPS (Docker Compose)

1. Visão Geral do Produto
O Web Bulk Mailer é uma aplicação web autohospedada projetada para processar grandes
volumes de envios de e-mails. Movendo o sistema do Desktop (Electron) para a Nuvem (VPS
com Next.js), ganhamos a capacidade de acessar o painel de qualquer lugar, fechar a aba do
navegador sem interromper o envio e permitir que múltiplos usuários da equipe gerenciem
campanhas.

2. A Mudança de Paradigma Arquitetural (Atenção
Crítica)
Diferente de um app Desktop, um servidor web (como as API Routes do Next.js) não pode
manter uma requisição aberta rodando um loop de 2.500 e-mails com "sleep" entre eles. O
servidor daria timeout. Para o ambiente VPS, a arquitetura exige obrigatoriamente a separação
entre a interface e o motor de disparo.
Stack Tecnológica Recomendada:
● Frontend / Backend (BFF): Next.js (App Router, Server Actions).
● Banco de Dados: PostgreSQL (gerenciado via Prisma ORM ou Drizzle) para armazenar
campanhas, templates e credenciais.
● Fila e Background Jobs (O Coração): Redis + BullMQ. Um worker Node.js rodando em
background separadamente da API do Next.js será o responsável por consumir os
e-mails e disparar pelo SMTP.
● Armazenamento de Planilhas: Upload via API salvando temporariamente no disco do
container Docker (ou storage S3-compatible como MinIO) para processamento em lote.

3. Requisitos Funcionais (RF)

ID Módulo Descrição Funcional Regras de Negócio

Críticas

RF-001 Configurador SMTP

Global

Painel para cadastrar
e validar credenciais
SMTP. As senhas
devem ser
criptografadas antes
de salvar no
PostgreSQL.

O sistema deve usar
variáveis de ambiente
(AES_SECRET) para
encriptar e
desencriptar a senha
do SMTP no
momento do envio.

RF-002 Gerenciador de
Templates

Editor de texto
(WYSIWYG) para
criar o corpo do
e-mail aceitando
variáveis dinâmicas
no padrão
{{NomeColuna}}.

O template deve ser
salvo no banco e
renderizado no
momento em que o
worker consome o
job.

RF-003 Processamento
Assíncrono de
Planilhas

Upload de arquivos
.xlsx. O Next.js lê a
planilha, cria o
registro da
Campanha no
Postgres e insere
milhares de "Jobs" na
fila do Redis em
segundos.

A UI não deve travar
durante o upload.
Após enviar, a tela
entra em modo de
leitura (Polling ou
WebSockets) para
ver o progresso.

RF-004 Dashboard de
Execução

Tela de
monitoramento
mostrando a taxa de
envio, sucessos e
falhas em tempo real
lendo os dados da
fila.

Possibilidade de
"Pausar" a fila no
BullMQ (Redis) ou
"Cancelar" jobs
pendentes.

4. Fluxo de Operação (O Ciclo de Vida de uma
Campanha)
1. Setup: O usuário acessa o Next.js, configura o SMTP e cria um Template.
2. Ingestão: Faz upload da planilha "parte_1.xlsx".
3. Preparação (Next.js): A Server Action converte o Excel para JSON, salva no
PostgreSQL os metadados da campanha, e faz um queue.addBulk() empurrando os 688
destinatários para o Redis de uma só vez.

4. Processamento (Worker): Um serviço rodando em paralelo no VPS (um script Node
com BullMQ) escuta o Redis. Ele pega o email 1, injeta as tags no template, envia via
nodemailer pelo SMTP, aguarda o rate limit configurado (ex: 100ms) e marca o job como
concluído.
5. Monitoramento: O usuário, na praia pelo celular, abre o painel Next.js que consulta o
PostgreSQL e o Redis para mostrar "600/688 enviados".

5. Sugestão de Deploy (Infraestrutura)
Para facilitar o setup na VPS (ex: Hetzner, DigitalOcean), a aplicação deve ser empacotada
com Docker Compose contendo 4 serviços:
version: '3.8'
services:
web:
build: . # Aplicação Next.js
ports: ["3000:3000"]
worker:
build: .
command: npm run worker # Processo Node isolado pro BullMQ
db:
image: postgres:15
volumes: [pgdata:/var/lib/postgresql/data]
redis:
image: redis:7-alpine
