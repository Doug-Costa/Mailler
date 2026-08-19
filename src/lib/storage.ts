import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Define the root storage directory relative to the project root
const STORAGE_ROOT = path.join(process.cwd(), 'storage');

/**
 * Gets the absolute path of the attachments directory for a campaign.
 */
export function getCampaignStorageDir(campaignId: string): string {
  // Validate campaignId to prevent path traversal
  if (
    campaignId.includes('..') ||
    campaignId.includes('/') ||
    campaignId.includes('\\') ||
    path.isAbsolute(campaignId)
  ) {
    throw new Error('Tentativa de acesso fora do diretório autorizado.');
  }
  const safeCampaignId = path.basename(campaignId);
  return path.join(STORAGE_ROOT, 'campaigns', safeCampaignId, 'attachments');
}

/**
 * Gets the relative storage key for an attachment.
 */
export function getAttachmentStorageKey(campaignId: string, filename: string): string {
  const safeCampaignId = path.basename(campaignId);
  const safeFilename = path.basename(filename);
  return path.join('storage', 'campaigns', safeCampaignId, 'attachments', safeFilename).replace(/\\/g, '/');
}

/**
 * Resolves a storage key to an absolute path, verifying it is within the storage root.
 */
export function resolveSafePath(storageKey: string): string {
  const absolutePath = path.resolve(process.cwd(), storageKey);
  if (!absolutePath.startsWith(STORAGE_ROOT)) {
    throw new Error('Acesso a diretório não autorizado.');
  }
  return absolutePath;
}

/**
 * Saves a buffer as an attachment for a campaign.
 */
export async function saveAttachment(
  campaignId: string,
  recipientId: string,
  buffer: Buffer
): Promise<string> {
  const targetDir = getCampaignStorageDir(campaignId);
  await fs.mkdir(targetDir, { recursive: true });

  const filename = `${recipientId}.pdf`;
  const absolutePath = path.join(targetDir, filename);

  // Extra check to ensure it stays in targetDir
  if (!absolutePath.startsWith(STORAGE_ROOT)) {
    throw new Error('Acesso a diretório não autorizado.');
  }

  await fs.writeFile(absolutePath, buffer);
  
  return getAttachmentStorageKey(campaignId, filename);
}

/**
 * Safely deletes all attachments of a campaign and its directory.
 */
export async function deleteCampaignDir(campaignId: string): Promise<void> {
  const targetDir = getCampaignStorageDir(campaignId);
  
  // Verify target directory is safely inside STORAGE_ROOT
  if (!targetDir.startsWith(STORAGE_ROOT) || targetDir === STORAGE_ROOT) {
    throw new Error('Tentativa de exclusão fora do diretório autorizado.');
  }

  if (existsSync(targetDir)) {
    await fs.rm(targetDir, { recursive: true, force: true });
    
    // Also try to clean up parent campaign folder if empty
    const parentDir = path.dirname(targetDir);
    try {
      const files = await fs.readdir(parentDir);
      if (files.length === 0) {
        await fs.rmdir(parentDir);
      }
    } catch {
      // Ignore errors when cleaning up parent
    }
  }
}

/**
 * Gets the absolute path of the directory for certificate template assets.
 */
export function getTemplateStorageDir(templateId: string, type: 'background' | 'signatures'): string {
  if (
    templateId.includes('..') ||
    templateId.includes('/') ||
    templateId.includes('\\') ||
    path.isAbsolute(templateId)
  ) {
    throw new Error('Tentativa de acesso fora do diretório autorizado.');
  }
  const safeTemplateId = path.basename(templateId);
  return path.join(STORAGE_ROOT, 'certificate-templates', safeTemplateId, type);
}

/**
 * Gets the absolute path of the directory for certificate batch generated PDFs.
 */
export function getBatchStorageDir(batchId: string, type: 'certificates' | 'exports'): string {
  if (
    batchId.includes('..') ||
    batchId.includes('/') ||
    batchId.includes('\\') ||
    path.isAbsolute(batchId)
  ) {
    throw new Error('Tentativa de acesso fora do diretório autorizado.');
  }
  const safeBatchId = path.basename(batchId);
  return path.join(STORAGE_ROOT, 'certificate-batches', safeBatchId, type);
}

/**
 * Gets the relative storage key for a template asset.
 */
export function getTemplateAssetKey(templateId: string, type: 'background' | 'signatures', filename: string): string {
  const safeTemplateId = path.basename(templateId);
  const safeFilename = path.basename(filename);
  return path.join('storage', 'certificate-templates', safeTemplateId, type, safeFilename).replace(/\\/g, '/');
}

/**
 * Gets the relative storage key for a batch certificate.
 */
export function getBatchCertificateKey(batchId: string, filename: string): string {
  const safeBatchId = path.basename(batchId);
  const safeFilename = path.basename(filename);
  return path.join('storage', 'certificate-batches', safeBatchId, 'certificates', safeFilename).replace(/\\/g, '/');
}

/**
 * Saves a template background or signature file to disk.
 */
export async function saveTemplateAsset(
  templateId: string,
  type: 'background' | 'signatures',
  filename: string,
  buffer: Buffer
): Promise<string> {
  const targetDir = getTemplateStorageDir(templateId, type);
  await fs.mkdir(targetDir, { recursive: true });

  const safeFilename = path.basename(filename);
  const absolutePath = path.join(targetDir, safeFilename);

  if (!absolutePath.startsWith(STORAGE_ROOT)) {
    throw new Error('Acesso a diretório não autorizado.');
  }

  await fs.writeFile(absolutePath, buffer);
  return getTemplateAssetKey(templateId, type, safeFilename);
}

/**
 * Saves a generated certificate PDF to disk.
 */
export async function saveBatchCertificate(
  batchId: string,
  certificateId: string,
  buffer: Buffer
): Promise<string> {
  const targetDir = getBatchStorageDir(batchId, 'certificates');
  await fs.mkdir(targetDir, { recursive: true });

  const filename = `${certificateId}.pdf`;
  const absolutePath = path.join(targetDir, filename);

  if (!absolutePath.startsWith(STORAGE_ROOT)) {
    throw new Error('Acesso a diretório não autorizado.');
  }

  await fs.writeFile(absolutePath, buffer);
  return getBatchCertificateKey(batchId, filename);
}

/**
 * Safely deletes a template assets directory.
 */
export async function deleteTemplateDir(templateId: string): Promise<void> {
  const bgDir = getTemplateStorageDir(templateId, 'background');
  const sigDir = getTemplateStorageDir(templateId, 'signatures');

  if (!bgDir.startsWith(STORAGE_ROOT) || bgDir === STORAGE_ROOT || !sigDir.startsWith(STORAGE_ROOT) || sigDir === STORAGE_ROOT) {
    throw new Error('Tentativa de exclusão fora do diretório autorizado.');
  }

  if (existsSync(bgDir)) {
    await fs.rm(bgDir, { recursive: true, force: true });
  }
  if (existsSync(sigDir)) {
    await fs.rm(sigDir, { recursive: true, force: true });
  }

  const parentDir = path.dirname(bgDir); // template directory
  if (existsSync(parentDir)) {
    await fs.rm(parentDir, { recursive: true, force: true });
  }
}

/**
 * Safely deletes a batch directory (PDFs and exports).
 */
export async function deleteBatchDir(batchId: string): Promise<void> {
  const certDir = getBatchStorageDir(batchId, 'certificates');
  const expDir = getBatchStorageDir(batchId, 'exports');

  if (!certDir.startsWith(STORAGE_ROOT) || certDir === STORAGE_ROOT || !expDir.startsWith(STORAGE_ROOT) || expDir === STORAGE_ROOT) {
    throw new Error('Tentativa de exclusão fora do diretório autorizado.');
  }

  if (existsSync(certDir)) {
    await fs.rm(certDir, { recursive: true, force: true });
  }
  if (existsSync(expDir)) {
    await fs.rm(expDir, { recursive: true, force: true });
  }

  const parentDir = path.dirname(certDir); // batch directory
  if (existsSync(parentDir)) {
    await fs.rm(parentDir, { recursive: true, force: true });
  }
}
