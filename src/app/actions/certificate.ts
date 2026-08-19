"use server";

import * as xlsx from 'xlsx';
import crypto from 'crypto';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/db';
import { mailQueue } from '@/lib/queue';
import { triggerDbWorker } from '@/lib/dbWorker';
import { 
  saveTemplateAsset, 
  saveBatchCertificate, 
  getTemplateStorageDir, 
  getBatchStorageDir, 
  resolveSafePath, 
  deleteTemplateDir, 
  deleteBatchDir 
} from '@/lib/storage';
import { validateBackgroundImage, validateSignatureImage } from '@/lib/imageValidator';
import { renderCertificatePdf, RenderParams } from '@/lib/pdfRenderer';
import AdmZip from 'adm-zip';

function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ----------------------------------------------------
// 1. TEMPLATE ACTIONS
// ----------------------------------------------------

export async function getCertificateTemplates() {
  try {
    return await prisma.certificateTemplate.findMany({
      where: { active: true },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error: any) {
    throw new Error('Erro ao listar templates de certificados: ' + error.message);
  }
}

export async function getCertificateTemplateDetails(id: string) {
  try {
    return await prisma.certificateTemplate.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: 'desc' }
        }
      }
    });
  } catch (error: any) {
    throw new Error('Erro ao buscar detalhes do template: ' + error.message);
  }
}

export async function saveCertificateTemplate(formData: FormData) {
  try {
    const id = formData.get('id') as string | null;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string || '';
    const width = Number(formData.get('width') || 841.89);
    const height = Number(formData.get('height') || 595.28);
    const orientation = formData.get('orientation') as string || 'LANDSCAPE';

    // JSON configurations
    const nameConfig = JSON.parse(formData.get('nameConfig') as string);
    const signature1Active = formData.get('signature1Active') === 'true';
    const signature2Active = formData.get('signature2Active') === 'true';
    const signature1Config = JSON.parse(formData.get('signature1Config') as string || '{}');
    const signature2Config = JSON.parse(formData.get('signature2Config') as string || '{}');

    // Files
    const backgroundFile = formData.get('background') as File | null;
    const signature1File = formData.get('signature1') as File | null;
    const signature2File = formData.get('signature2') as File | null;

    if (!name) {
      return { success: false, error: 'Nome do template é obrigatório.' };
    }

    let templateId = id || crypto.randomUUID();
    let currentVersionNum = 1;
    let oldTemplate = null;
    let oldVersion = null;

    if (id) {
      oldTemplate = await prisma.certificateTemplate.findUnique({
        where: { id },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
      });
      if (!oldTemplate) {
        return { success: false, error: 'Template não encontrado.' };
      }
      oldVersion = oldTemplate.versions[0];
      currentVersionNum = oldVersion ? oldVersion.version + 1 : 1;
    }

    // 1. Process Background Image
    let backgroundKey = oldVersion ? oldVersion.backgroundKey : '';
    if (backgroundFile && backgroundFile.size > 0) {
      const bgBuffer = Buffer.from(await backgroundFile.arrayBuffer());
      const bgValidation = validateBackgroundImage(bgBuffer, backgroundFile.name);
      if (!bgValidation.success) {
        return { success: false, error: bgValidation.error };
      }
      backgroundKey = await saveTemplateAsset(
        templateId,
        'background',
        `v${currentVersionNum}_${backgroundFile.name}`,
        bgBuffer
      );
    } else if (!id) {
      return { success: false, error: 'Imagem de fundo é obrigatória para criar um novo template.' };
    }

    // 2. Process Signature 1
    let signature1Key = oldVersion ? oldVersion.signature1Key : null;
    if (signature1File && signature1File.size > 0) {
      const sig1Buffer = Buffer.from(await signature1File.arrayBuffer());
      const sig1Validation = validateSignatureImage(sig1Buffer, signature1File.name);
      if (!sig1Validation.success) {
        return { success: false, error: sig1Validation.error };
      }
      signature1Key = await saveTemplateAsset(
        templateId,
        'signatures',
        `v${currentVersionNum}_sig1.png`,
        sig1Buffer
      );
    }

    // 3. Process Signature 2
    let signature2Key = oldVersion ? oldVersion.signature2Key : null;
    if (signature2File && signature2File.size > 0) {
      const sig2Buffer = Buffer.from(await signature2File.arrayBuffer());
      const sig2Validation = validateSignatureImage(sig2Buffer, signature2File.name);
      if (!sig2Validation.success) {
        return { success: false, error: sig2Validation.error };
      }
      signature2Key = await saveTemplateAsset(
        templateId,
        'signatures',
        `v${currentVersionNum}_sig2.png`,
        sig2Buffer
      );
    }

    // 4. Build configuration JSON
    const configuration = {
      nameField: nameConfig,
      signature1: signature1Active ? {
        active: true,
        x: signature1Config.x,
        y: signature1Config.y,
        width: signature1Config.width,
        height: signature1Config.height
      } : { active: false },
      signature2: signature2Active ? {
        active: true,
        x: signature2Config.x,
        y: signature2Config.y,
        width: signature2Config.width,
        height: signature2Config.height
      } : { active: false }
    };

    // 5. Database Transactions
    await prisma.$transaction(async (tx) => {
      // Upsert Template
      await tx.certificateTemplate.upsert({
        where: { id: templateId },
        create: {
          id: templateId,
          name,
          description,
          backgroundKey,
          width,
          height,
          orientation,
          active: true
        },
        update: {
          name,
          description,
          backgroundKey,
          width,
          height,
          orientation
        }
      });

      // Create Version snapshot
      await tx.certificateTemplateVersion.create({
        data: {
          templateId,
          version: currentVersionNum,
          configuration: configuration as any,
          backgroundKey,
          signature1Key,
          signature2Key
        }
      });
    });

    return { success: true, templateId };
  } catch (err: any) {
    console.error('Save template error:', err);
    return { success: false, error: 'Erro ao salvar template: ' + err.message };
  }
}

export async function deleteCertificateTemplate(id: string) {
  try {
    const batchesCount = await prisma.certificateBatch.count({
      where: { templateId: id }
    });

    if (batchesCount > 0) {
      // Deactivate instead of deleting if batches reference it
      await prisma.certificateTemplate.update({
        where: { id },
        data: { active: false }
      });
      return { success: true, message: 'Template desativado (arquivado), pois possui lotes vinculados.' };
    }

    // Delete template and its storage directory
    await prisma.certificateTemplate.delete({
      where: { id }
    });
    await deleteTemplateDir(id);

    return { success: true, message: 'Template removido com sucesso.' };
  } catch (err: any) {
    console.error('Delete template error:', err);
    return { success: false, error: 'Erro ao remover template: ' + err.message };
  }
}

// ----------------------------------------------------
// 2. BATCH ACTIONS
// ----------------------------------------------------

export async function getCertificateBatches() {
  try {
    return await prisma.certificateBatch.findMany({
      include: {
        template: true,
        templateVersion: true
      },
      orderBy: { createdAt: 'desc' }
    });
  } catch (error: any) {
    throw new Error('Erro ao listar lotes: ' + error.message);
  }
}

export async function getCertificateBatchDetails(id: string) {
  try {
    return await prisma.certificateBatch.findUnique({
      where: { id },
      include: {
        template: true,
        templateVersion: true,
        certificates: {
          orderBy: { sourceRow: 'asc' }
        }
      }
    });
  } catch (error: any) {
    throw new Error('Erro ao obter detalhes do lote: ' + error.message);
  }
}

export async function createCertificateBatch(formData: FormData) {
  try {
    const name = formData.get('name') as string;
    const templateId = formData.get('templateId') as string;
    const templateVersionId = formData.get('templateVersionId') as string;
    const file = formData.get('file') as File;
    
    const nameColumn = formData.get('nameColumn') as string;
    const emailColumnInput = formData.get('emailColumn') as string || '';
    const idColumnInput = formData.get('idColumn') as string || '';
    const filenamePattern = formData.get('filenamePattern') as string || '{id}-{nome-normalizado}';

    if (!name || !templateId || !templateVersionId || !file) {
      return { success: false, error: 'Campos obrigatórios ausentes.' };
    }

    // Read sheet
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json<any>(sheet);

    if (rawData.length === 0) {
      return { success: false, error: 'A planilha de participantes está vazia.' };
    }

    const firstRowKeys = Object.keys(rawData[0]);
    
    // Suggest columns if not selected
    let nameCol = nameColumn;
    if (!nameCol) {
      const foundName = firstRowKeys.find(k => k.toLowerCase() === 'nome');
      nameCol = foundName || firstRowKeys[0];
    }

    let emailCol = emailColumnInput;
    if (!emailCol) {
      const foundEmail = firstRowKeys.find(k => k.toLowerCase() === 'email' || k.toLowerCase() === 'e-mail');
      emailCol = foundEmail || '';
    }

    let idCol = idColumnInput;
    if (!idCol) {
      const foundId = firstRowKeys.find(k => k.toLowerCase() === 'id' || k.toLowerCase() === 'identificador' || k.toLowerCase() === 'codigo' || k.toLowerCase() === 'código');
      idCol = foundId || '';
    }

    // Create Batch in database
    const batch = await prisma.certificateBatch.create({
      data: {
        name,
        templateId,
        templateVersionId,
        status: 'DRAFT',
        nameColumn: nameCol,
        emailColumn: emailCol || null,
        idColumn: idCol || null,
        filenamePattern,
        totalRows: rawData.length,
        validRows: 0,
        generatedCount: 0,
        failedCount: 0
      }
    });

    // Populate generated certificate placeholders
    const certsToCreate: any[] = [];
    let validRows = 0;

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const participantName = String(row[nameCol] || '').trim();
      const email = emailCol ? String(row[emailCol] || '').trim() : null;
      const externalId = idCol ? String(row[idCol] || '').trim() : null;

      // File name normalization
      let safeName = participantName.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]/g, '-')     // Replace spaces/special with dash
        .replace(/-+/g, '-')            // Collapse multiple dashes
        .replace(/^-|-$/g, '');         // Trim dashes

      if (!safeName) safeName = 'participante';

      let resolvedFilename = filenamePattern
        .replace('{nome-normalizado}', safeName)
        .replace('{nome}', safeName);

      if (idCol && externalId) {
        resolvedFilename = resolvedFilename.replace('{id}', externalId);
      } else {
        // Fallback to row index if pattern requests id but none exists
        resolvedFilename = resolvedFilename.replace('{id}', String(i + 2));
      }
      // Replace fallback for line number
      resolvedFilename = resolvedFilename.replace('{linha}', String(i + 2));

      // Append .pdf extension securely
      resolvedFilename = `${resolvedFilename}.pdf`.replace(/[^a-zA-Z0-9.\-_]/g, '');

      let rowStatus = 'PENDING';
      let errorMessage = null;

      if (!participantName) {
        rowStatus = 'FAILED';
        errorMessage = 'Nome do participante não informado na planilha.';
      } else {
        validRows++;
      }

      certsToCreate.push({
        batchId: batch.id,
        sourceRow: i + 2,
        externalId: externalId || null,
        participantName,
        email: email || null,
        variables: row,
        filename: resolvedFilename,
        status: rowStatus,
        errorMessage
      });
    }

    // Insert certificate entries
    await prisma.generatedCertificate.createMany({
      data: certsToCreate
    });

    // Update valid rows count
    await prisma.certificateBatch.update({
      where: { id: batch.id },
      data: { 
        validRows,
        failedCount: rawData.length - validRows
      }
    });

    return { success: true, batchId: batch.id };
  } catch (err: any) {
    console.error('Create batch error:', err);
    return { success: false, error: 'Erro ao criar lote: ' + err.message };
  }
}

export async function deleteCertificateBatch(id: string) {
  try {
    const batch = await prisma.certificateBatch.findUnique({
      where: { id }
    });
    if (!batch) {
      return { success: false, error: 'Lote não encontrado.' };
    }

    if (batch.status === 'GENERATING') {
      return { success: false, error: 'Não é possível excluir um lote que está sendo gerado atualmente.' };
    }

    // Delete in database cascading to GeneratedCertificate
    await prisma.certificateBatch.delete({
      where: { id }
    });

    // Safely delete batch directories
    await deleteBatchDir(id);

    return { success: true, message: 'Lote excluído com sucesso.' };
  } catch (err: any) {
    console.error('Delete batch error:', err);
    return { success: false, error: 'Erro ao excluir lote: ' + err.message };
  }
}

// ----------------------------------------------------
// 3. PREVIEW & GENERATE TRIGGERS
// ----------------------------------------------------

export async function generateSingleCertificatePreview(formData: FormData) {
  try {
    const templateVersionId = formData.get('templateVersionId') as string;
    const participantName = formData.get('participantName') as string;

    if (!templateVersionId || !participantName) {
      return { success: false, error: 'Parâmetros de visualização incompletos.' };
    }

    const version = await prisma.certificateTemplateVersion.findUnique({
      where: { id: templateVersionId },
      include: { template: true }
    });

    if (!version) {
      return { success: false, error: 'Versão do template não encontrada.' };
    }

    const config = version.configuration as any;

    const renderParams: RenderParams = {
      backgroundKey: version.backgroundKey,
      width: version.template.width,
      height: version.template.height,
      name: participantName,
      nameConfig: config.nameField,
      signature1: config.signature1?.active ? {
        active: true,
        storageKey: version.signature1Key || '',
        x: config.signature1.x,
        y: config.signature1.y,
        width: config.signature1.width,
        height: config.signature1.height
      } : null,
      signature2: config.signature2?.active ? {
        active: true,
        storageKey: version.signature2Key || '',
        x: config.signature2.x,
        y: config.signature2.y,
        width: config.signature2.width,
        height: config.signature2.height
      } : null
    };

    const pdfBuffer = await renderCertificatePdf(renderParams);
    return { success: true, pdfBase64: pdfBuffer.toString('base64') };
  } catch (err: any) {
    console.error('Preview render error:', err);
    return { success: false, error: 'Erro ao gerar visualização do PDF: ' + err.message };
  }
}

export async function startBatchGeneration(batchId: string) {
  try {
    const batch = await prisma.certificateBatch.findUnique({
      where: { id: batchId }
    });
    if (!batch) {
      return { success: false, error: 'Lote não encontrado.' };
    }

    if (batch.status === 'GENERATING') {
      return { success: true, message: 'O lote já está sendo processado.' };
    }

    // Set batch state
    await prisma.certificateBatch.update({
      where: { id: batchId },
      data: { status: 'GENERATING' }
    });

    // Queue BullMQ background generation job
    await mailQueue.add('generate-certificates', { batchId });
    
    // Trigger workers
    triggerDbWorker();

    return { success: true, message: 'Geração do lote iniciada em segundo plano.' };
  } catch (err: any) {
    console.error('Start generation error:', err);
    return { success: false, error: 'Erro ao iniciar geração do lote: ' + err.message };
  }
}

export async function retryFailedBatchCertificates(batchId: string) {
  try {
    // Lock and reset failed to PENDING
    await prisma.generatedCertificate.updateMany({
      where: { batchId, status: 'FAILED' },
      data: { status: 'PENDING', errorMessage: null }
    });

    await prisma.certificateBatch.update({
      where: { id: batchId },
      data: { status: 'GENERATING' }
    });

    await mailQueue.add('generate-certificates', { batchId });
    triggerDbWorker();

    return { success: true, message: 'Retentativa dos itens que falharam iniciada.' };
  } catch (err: any) {
    console.error('Retry batch error:', err);
    return { success: false, error: 'Erro ao iniciar retentativa: ' + err.message };
  }
}

export async function regenerateSingleCertificate(id: string, nameOverride?: string) {
  try {
    const cert = await prisma.generatedCertificate.findUnique({
      where: { id },
      include: { batch: { include: { templateVersion: { include: { template: true } } } } }
    });

    if (!cert) {
      return { success: false, error: 'Certificado não encontrado.' };
    }

    const version = cert.batch.templateVersion;
    const config = version.configuration as any;
    const activeName = nameOverride ? nameOverride.trim() : cert.participantName;

    if (!activeName) {
      return { success: false, error: 'Nome do participante não pode ser vazio.' };
    }

    const renderParams: RenderParams = {
      backgroundKey: version.backgroundKey,
      width: version.template.width,
      height: version.template.height,
      name: activeName,
      nameConfig: config.nameField,
      signature1: config.signature1?.active ? {
        active: true,
        storageKey: version.signature1Key || '',
        x: config.signature1.x,
        y: config.signature1.y,
        width: config.signature1.width,
        height: config.signature1.height
      } : null,
      signature2: config.signature2?.active ? {
        active: true,
        storageKey: version.signature2Key || '',
        x: config.signature2.x,
        y: config.signature2.y,
        width: config.signature2.width,
        height: config.signature2.height
      } : null
    };

    // Render new buffer
    const pdfBuffer = await renderCertificatePdf(renderParams);
    
    // Save to disk
    const storageKey = await saveBatchCertificate(cert.batchId, cert.id, pdfBuffer);

    // Update database
    const updatedCert = await prisma.generatedCertificate.update({
      where: { id },
      data: {
        participantName: activeName,
        storageKey,
        fileSize: pdfBuffer.length,
        sha256: computeSha256(pdfBuffer),
        status: 'GENERATED',
        errorMessage: null,
        generatedAt: new Date()
      }
    });

    // Also update recipient logs if already bound to a pending campaign
    await prisma.recipientLog.updateMany({
      where: { certificateId: id, status: 'PENDING' },
      data: {
        attachmentStorageKey: storageKey,
        attachmentSize: pdfBuffer.length,
        attachmentSha256: computeSha256(pdfBuffer)
      }
    });

    return { success: true, certificate: updatedCert };
  } catch (err: any) {
    console.error('Regenerate single cert error:', err);
    return { success: false, error: 'Erro ao regenerar certificado: ' + err.message };
  }
}

// ----------------------------------------------------
// 4. CAMPAIGN INTEGRATION
// ----------------------------------------------------

export async function createCampaignFromBatch(formData: FormData) {
  try {
    const batchId = formData.get('batchId') as string;
    const name = formData.get('name') as string;
    const templateId = formData.get('templateId') as string;
    const smtpConfigId = formData.get('smtpConfigId') as string;
    
    const sendingMode = (formData.get('sendingMode') as string) || 'IMMEDIATE';
    const minDelay = Number(formData.get('minDelay') || 100);
    const maxDelay = Number(formData.get('maxDelay') || 1000);
    const nextCampaignId = formData.get('nextCampaignId') as string;
    const nextCampaignDelayMinutes = Number(formData.get('nextCampaignDelayMinutes') || 0);
    const isTriggerOnly = formData.get('isTriggerOnly') === 'true';

    if (!batchId || !name || !templateId || !smtpConfigId) {
      return { success: false, error: 'Campos obrigatórios ausentes.' };
    }

    const batch = await prisma.certificateBatch.findUnique({
      where: { id: batchId },
      include: {
        certificates: {
          where: { status: 'GENERATED' }
        }
      }
    });

    if (!batch) {
      return { success: false, error: 'Lote de certificados não encontrado.' };
    }

    // Filter certificates eligible for campaign (has email and successfully generated)
    const eligibleCerts = batch.certificates.filter(c => c.email && c.email.includes('@'));
    const rejectedCerts = batch.certificates.filter(c => !c.email || !c.email.includes('@'));

    if (eligibleCerts.length === 0) {
      return { success: false, error: 'Nenhum certificado elegível para envio (e-mails válidos não encontrados).' };
    }

    // Create Campaign in database
    const campaign = await prisma.campaign.create({
      data: {
        name,
        templateId,
        smtpConfigId,
        status: isTriggerOnly ? 'PENDING' : 'PROCESSING',
        totalEmails: eligibleCerts.length + rejectedCerts.length,
        sendingMode,
        minDelay,
        maxDelay,
        nextCampaignId: nextCampaignId || null,
        nextCampaignDelayMinutes,
        // Attachment configuration mapped directly from the certificate batch files
        attachmentMode: 'INDIVIDUAL',
        attachmentColumn: batch.nameColumn,
        totalAttachments: eligibleCerts.length,
        validRecipientsCount: eligibleCerts.length,
        rejectedRecipientsCount: rejectedCerts.length,
      }
    });

    // Save batch campaign link
    await prisma.certificateBatch.update({
      where: { id: batchId },
      data: { campaignId: campaign.id }
    });

    // Populate RecipientLog inserting references to already generated PDFs
    const logsToInsert: any[] = [];
    
    for (const cert of eligibleCerts) {
      logsToInsert.push({
        campaignId: campaign.id,
        email: cert.email!,
        data: cert.variables as any,
        status: 'PENDING',
        attachmentOriginalName: cert.filename,
        attachmentStorageKey: cert.storageKey,
        attachmentMimeType: cert.mimeType,
        attachmentSize: cert.fileSize,
        attachmentSha256: cert.sha256,
        attachmentStatus: 'VALID',
        certificateId: cert.id
      });
    }

    // Insert failed logs for those without email so they show up on the dashboard
    for (const cert of rejectedCerts) {
      logsToInsert.push({
        campaignId: campaign.id,
        email: cert.email || 'invalido@sem-email.com',
        data: cert.variables as any,
        status: 'FAILED',
        error: 'Erro de importação: E-mail ausente ou inválido no lote.',
        attachmentOriginalName: cert.filename,
        attachmentStatus: 'MISSING',
        attachmentError: 'E-mail ausente',
        certificateId: cert.id
      });
    }

    await prisma.recipientLog.createMany({
      data: logsToInsert
    });

    if (isTriggerOnly) {
      return { success: true, campaignId: campaign.id, message: 'Campanha de envio criada e aguardando gatilho.' };
    }

    // Trigger jobs
    const validLogs = await prisma.recipientLog.findMany({
      where: { campaignId: campaign.id, status: 'PENDING' },
      select: { id: true }
    });

    const jobs = validLogs.map((log) => ({
      name: `mail-${log.id}`,
      data: {
        recipientLogId: log.id,
        campaignId: campaign.id
      }
    }));

    await mailQueue.addBulk(jobs);
    triggerDbWorker();

    return { success: true, campaignId: campaign.id };
  } catch (err: any) {
    console.error('Create campaign from batch error:', err);
    return { success: false, error: 'Erro ao vincular e criar campanha: ' + err.message };
  }
}

// ----------------------------------------------------
// 5. EXPORTS & ZIP STREAM GENERATORS
// ----------------------------------------------------

export async function generateBatchZipExport(batchId: string, filterType: 'all' | 'no-email' = 'all') {
  try {
    const batch = await prisma.certificateBatch.findUnique({
      where: { id: batchId },
      include: {
        certificates: {
          where: { status: 'GENERATED' }
        }
      }
    });

    if (!batch) {
      return { success: false, error: 'Lote não encontrado.' };
    }

    const targetCerts = filterType === 'no-email' 
      ? batch.certificates.filter(c => !c.email || !c.email.includes('@'))
      : batch.certificates;

    if (targetCerts.length === 0) {
      return { success: false, error: 'Nenhum certificado disponível para exportar no filtro selecionado.' };
    }

    const zip = new AdmZip();

    for (const cert of targetCerts) {
      if (cert.storageKey) {
        const absolutePath = resolveSafePath(cert.storageKey);
        if (existsSync(absolutePath)) {
          const pdfBuffer = await fs.readFile(absolutePath);
          zip.addFile(cert.filename, pdfBuffer);
        }
      }
    }

    const zipBuffer = zip.toBuffer();
    return { 
      success: true, 
      zipBase64: zipBuffer.toString('base64'),
      filename: `lote-${batch.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${filterType}.zip`
    };
  } catch (err: any) {
    console.error('ZIP export error:', err);
    return { success: false, error: 'Erro ao compactar certificados em ZIP: ' + err.message };
  }
}

export async function getSingleCertificateFile(id: string) {
  try {
    const cert = await prisma.generatedCertificate.findUnique({
      where: { id }
    });
    if (!cert || !cert.storageKey) {
      return { success: false, error: 'Certificado não encontrado ou não gerado.' };
    }

    const absolutePath = resolveSafePath(cert.storageKey);
    if (!existsSync(absolutePath)) {
      return { success: false, error: 'Arquivo PDF não encontrado no disco.' };
    }

    const pdfBuffer = await fs.readFile(absolutePath);
    return { 
      success: true, 
      pdfBase64: pdfBuffer.toString('base64'),
      filename: cert.filename
    };
  } catch (err: any) {
    console.error('Get file error:', err);
    return { success: false, error: 'Erro ao carregar arquivo: ' + err.message };
  }
}

export async function generateBatchCsvReport(batchId: string) {
  try {
    const batch = await prisma.certificateBatch.findUnique({
      where: { id: batchId },
      include: {
        certificates: {
          orderBy: { sourceRow: 'asc' }
        }
      }
    });

    if (!batch) {
      return { success: false, error: 'Lote não encontrado.' };
    }

    // CSV header
    let csvContent = 'Linha;ID;Nome;Email;NomeArquivo;StatusGeracao;SHA256;TamanhoBytes;Erro\n';

    for (const cert of batch.certificates) {
      const line = cert.sourceRow;
      const extId = cert.externalId || '';
      const name = cert.participantName.replace(/;/g, ',');
      const email = cert.email || '';
      const filename = cert.filename;
      const status = cert.status;
      const hash = cert.sha256 || '';
      const size = cert.fileSize || 0;
      const err = cert.errorMessage ? cert.errorMessage.replace(/[\n\r;]/g, ' ') : '';

      csvContent += `${line};${extId};${name};${email};${filename};${status};${hash};${size};${err}\n`;
    }

    // Convert CSV string to UTF-8 buffer with BOM (for Excel compatibility in PT-BR)
    const csvBuffer = Buffer.concat([
      Buffer.from([0xEF, 0xBB, 0xBF]), // BOM
      Buffer.from(csvContent, 'utf-8')
    ]);

    return { 
      success: true, 
      csvBase64: csvBuffer.toString('base64'),
      filename: `relatorio-lote-${batchId}.csv` 
    };
  } catch (err: any) {
    console.error('CSV report error:', err);
    return { success: false, error: 'Erro ao gerar relatório CSV: ' + err.message };
  }
}
