import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { prisma } from './lib/db';
import { connection, mailQueue } from './lib/queue';
import { decrypt } from './lib/crypto';

// Função para compilar templates substituindo placeholders {{NomeColuna}}
function compileTemplate(text: string, data: any): string {
  if (!text) return '';
  return text.replace(/\{\{\s*(.*?)\s*\}\}/g, (match, key) => {
    const foundKey = Object.keys(data).find(k => k.toLowerCase() === key.toLowerCase());
    return foundKey !== undefined ? String(data[foundKey]) : match;
  });
}

const worker = new Worker(
  'mail-queue',
  async (job: Job) => {
    // 1. VERIFICAÇÃO DE JOBS DO FLUXO DE ENCADEAMENTO (start-campaign)
    if (job.name === 'start-campaign') {
      const { campaignId } = job.data;
      console.log(`🔗 Fluxo Ativado: Iniciando campanha agendada ${campaignId}`);

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        console.error(`Campanha encadeada ${campaignId} não encontrada.`);
        return;
      }

      // Altera o status da campanha para PROCESSANDO
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'PROCESSING' },
      });

      // Busca todos os destinatários ainda pendentes
      const createdLogs = await prisma.recipientLog.findMany({
        where: { campaignId, status: 'PENDING' },
        select: { id: true },
      });

      if (createdLogs.length === 0) {
        console.log(`Nenhum destinatário pendente para a campanha ${campaignId}.`);
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'COMPLETED' },
        });
        return;
      }

      // Adiciona em lote na fila do BullMQ
      const jobs = createdLogs.map((log) => ({
        name: `mail-${log.id}`,
        data: {
          recipientLogId: log.id,
          campaignId: campaign.id,
        },
      }));

      await mailQueue.addBulk(jobs);
      console.log(`🚀 ${jobs.length} e-mails adicionados à fila para a campanha encadeada ${campaign.name}`);
      return;
    }

    // 2. DISPAROS DE E-MAILS PADRÃO
    const { recipientLogId, campaignId } = job.data;

    // Verifica status atual da campanha no banco de dados
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true, smtpConfig: true },
    });

    if (!campaign) {
      throw new Error(`Campanha ${campaignId} não encontrada.`);
    }

    // Se estiver cancelada, descarta o disparo
    if (campaign.status === 'CANCELLED') {
      await prisma.recipientLog.update({
        where: { id: recipientLogId },
        data: {
          status: 'FAILED',
          error: 'Disparo abortado devido ao cancelamento da campanha.',
        },
      });
      return;
    }

    // Se estiver pausada, lança um erro para colocar o job de volta na fila com delay/retry
    if (campaign.status === 'PAUSED') {
      throw new Error('A campanha está pausada. Retentando em instantes...');
    }

    // Atomic job claim: claim only if PENDING
    const claim = await prisma.recipientLog.updateMany({
      where: { id: recipientLogId, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });

    if (claim.count === 0) {
      console.log(`⚠️ Job [mail-${recipientLogId}] skip: already claimed or processed.`);
      return;
    }

    const recipient = await prisma.recipientLog.findUnique({
      where: { id: recipientLogId },
    });

    if (!recipient) {
      throw new Error(`Destinatário ${recipientLogId} não encontrado.`);
    }

    if (!campaign.smtpConfig) {
      const errorMsg = 'Configuração SMTP ausente na campanha.';
      await prisma.recipientLog.update({
        where: { id: recipientLogId },
        data: { status: 'FAILED', error: errorMsg },
      });
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { failedEmails: { increment: 1 } },
      });
      return;
    }

    if (!campaign.template) {
      const errorMsg = 'Template de e-mail ausente na campanha.';
      await prisma.recipientLog.update({
        where: { id: recipientLogId },
        data: { status: 'FAILED', error: errorMsg },
      });
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { failedEmails: { increment: 1 } },
      });
      return;
    }

    // Descriptografa a senha do SMTP
    let decryptedPassword = '';
    try {
      decryptedPassword = decrypt(campaign.smtpConfig.pass);
    } catch (err: any) {
      const errorMsg = 'Falha ao descriptografar a senha do SMTP.';
      await prisma.recipientLog.update({
        where: { id: recipientLogId },
        data: { status: 'FAILED', error: errorMsg },
      });
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { failedEmails: { increment: 1 } },
      });
      return;
    }

    // Resolve attachment if present
    const attachments: any[] = [];
    if (recipient.attachmentStorageKey) {
      try {
        const { resolveSafePath } = await import('./lib/storage');
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
          where: { id: recipientLogId },
          data: { status: 'FAILED', error: errorMsg },
        });
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { failedEmails: { increment: 1 } },
        });
        return;
      }
    }

    // Renderiza assunto e corpo do e-mail com as tags da planilha
    const recipientData = recipient.data || {};
    const compiledSubject = compileTemplate(campaign.template.subject, recipientData);
    
    // Injeta pixel invisível de rastreamento de abertura
    const appUrl = process.env.APP_URL || 'http://localhost:3008';
    const trackingPixel = `<img src="${appUrl}/api/track/open/${recipientLogId}" width="1" height="1" style="display:none !important;" alt="" />`;
    const compiledBody = compileTemplate(campaign.template.body, recipientData) + trackingPixel;

    // Configura o transportador nodemailer
    const transporter = nodemailer.createTransport({
      host: campaign.smtpConfig.host,
      port: campaign.smtpConfig.port,
      secure: campaign.smtpConfig.secure,
      auth: {
        user: campaign.smtpConfig.user,
        pass: decryptedPassword,
      },
    });

    try {
      // Envia o e-mail
      await transporter.sendMail({
        from: `"${campaign.smtpConfig.name}" <${campaign.smtpConfig.user}>`,
        to: recipient.email,
        subject: compiledSubject,
        html: compiledBody,
        attachments,
      });

      // Sucesso: Atualiza DB
      await prisma.recipientLog.update({
        where: { id: recipientLogId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          error: null,
        },
      });

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { sentEmails: { increment: 1 } },
      });

    } catch (sendError: any) {
      console.error(`Erro ao enviar e-mail para ${recipient.email}:`, sendError);
      
      // Falha: Atualiza DB
      await prisma.recipientLog.update({
        where: { id: recipientLogId },
        data: {
          status: 'FAILED',
          error: sendError.message || 'Erro desconhecido no envio SMTP.',
        },
      });

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { failedEmails: { increment: 1 } },
      });
    }

    // Verifica se a campanha foi finalizada
    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (updatedCampaign) {
      const processed = updatedCampaign.sentEmails + updatedCampaign.failedEmails;
      if (processed >= updatedCampaign.totalEmails && updatedCampaign.status === 'PROCESSING') {
        // Campanha marcada como CONCLUÍDA
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'COMPLETED' },
        });

        // 🔗 ENCADEAMENTO DE CAMPANHAS: Agendar a próxima se houver configurada
        if (updatedCampaign.nextCampaignId) {
          const delayMs = updatedCampaign.nextCampaignDelayMinutes * 60 * 1000;
          console.log(`🔗 Campanha ${updatedCampaign.name} concluída. Agendando próxima campanha (ID: ${updatedCampaign.nextCampaignId}) para daqui a ${updatedCampaign.nextCampaignDelayMinutes} minutos.`);
          
          await mailQueue.add(
            'start-campaign',
            { campaignId: updatedCampaign.nextCampaignId },
            { delay: delayMs }
          );
        }
      }
    }

    // 🕒 CONTROLE DE CADÊNCIA (Calcula o delay dinâmico antes de finalizar o Job)
    let delay = 50; // Modo IMMEDIATE (padrão imediato)
    
    if (campaign.sendingMode === 'FIXED') {
      delay = campaign.minDelay;
    } else if (campaign.sendingMode === 'RANDOM') {
      const min = campaign.minDelay;
      const max = campaign.maxDelay;
      // Calcula número aleatório entre min e max inclusivo
      delay = Math.floor(Math.random() * (max - min + 1)) + min;
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
  },
  {
    connection,
    concurrency: 1, // Processamento sequencial obrigatório para cadência correta
  }
);

worker.on('ready', () => {
  console.log('🚀 Worker BullMQ pronto e escutando a fila "mail-queue".');
});

worker.on('active', (job) => {
  console.log(`📥 Processando job [${job.name}] (ID: ${job.id})`);
});

worker.on('completed', (job) => {
  console.log(`✅ Job [${job.name}] concluído.`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job [${job?.name}] falhou:`, err.message);
});
