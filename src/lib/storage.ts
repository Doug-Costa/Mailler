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
