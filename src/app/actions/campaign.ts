"use server";

import * as xlsx from 'xlsx';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { mailQueue } from '@/lib/queue';
import { triggerDbWorker } from '@/lib/dbWorker';
import { validateZipBuffer, ZipEntryInfo } from '@/lib/zipValidator';
import { saveAttachment, deleteCampaignDir } from '@/lib/storage';

// Helper to render templates
function compileTemplate(text: string, data: any): string {
  if (!text) return '';
  return text.replace(/\{\{\s*(.*?)\s*\}\}/g, (match, key) => {
    const foundKey = Object.keys(data).find(k => k.toLowerCase() === key.toLowerCase());
    return foundKey !== undefined ? String(data[foundKey]) : match;
  });
}

function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function getCampaigns() {
  try {
    return await prisma.campaign.findMany({
      include: {
        template: true,
        smtpConfig: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error: any) {
    throw new Error('Erro ao listar campanhas: ' + error.message);
  }
}

export async function getCampaignDetails(id: string) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        template: true,
        smtpConfig: true,
        nextCampaign: true,
        recipients: {
          orderBy: { createdAt: 'asc' },
          take: 150, // Retorna os primeiros 150 logs para preview
        },
      },
    });
    return campaign;
  } catch (error: any) {
    throw new Error('Erro ao buscar detalhes da campanha: ' + error.message);
  }
}

/**
 * Validates the Excel sheet and ZIP attachments in-memory.
 */
export async function validateCampaignFiles(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    const zipFile = formData.get('zipFile') as File | null;
    const attachmentMode = formData.get('attachmentMode') as string || 'NONE';
    const attachmentColumnInput = formData.get('attachmentColumn') as string || '';

    if (!file) {
      return { success: false, error: 'Planilha de contatos não fornecida.' };
    }

    // Parse Excel Sheet
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json<any>(sheet);

    if (rawData.length === 0) {
      return { success: false, error: 'A planilha está vazia.' };
    }

    // Find email column
    const firstRowKeys = Object.keys(rawData[0]);
    const emailKey = firstRowKeys.find(key => key.toLowerCase() === 'email');
    if (!emailKey) {
      return { success: false, error: 'Coluna "email" ou "Email" não encontrada na planilha.' };
    }

    // Find default attachment column if not provided
    let attachmentColumn = attachmentColumnInput;
    if (!attachmentColumn) {
      const foundCertCol = firstRowKeys.find(key => key.toLowerCase() === 'certificado');
      if (foundCertCol) {
        attachmentColumn = foundCertCol;
      }
    }

    // ZIP Validation
    let zipFilesMap = new Map<string, ZipEntryInfo>();
    let totalPdfs = 0;
    if (attachmentMode === 'INDIVIDUAL') {
      if (!zipFile || zipFile.size === 0) {
        return { success: false, error: 'Arquivo ZIP não fornecido no modo individual.' };
      }
      if (!attachmentColumn) {
        return { success: false, error: 'Coluna de mapeamento de anexo não identificada.' };
      }

      const zipBuffer = Buffer.from(await zipFile.arrayBuffer());
      const zipValidation = validateZipBuffer(zipBuffer);
      if (!zipValidation.success) {
        return { success: false, error: zipValidation.error };
      }

      totalPdfs = zipValidation.files.length;
      for (const entry of zipValidation.files) {
        zipFilesMap.set(entry.normalizedName, entry);
      }
    }

    // Check mapping rows
    const rowsReport: any[] = [];
    const matchedZipNames = new Set<string>();

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const email = String(row[emailKey] || '').trim();
      
      // Get name
      const nameKey = Object.keys(row).find(k => k.toLowerCase() === 'nome') || Object.keys(row)[0];
      const name = String(row[nameKey] || '').trim();

      const expectedAttachment = attachmentColumn ? String(row[attachmentColumn] || '').trim() : '';

      let status = 'VALID';
      let error: string | null = null;

      if (!email) {
        status = 'ERROR';
        error = 'E-mail ausente';
      }

      if (attachmentMode === 'INDIVIDUAL') {
        if (!expectedAttachment) {
          status = 'ERROR';
          error = error ? `${error} e nome do anexo não informado` : 'Nome do anexo não informado';
        } else {
          const normalizedExpected = expectedAttachment.toLowerCase();
          const zipEntry = zipFilesMap.get(normalizedExpected);

          if (!zipEntry) {
            status = 'ERROR';
            error = error ? `${error} e PDF não encontrado` : 'PDF não encontrado';
          } else if (!zipEntry.isValidPdf) {
            status = 'ERROR';
            error = error ? `${error} e ${zipEntry.error}` : zipEntry.error || 'PDF inválido';
          } else {
            matchedZipNames.add(normalizedExpected);
          }
        }
      }

      rowsReport.push({
        line: i + 2, // Line index in sheet
        name,
        email,
        attachmentExpected: expectedAttachment || null,
        status,
        error,
      });
    }

    const validRecipients = rowsReport.filter(r => r.status === 'VALID').length;
    const missingEmails = rowsReport.filter(r => !r.email).length;
    const missingPdfs = rowsReport.filter(r => r.error && r.error.includes('não encontrado')).length;
    const invalidPdfs = rowsReport.filter(r => r.error && (r.error.toLowerCase().includes('inválid') || r.error.includes('excede') || r.error.includes('vazio') || r.error.includes('Apenas arquivos PDF'))).length;
    
    // Find unused PDFs
    const unusedPdfs: string[] = [];
    for (const [name, entry] of zipFilesMap.entries()) {
      if (!matchedZipNames.has(name)) {
        unusedPdfs.push(entry.originalName);
      }
    }

    return {
      success: true,
      stats: {
        totalRows: rawData.length,
        totalPdfs,
        validRecipients,
        missingEmails,
        missingPdfs,
        invalidPdfs,
        unusedPdfsCount: unusedPdfs.length,
        unusedPdfs,
      },
      rows: rowsReport,
      detectedColumn: attachmentColumn,
    };
  } catch (err: any) {
    console.error('Validation error:', err);
    return { success: false, error: 'Erro de validação interna: ' + err.message };
  }
}

export async function createCampaign(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    const zipFile = formData.get('zipFile') as File | null;
    const name = formData.get('name') as string;
    const templateId = formData.get('templateId') as string;
    const smtpConfigId = formData.get('smtpConfigId') as string;

    const sendingMode = (formData.get('sendingMode') as string) || 'IMMEDIATE';
    const minDelay = Number(formData.get('minDelay') || 100);
    const maxDelay = Number(formData.get('maxDelay') || 1000);
    const nextCampaignId = formData.get('nextCampaignId') as string;
    const nextCampaignDelayMinutes = Number(formData.get('nextCampaignDelayMinutes') || 0);
    const isTriggerOnly = formData.get('isTriggerOnly') === 'true';

    const attachmentMode = (formData.get('attachmentMode') as string) || 'NONE';
    const attachmentColumnInput = formData.get('attachmentColumn') as string || '';
    const ignoreInvalidRows = formData.get('ignoreInvalidRows') === 'true';

    if (!file || !name || !templateId || !smtpConfigId) {
      return { success: false, error: 'Campos obrigatórios ausentes.' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json<any>(sheet);

    if (rawData.length === 0) {
      return { success: false, error: 'A planilha está vazia.' };
    }

    const firstRowKeys = Object.keys(rawData[0]);
    const emailKey = firstRowKeys.find(key => key.toLowerCase() === 'email');
    if (!emailKey) {
      return { success: false, error: 'Coluna "email" ou "Email" não encontrada na planilha.' };
    }

    // Detect attachment column
    let attachmentColumn = attachmentColumnInput;
    if (!attachmentColumn) {
      const foundCol = firstRowKeys.find(key => key.toLowerCase() === 'certificado');
      if (foundCol) {
        attachmentColumn = foundCol;
      }
    }

    // Validate ZIP again for server-side security enforcement
    let zipFilesMap = new Map<string, ZipEntryInfo>();
    let totalPdfs = 0;
    if (attachmentMode === 'INDIVIDUAL') {
      if (!zipFile || zipFile.size === 0) {
        return { success: false, error: 'Arquivo ZIP não fornecido no modo individual.' };
      }
      if (!attachmentColumn) {
        return { success: false, error: 'Coluna de mapeamento de anexo não informada.' };
      }

      const zipBuffer = Buffer.from(await zipFile.arrayBuffer());
      const zipValidation = validateZipBuffer(zipBuffer);
      if (!zipValidation.success) {
        return { success: false, error: zipValidation.error };
      }

      totalPdfs = zipValidation.files.length;
      for (const entry of zipValidation.files) {
        zipFilesMap.set(entry.normalizedName, entry);
      }
    }

    // Construct reports
    const pendingLogsToCreate: any[] = [];
    const rejectedLogsToCreate: any[] = [];
    let validCount = 0;
    let rejectedCount = 0;

    // We generate temporary UUIDs so we can save attachments with matching RecipientLog ID
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const email = String(row[emailKey] || '').trim();
      
      const expectedAttachment = attachmentColumn ? String(row[attachmentColumn] || '').trim() : '';
      let status = 'VALID';
      let error: string | null = null;
      let zipEntry: ZipEntryInfo | undefined;

      if (!email) {
        status = 'ERROR';
        error = 'E-mail ausente';
      }

      if (attachmentMode === 'INDIVIDUAL') {
        if (!expectedAttachment) {
          status = 'ERROR';
          error = error ? `${error} e nome do anexo não informado` : 'Nome do anexo não informado';
        } else {
          const normalizedExpected = expectedAttachment.toLowerCase();
          zipEntry = zipFilesMap.get(normalizedExpected);

          if (!zipEntry) {
            status = 'ERROR';
            error = error ? `${error} e PDF não encontrado` : 'PDF não encontrado';
          } else if (!zipEntry.isValidPdf) {
            status = 'ERROR';
            error = error ? `${error} e ${zipEntry.error}` : zipEntry.error || 'PDF inválido';
          }
        }
      }

      const recipientId = crypto.randomUUID();

      if (status === 'VALID') {
        validCount++;
        pendingLogsToCreate.push({
          id: recipientId,
          email,
          data: row as any,
          status: 'PENDING',
          // Store attachment metadata
          attachmentOriginalName: zipEntry ? zipEntry.originalName : null,
          attachmentMimeType: zipEntry ? 'application/pdf' : null,
          attachmentSize: zipEntry ? zipEntry.size : null,
          attachmentSha256: zipEntry ? computeSha256(zipEntry.buffer) : null,
          attachmentStatus: zipEntry ? 'VALID' : null,
          zipBuffer: zipEntry ? zipEntry.buffer : null, // keep buffer temporarily in memory to save after campaign creation
        });
      } else {
        rejectedCount++;
        rejectedLogsToCreate.push({
          id: recipientId,
          email: email || 'invalido@sem-email.com',
          data: row as any,
          status: 'FAILED', // Rejected rows are marked as FAILED in logs and not sent
          error: `Erro de importação: ${error}`,
          attachmentOriginalName: expectedAttachment || null,
          attachmentStatus: expectedAttachment ? 'ERROR' : 'MISSING',
          attachmentError: error,
        });
      }
    }

    // If there are failures and we are NOT ignoring them, reject campaign creation
    if (rejectedCount > 0 && !ignoreInvalidRows) {
      return {
        success: false,
        error: `Inconsistências encontradas (${rejectedCount} linhas com erro). Crie a campanha ignorando os erros.`,
      };
    }

    // Create Campaign in database
    const campaign = await prisma.campaign.create({
      data: {
        name,
        templateId,
        smtpConfigId,
        status: isTriggerOnly ? 'PENDING' : 'PROCESSING',
        totalEmails: validCount + rejectedCount,
        sendingMode,
        minDelay,
        maxDelay,
        nextCampaignId: nextCampaignId || null,
        nextCampaignDelayMinutes,
        // New columns
        attachmentMode,
        attachmentColumn: attachmentMode === 'INDIVIDUAL' ? attachmentColumn : null,
        totalAttachments: totalPdfs,
        validRecipientsCount: validCount,
        rejectedRecipientsCount: rejectedCount,
      },
    });

    // Save PDF attachment files to disk
    const logsToInsert: any[] = [];

    for (const item of pendingLogsToCreate) {
      let storageKey: string | null = null;
      if (item.zipBuffer) {
        // Save to safe storage folder: storage/campaigns/{campaignId}/attachments/{recipientId}.pdf
        storageKey = await saveAttachment(campaign.id, item.id, item.zipBuffer);
      }

      logsToInsert.push({
        id: item.id,
        campaignId: campaign.id,
        email: item.email,
        data: item.data,
        status: item.status,
        attachmentOriginalName: item.attachmentOriginalName,
        attachmentStorageKey: storageKey,
        attachmentMimeType: item.attachmentMimeType,
        attachmentSize: item.attachmentSize,
        attachmentSha256: item.attachmentSha256,
        attachmentStatus: item.attachmentStatus,
      });
    }

    // Add rejected logs to write directly as failed
    for (const item of rejectedLogsToCreate) {
      logsToInsert.push({
        id: item.id,
        campaignId: campaign.id,
        email: item.email,
        data: item.data,
        status: item.status,
        error: item.error,
        attachmentOriginalName: item.attachmentOriginalName,
        attachmentStatus: item.attachmentStatus,
        attachmentError: item.attachmentError,
      });
    }

    await prisma.recipientLog.createMany({
      data: logsToInsert,
    });

    // If wait for trigger is set, stop here
    if (isTriggerOnly) {
      return { success: true, campaignId: campaign.id, message: 'Campanha criada com sucesso, aguardando gatilho.' };
    }

    // If there are valid recipients, queue them
    if (validCount > 0) {
      const validLogs = await prisma.recipientLog.findMany({
        where: { campaignId: campaign.id, status: 'PENDING' },
        select: { id: true },
      });

      const jobs = validLogs.map((log) => ({
        name: `mail-${log.id}`,
        data: {
          recipientLogId: log.id,
          campaignId: campaign.id,
        },
      }));

      await mailQueue.addBulk(jobs);
      
      // Trigger background workers
      triggerDbWorker();
    } else {
      // If there are no valid recipients, mark the campaign as completed immediately
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'COMPLETED' },
      });
    }

    return { success: true, campaignId: campaign.id };
  } catch (error: any) {
    console.error('Error creating campaign:', error);
    return { success: false, error: 'Erro inesperado: ' + error.message };
  }
}

export async function pauseCampaign(id: string) {
  try {
    await prisma.campaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function resumeCampaign(id: string) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { status: true, sentEmails: true, failedEmails: true },
    });

    if (!campaign) {
      return { success: false, error: 'Campanha não encontrada.' };
    }

    await prisma.campaign.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

    // Se estava pendente, enfileira
    if (campaign.status === 'PENDING' && campaign.sentEmails === 0 && campaign.failedEmails === 0) {
      const createdLogs = await prisma.recipientLog.findMany({
        where: { campaignId: id, status: 'PENDING' },
        select: { id: true },
      });

      if (createdLogs.length > 0) {
        const jobs = createdLogs.map((log) => ({
          name: `mail-${log.id}`,
          data: {
            recipientLogId: log.id,
            campaignId: id,
          },
        }));
        await mailQueue.addBulk(jobs);
      }
    }

    triggerDbWorker();

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function cancelCampaign(id: string) {
  try {
    await prisma.campaign.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    
    await prisma.recipientLog.updateMany({
      where: { campaignId: id, status: 'PENDING' },
      data: { status: 'FAILED', error: 'Campanha cancelada pelo usuário' },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteCampaign(id: string) {
  try {
    // Delete files first
    await deleteCampaignDir(id);

    await prisma.campaign.delete({
      where: { id },
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Clean up PDF attachments safely for completed or cancelled campaigns.
 */
export async function cleanupCampaignFiles(id: string) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { status: true }
    });

    if (!campaign) {
      return { success: false, error: 'Campanha não encontrada.' };
    }

    if (campaign.status !== 'COMPLETED' && campaign.status !== 'CANCELLED') {
      return { success: false, error: 'Não é possível limpar arquivos de uma campanha ativa.' };
    }

    await deleteCampaignDir(id);

    // Remove storage references from logs
    await prisma.recipientLog.updateMany({
      where: { campaignId: id },
      data: {
        attachmentStorageKey: null,
      }
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Sends a single test email using variables and attachment of a selected row.
 */
export async function testRunCampaignRecipient(recipientLogId: string, testEmail: string) {
  try {
    const recipient = await prisma.recipientLog.findUnique({
      where: { id: recipientLogId },
      include: {
        campaign: {
          include: {
            template: true,
            smtpConfig: true,
          }
        }
      }
    });

    if (!recipient) {
      return { success: false, error: 'Destinatário não encontrado.' };
    }

    const campaign = recipient.campaign;
    if (!campaign.smtpConfig || !campaign.template) {
      return { success: false, error: 'Configuração SMTP ou Template ausente.' };
    }

    const { decrypt } = await import('@/lib/crypto');
    const nodemailer = await import('nodemailer');
    const smtpPassword = decrypt(campaign.smtpConfig.pass);

    const compiledSubject = `[TESTE] ` + compileTemplate(campaign.template.subject, recipient.data);
    const compiledBody = compileTemplate(campaign.template.body, recipient.data);

    const attachments = [];
    if (recipient.attachmentStorageKey) {
      const { resolveSafePath } = await import('@/lib/storage');
      const resolvedSafePath = resolveSafePath(recipient.attachmentStorageKey);
      
      const fs = await import('fs');
      if (fs.existsSync(resolvedSafePath)) {
        attachments.push({
          filename: recipient.attachmentOriginalName || 'anexo.pdf',
          path: resolvedSafePath,
          contentType: recipient.attachmentMimeType || 'application/pdf',
        });
      } else {
        return { success: false, error: 'Arquivo do anexo correspondente não encontrado no storage.' };
      }
    }

    const transporter = nodemailer.createTransport({
      host: campaign.smtpConfig.host,
      port: campaign.smtpConfig.port,
      secure: campaign.smtpConfig.secure,
      auth: {
        user: campaign.smtpConfig.user,
        pass: smtpPassword,
      },
    });

    await transporter.sendMail({
      from: `"${campaign.smtpConfig.name}" <${campaign.smtpConfig.user}>`,
      to: testEmail,
      subject: compiledSubject,
      html: compiledBody,
      attachments,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Test run failed:', error);
    return { success: false, error: 'Erro no disparo de teste: ' + error.message };
  }
}

/**
 * Resets failed recipients to PENDING, decreases failure stats, enqueues them, and runs campaign again.
 */
export async function retryFailedRecipients(campaignId: string) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });

    if (!campaign) {
      return { success: false, error: 'Campanha não encontrada.' };
    }

    const failedLogs = await prisma.recipientLog.findMany({
      where: { campaignId, status: 'FAILED' },
      select: { id: true },
    });

    if (failedLogs.length === 0) {
      return { success: false, error: 'Não há destinatários com falhas para tentar novamente.' };
    }

    // Set recipient status to PENDING and clear error
    await prisma.recipientLog.updateMany({
      where: { campaignId, status: 'FAILED' },
      data: { status: 'PENDING', error: null },
    });

    // Update campaign stats and set back to PROCESSING
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'PROCESSING',
        failedEmails: { decrement: failedLogs.length },
      },
    });

    // Add back to BullMQ
    const jobs = failedLogs.map((log) => ({
      name: `mail-${log.id}`,
      data: {
        recipientLogId: log.id,
        campaignId,
      },
    }));

    await mailQueue.addBulk(jobs);

    // Trigger workers
    triggerDbWorker();

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
