import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { resolveSafePath } from './storage';

// Available fonts list mapped to files in /public/fonts/
const FONT_FILES: Record<string, string> = {
  'Roboto-Regular': 'Roboto-Regular.ttf',
  'Roboto-Medium': 'Roboto-Medium.ttf',
  'Montserrat-Regular': 'Montserrat-Regular.ttf',
  'Montserrat-Bold': 'Montserrat-Bold.ttf',
  'AlexBrush-Regular': 'AlexBrush-Regular.ttf'
};

export interface RenderParams {
  backgroundKey: string;
  width: number;
  height: number;
  name: string;
  nameConfig: {
    x: number;          // Normalized [0, 1]
    y: number;          // Normalized [0, 1]
    maxWidth: number;   // Normalized [0, 1]
    fontFamily: string;
    fontSize: number;
    color: string;      // Hex format, e.g. "#000000"
    alignment: 'left' | 'center' | 'right';
    transformation?: 'uppercase' | 'none';
    minFontSize: number;
  };
  signature1?: {
    active: boolean;
    storageKey: string;
    x: number;          // Normalized [0, 1]
    y: number;          // Normalized [0, 1]
    width: number;      // Normalized [0, 1]
    height: number;     // Normalized [0, 1]
  } | null;
  signature2?: {
    active: boolean;
    storageKey: string;
    x: number;          // Normalized [0, 1]
    y: number;          // Normalized [0, 1]
    width: number;      // Normalized [0, 1]
    height: number;     // Normalized [0, 1]
  } | null;
}

// Convert Hex color to RGB object
function hexToRgb(hex: string) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
}

/**
 * Main engine function to generate a certificate PDF on the backend.
 */
export async function renderCertificatePdf(params: RenderParams): Promise<Buffer> {
  const { backgroundKey, width, height, name, nameConfig, signature1, signature2 } = params;

  // 1. Create document and register fontkit
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // 2. Set dimensions (A4 defaults to 841.89 x 595.28 points in landscape)
  const page = pdfDoc.addPage([width, height]);

  // 3. Load background image (supports jpg and png)
  const bgPath = resolveSafePath(backgroundKey);
  if (!existsSync(bgPath)) {
    throw new Error(`Imagem de fundo não encontrada no storage: ${backgroundKey}`);
  }
  const bgBuffer = await fs.readFile(bgPath);
  const isPngBg = backgroundKey.toLowerCase().endsWith('.png');
  
  let bgImage;
  if (isPngBg) {
    bgImage = await pdfDoc.embedPng(bgBuffer);
  } else {
    bgImage = await pdfDoc.embedJpg(bgBuffer);
  }

  // Draw background filling the entire page
  page.drawImage(bgImage, {
    x: 0,
    y: 0,
    width,
    height,
  });

  // 4. Load and embed font
  const fontName = FONT_FILES[nameConfig.fontFamily] ? nameConfig.fontFamily : 'Roboto-Regular';
  const fontFilename = FONT_FILES[fontName];
  const fontPath = path.join(process.cwd(), 'public', 'fonts', fontFilename);

  if (!existsSync(fontPath)) {
    throw new Error(`Arquivo de fonte não encontrado: ${fontFilename}`);
  }
  const fontBuffer = await fs.readFile(fontPath);
  const customFont = await pdfDoc.embedFont(fontBuffer);

  // Apply transformations
  let renderedName = name;
  if (nameConfig.transformation === 'uppercase') {
    renderedName = name.toUpperCase();
  }

  // Calculate autoscaling
  let currentFontSize = nameConfig.fontSize;
  const maxAllowedWidth = nameConfig.maxWidth * width;
  let textWidth = customFont.widthOfTextAtSize(renderedName, currentFontSize);

  while (textWidth > maxAllowedWidth && currentFontSize > nameConfig.minFontSize) {
    currentFontSize -= 1;
    textWidth = customFont.widthOfTextAtSize(renderedName, currentFontSize);
  }

  // Resolve Name Coordinates (X and Y normalized)
  // X: normalized fraction [0, 1] relative to width
  // Y: normalized fraction [0, 1] relative to height, where 0 is top
  let nameX = nameConfig.x * width;
  const nameY = (1 - nameConfig.y) * height - (currentFontSize / 3); // Adjust offset slightly up based on baseline

  if (nameConfig.alignment === 'center') {
    nameX = nameX - (textWidth / 2);
  } else if (nameConfig.alignment === 'right') {
    nameX = nameX - textWidth;
  }

  // Draw Name
  page.drawText(renderedName, {
    x: nameX,
    y: nameY,
    size: currentFontSize,
    font: customFont,
    color: hexToRgb(nameConfig.color || '#000000'),
  });

  // 5. Draw Signature 1 if active
  if (signature1 && signature1.active && signature1.storageKey) {
    const sigPath = resolveSafePath(signature1.storageKey);
    if (existsSync(sigPath)) {
      const sigBuffer = await fs.readFile(sigPath);
      const sigImage = await pdfDoc.embedPng(sigBuffer);

      const sigWidth = signature1.width * width;
      const sigHeight = signature1.height * height;
      const sigX = signature1.x * width;
      // HTML origin is top-left, PDF origin is bottom-left
      const sigY = (1 - signature1.y) * height - sigHeight;

      page.drawImage(sigImage, {
        x: sigX,
        y: sigY,
        width: sigWidth,
        height: sigHeight,
      });
    }
  }

  // 6. Draw Signature 2 if active
  if (signature2 && signature2.active && signature2.storageKey) {
    const sigPath = resolveSafePath(signature2.storageKey);
    if (existsSync(sigPath)) {
      const sigBuffer = await fs.readFile(sigPath);
      const sigImage = await pdfDoc.embedPng(sigBuffer);

      const sigWidth = signature2.width * width;
      const sigHeight = signature2.height * height;
      const sigX = signature2.x * width;
      const sigY = (1 - signature2.y) * height - sigHeight;

      page.drawImage(sigImage, {
        x: sigX,
        y: sigY,
        width: sigWidth,
        height: sigHeight,
      });
    }
  }

  // 7. Save document to buffer
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
