import AdmZip from 'adm-zip';
import path from 'path';

// Configurable constants for security limits
export const MAX_ZIP_SIZE = 100 * 1024 * 1024;        // 100MB
export const MAX_PDF_SIZE = 10 * 1024 * 1024;        // 10MB
export const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_FILES_COUNT = 1000;

export interface ZipEntryInfo {
  originalName: string;
  normalizedName: string;
  size: number;
  isValidPdf: boolean;
  error?: string;
  buffer: Buffer;
}

export interface ZipValidationResult {
  success: boolean;
  error?: string;
  files: ZipEntryInfo[];
}

/**
 * Validates a ZIP file buffer, checks security bounds, and verifies that the files are valid PDFs.
 */
export function validateZipBuffer(zipBuffer: Buffer): ZipValidationResult {
  try {
    // 1. Check ZIP file size
    if (zipBuffer.length > MAX_ZIP_SIZE) {
      return {
        success: false,
        error: `O arquivo ZIP enviado excede o limite máximo permitido de ${(MAX_ZIP_SIZE / (1024 * 1024)).toFixed(0)}MB.`,
        files: [],
      };
    }

    // 2. Parse the ZIP file
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch (e: any) {
      return {
        success: false,
        error: 'O arquivo ZIP está corrompido ou é inválido.',
        files: [],
      };
    }

    const entries = zip.getEntries();

    // 3. Check files count limit
    if (entries.length > MAX_FILES_COUNT) {
      return {
        success: false,
        error: `O arquivo ZIP contém muitos arquivos. Limite máximo de ${MAX_FILES_COUNT} arquivos.`,
        files: [],
      };
    }

    // 4. Check total uncompressed size limit
    let totalDecompressedSize = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      totalDecompressedSize += entry.header.size;
    }

    if (totalDecompressedSize > MAX_UNCOMPRESSED_SIZE) {
      return {
        success: false,
        error: `O tamanho descompactado do ZIP excede o limite máximo de ${(MAX_UNCOMPRESSED_SIZE / (1024 * 1024)).toFixed(0)}MB.`,
        files: [],
      };
    }

    const files: ZipEntryInfo[] = [];
    const seenNormalizedNames = new Set<string>();
    const duplicateNormalizedNames = new Set<string>();

    // 5. Process entries
    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const rawName = entry.entryName;

      // Zip Slip / Path Traversal Protection
      // Reject if name contains absolute or relative path attempts
      if (
        rawName.includes('..') ||
        rawName.startsWith('/') ||
        rawName.startsWith('\\') ||
        path.isAbsolute(rawName)
      ) {
        return {
          success: false,
          error: `Falha de segurança detectada: nome de arquivo suspeito no ZIP (${rawName}).`,
          files: [],
        };
      }

      // Extract the basename (safe file name, ignoring folder structures if any)
      const baseName = path.basename(rawName).trim();
      if (!baseName) continue; // Skip if no filename

      // Normalize name for comparison (trim, check extension case-insensitively)
      const ext = path.extname(baseName).toLowerCase();
      const normalizedName = baseName.toLowerCase();

      // Check if duplicate entry exists in ZIP
      if (seenNormalizedNames.has(normalizedName)) {
        duplicateNormalizedNames.add(normalizedName);
      }
      seenNormalizedNames.add(normalizedName);

      // Decompress buffer safely
      let buffer: Buffer;
      try {
        buffer = entry.getData();
      } catch (err: any) {
        return {
          success: false,
          error: `Erro ao descompactar arquivo: ${baseName}. O ZIP pode estar corrompido.`,
          files: [],
        };
      }

      // Size check for individual PDF
      if (buffer.length > MAX_PDF_SIZE) {
        files.push({
          originalName: baseName,
          normalizedName,
          size: buffer.length,
          isValidPdf: false,
          error: `Arquivo excede o limite de ${(MAX_PDF_SIZE / (1024 * 1024)).toFixed(0)}MB.`,
          buffer,
        });
        continue;
      }

      // Empty file check
      if (buffer.length === 0) {
        files.push({
          originalName: baseName,
          normalizedName,
          size: 0,
          isValidPdf: false,
          error: 'O arquivo PDF está vazio (0 bytes).',
          buffer,
        });
        continue;
      }

      // File extension validation
      if (ext !== '.pdf') {
        files.push({
          originalName: baseName,
          normalizedName,
          size: buffer.length,
          isValidPdf: false,
          error: 'Apenas arquivos PDF são aceitos.',
          buffer,
        });
        continue;
      }

      // Magic Bytes signature verification (%PDF- is 25 50 44 46 2d in hex)
      const magic = buffer.subarray(0, 5).toString('utf-8');
      if (magic !== '%PDF-') {
        files.push({
          originalName: baseName,
          normalizedName,
          size: buffer.length,
          isValidPdf: false,
          error: 'Assinatura PDF inválida. O arquivo não é um PDF válido.',
          buffer,
        });
        continue;
      }

      // If valid
      files.push({
        originalName: baseName,
        normalizedName,
        size: buffer.length,
        isValidPdf: true,
        buffer,
      });
    }

    // Flag duplicates or ambiguities
    if (duplicateNormalizedNames.size > 0) {
      const duplicatesList = Array.from(duplicateNormalizedNames).join(', ');
      return {
        success: false,
        error: `O arquivo ZIP possui nomes de arquivos duplicados ou ambíguos: [${duplicatesList}].`,
        files: [],
      };
    }

    return {
      success: true,
      files,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Erro ao validar o ZIP: ${err.message || 'Erro desconhecido'}`,
      files: [],
    };
  }
}
