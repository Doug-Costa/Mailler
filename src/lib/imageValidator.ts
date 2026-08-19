import path from 'path';

export const MAX_BACKGROUND_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_SIGNATURE_SIZE = 2 * 1024 * 1024;   // 2MB

export interface ImageValidationResult {
  success: boolean;
  error?: string;
}

/**
 * Validates the background image format, size, and magic bytes signature.
 * PNG and JPG/JPEG are supported. SVG is explicitly blocked for security.
 */
export function validateBackgroundImage(buffer: Buffer, filename: string): ImageValidationResult {
  const ext = path.extname(filename).toLowerCase();
  
  if (buffer.length > MAX_BACKGROUND_SIZE) {
    return {
      success: false,
      error: `A imagem de fundo excede o limite máximo permitido de ${(MAX_BACKGROUND_SIZE / (1024 * 1024))}MB.`,
    };
  }

  if (buffer.length === 0) {
    return {
      success: false,
      error: 'A imagem de fundo está vazia (0 bytes).',
    };
  }

  // Enforce extension
  if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') {
    return {
      success: false,
      error: 'Apenas imagens no formato PNG, JPG ou JPEG são aceitas como fundo do certificado.',
    };
  }

  // Magic bytes check
  const isPng = buffer.length >= 8 && 
    buffer[0] === 0x89 && 
    buffer[1] === 0x50 && 
    buffer[2] === 0x4E && 
    buffer[3] === 0x47 && 
    buffer[4] === 0x0D && 
    buffer[5] === 0x0A && 
    buffer[6] === 0x1A && 
    buffer[7] === 0x0A;

  const isJpg = buffer.length >= 3 && 
    buffer[0] === 0xFF && 
    buffer[1] === 0xD8 && 
    buffer[2] === 0xFF;

  if (ext === '.png' && !isPng) {
    return {
      success: false,
      error: 'Assinatura PNG inválida. O arquivo não é um PNG real.',
    };
  }

  if ((ext === '.jpg' || ext === '.jpeg') && !isJpg) {
    return {
      success: false,
      error: 'Assinatura JPG/JPEG inválida. O arquivo não é um JPG/JPEG real.',
    };
  }

  return { success: true };
}

/**
 * Validates the signature image format, size, and magic bytes signature.
 * Only PNG is allowed for signatures to preserve transparency.
 */
export function validateSignatureImage(buffer: Buffer, filename: string): ImageValidationResult {
  const ext = path.extname(filename).toLowerCase();

  if (buffer.length > MAX_SIGNATURE_SIZE) {
    return {
      success: false,
      error: `A assinatura excede o limite máximo de ${(MAX_SIGNATURE_SIZE / (1024 * 1024))}MB.`,
    };
  }

  if (buffer.length === 0) {
    return {
      success: false,
      error: 'O arquivo de assinatura está vazio (0 bytes).',
    };
  }

  if (ext !== '.png') {
    return {
      success: false,
      error: 'Apenas assinaturas no formato PNG (com fundo transparente) são aceitas.',
    };
  }

  // Verify PNG magic bytes
  const isPng = buffer.length >= 8 && 
    buffer[0] === 0x89 && 
    buffer[1] === 0x50 && 
    buffer[2] === 0x4E && 
    buffer[3] === 0x47 && 
    buffer[4] === 0x0D && 
    buffer[5] === 0x0A && 
    buffer[6] === 0x1A && 
    buffer[7] === 0x0A;

  if (!isPng) {
    return {
      success: false,
      error: 'Assinatura PNG inválida. O arquivo de assinatura não é um PNG real.',
    };
  }

  return { success: true };
}
