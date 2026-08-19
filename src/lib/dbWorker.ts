import { prisma } from './db';
import { hashPassword } from './auth';
import { decrypt } from './crypto';
import nodemailer from 'nodemailer';

// Rastreamento em memória para evitar execução concorrente da mesma campanha
const activeCampaigns = new Set<string>();

// Função para compilar templates substituindo placeholders {{NomeColuna}}
function compileTemplate(text: string, data: any): string {
  if (!text) return '';
  return text.replace(/\{\{\s*(.*?)\s*\}\}/g, (match, key) => {
    const foundKey = Object.keys(data).find(k => k.toLowerCase() === key.toLowerCase());
    return foundKey !== undefined ? String(data[foundKey]) : match;
  });
}

// Helper de Sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Processador individual de campanha
async function runCampaign(campaignId: string) {
  if (activeCampaigns.has(campaignId)) return;
  activeCampaigns.add(campaignId);

  console.log(`🤖 [DB Worker] Iniciando processamento da campanha: ${campaignId}`);

  try {
    while (activeCampaigns.has(campaignId)) {
      // 1. Busca os dados mais recentes da campanha
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { template: true, smtpConfig: true },
      });

      if (!campaign) {
        console.error(`🤖 [DB Worker] Campanha ${campaignId} não encontrada no banco.`);
        activeCampaigns.delete(campaignId);
        break;
      }

      // Se a campanha foi pausada ou cancelada pelo usuário, interrompe o loop
      if (campaign.status !== 'PROCESSING') {
        console.log(`🤖 [DB Worker] Campanha ${campaign.name} está em status "${campaign.status}". Parando worker.`);
        activeCampaigns.delete(campaignId);
        break;
      }

      // 2. Busca o próximo destinatário pendente
      const recipient = await prisma.recipientLog.findFirst({
        where: { campaignId: campaign.id, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });

      // Se não houver mais destinatários pendentes, a campanha foi concluída!
      if (!recipient) {
        console.log(`🤖 [DB Worker] Todos os destinatários da campanha ${campaign.name} foram processados.`);
        
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'COMPLETED' },
        });

        // 🔗 ENCADEAMENTO: Agenda a próxima se configurada
        if (campaign.nextCampaignId) {
          const delayMs = campaign.nextCampaignDelayMinutes * 60 * 1000;
          const scheduledStartAt = new Date(Date.now() + delayMs);
          
          await prisma.campaign.update({
            where: { id: campaign.nextCampaignId },
            data: { scheduledStartAt },
          });

          console.log(`🔗 [DB Worker] Campanha ${campaign.name} concluída. Próxima campanha (ID: ${campaign.nextCampaignId}) agendada para ${scheduledStartAt}`);
          
          // Dispara o worker global para agendar/checar
          triggerDbWorker();
        }

        activeCampaigns.delete(campaignId);
        break;
      }

      // 3. Marca o destinatário como em processamento (PROCESSING) atomically
      const claim = await prisma.recipientLog.updateMany({
        where: { id: recipient.id, status: 'PENDING' },
        data: { status: 'PROCESSING' }
      });

      if (claim.count === 0) {
        // Already claimed by another worker thread
        continue;
      }

      // Validações de SMTP e Template
      if (!campaign.smtpConfig) {
        await prisma.recipientLog.update({
          where: { id: recipient.id },
          data: { status: 'FAILED', error: 'Configuração SMTP ausente na campanha.' },
        });
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { failedEmails: { increment: 1 } },
        });
        continue;
      }

      if (!campaign.template) {
        await prisma.recipientLog.update({
          where: { id: recipient.id },
          data: { status: 'FAILED', error: 'Template de e-mail ausente na campanha.' },
        });
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { failedEmails: { increment: 1 } },
        });
        continue;
      }

      // Descriptografa a senha do SMTP
      let smtpPassword = '';
      try {
        smtpPassword = decrypt(campaign.smtpConfig.pass);
      } catch (err) {
        await prisma.recipientLog.update({
          where: { id: recipient.id },
          data: { status: 'FAILED', error: 'Falha ao descriptografar a senha do SMTP.' },
        });
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { failedEmails: { increment: 1 } },
        });
        continue;
      }

      // Resolve attachment if present
      const attachments: any[] = [];
      if (recipient.attachmentStorageKey) {
        try {
          const { resolveSafePath } = await import('./storage');
          const resolvedSafePath = resolveSafePath(recipient.attachmentStorageKey);

          const fs = await import('fs');
          if (!fs.existsSync(resolvedSafePath)) {
            throw new Error('Arquivo do anexo não encontrado no storage.');
          }

          attachments.push({
            filename: recipient.attachmentOriginalName || 'anexo.pdf',
            path: resolvedSafePath,
            contentType: recipient.attachmentMimeType || 'application/pdf',
          });
        } catch (attachErr: any) {
          const errorMsg = `Erro de anexo: ${attachErr.message}`;
          await prisma.recipientLog.update({
            where: { id: recipient.id },
            data: { status: 'FAILED', error: errorMsg },
          });
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { failedEmails: { increment: 1 } },
          });
          continue;
        }
      }

      // Compila o template
      const recipientData = (recipient.data as any) || {};
      const compiledSubject = compileTemplate(campaign.template.subject, recipientData);
      
      const appUrl = process.env.APP_URL || 'http://localhost:3008';
      const trackingPixel = `<img src="${appUrl}/api/track/open/${recipient.id}" width="1" height="1" style="display:none !important;" alt="" />`;
      const compiledBody = compileTemplate(campaign.template.body, recipientData) + trackingPixel;

      // Configura nodemailer
      const transporter = nodemailer.createTransport({
        host: campaign.smtpConfig.host,
        port: campaign.smtpConfig.port,
        secure: campaign.smtpConfig.secure,
        auth: {
          user: campaign.smtpConfig.user,
          pass: smtpPassword,
        },
      });

      try {
        await transporter.sendMail({
          from: `"${campaign.smtpConfig.name}" <${campaign.smtpConfig.user}>`,
          to: recipient.email,
          subject: compiledSubject,
          html: compiledBody,
          attachments,
        });

        // Sucesso
        await prisma.recipientLog.update({
          where: { id: recipient.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            error: null,
          },
        });

        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { sentEmails: { increment: 1 } },
        });

      } catch (sendError: any) {
        console.error(`🤖 [DB Worker] Falha ao enviar e-mail para ${recipient.email}:`, sendError);
        
        await prisma.recipientLog.update({
          where: { id: recipient.id },
          data: {
            status: 'FAILED',
            error: sendError.message || 'Erro desconhecido no envio SMTP.',
          },
        });

        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { failedEmails: { increment: 1 } },
        });
      }

      // Cadência (Delay entre disparos)
      let delay = 100;
      if (campaign.sendingMode === 'FIXED') {
        delay = campaign.minDelay;
      } else if (campaign.sendingMode === 'RANDOM') {
        const min = campaign.minDelay;
        const max = campaign.maxDelay;
        delay = Math.floor(Math.random() * (max - min + 1)) + min;
      }

      await sleep(delay);
    }
  } catch (error) {
    console.error(`🤖 [DB Worker] Erro crítico no loop da campanha ${campaignId}:`, error);
  } finally {
    activeCampaigns.delete(campaignId);
  }
}

// Função principal de gatilho do worker do banco de dados
export async function triggerDbWorker() {
  try {
    // 1. Busca e inicia campanhas em processamento ativo
    const activeRunningCampaigns = await prisma.campaign.findMany({
      where: { status: 'PROCESSING' },
      select: { id: true },
    });

    for (const campaign of activeRunningCampaigns) {
      if (!activeCampaigns.has(campaign.id)) {
        runCampaign(campaign.id);
      }
    }

    // 2. Busca campanhas agendadas que já atingiram o horário de início
    const now = new Date();
    const scheduledCampaigns = await prisma.campaign.findMany({
      where: {
        status: 'PENDING',
        scheduledStartAt: {
          lte: now,
        },
      },
      select: { id: true },
    });

    for (const campaign of scheduledCampaigns) {
      // Altera o status para PROCESSING e inicia
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'PROCESSING', scheduledStartAt: null },
      });
      
      if (!activeCampaigns.has(campaign.id)) {
        runCampaign(campaign.id);
      }
    }
  } catch (err) {
    console.error('🤖 [DB Worker] Erro ao disparar triggerDbWorker:', err);
  }
}

// Garante que o administrador padrão exista no banco
export async function ensureAdminUser() {
  try {
    const adminEmail = 'admin@dentalgo.com.br';
    const adminPassword = 'Admin2026@';

    const admin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!admin) {
      const hashedPassword = hashPassword(adminPassword);
      await prisma.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
        },
      });
      console.log(`✅ [DB Worker] Usuário administrador padrão criado: ${adminEmail}`);
    }
  } catch (error) {
    console.error('🤖 [DB Worker] Erro ao verificar/criar administrador padrão:', error);
  }
}
