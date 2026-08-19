import fs from 'fs/promises';
import path from 'path';
import { renderCertificatePdf, RenderParams } from '../src/lib/pdfRenderer';

// A valid 1x1 pixel transparent PNG buffer for mock assets
const MOCK_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
  0x0d, 0x0a, 0x2d, 0xb4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82
]);

const STORAGE_ROOT = path.join(process.cwd(), 'storage');

async function setupMockFiles() {
  await fs.mkdir(path.join(STORAGE_ROOT, 'test-template'), { recursive: true });
  await fs.writeFile(path.join(STORAGE_ROOT, 'test-template', 'bg.png'), MOCK_PNG);
  await fs.writeFile(path.join(STORAGE_ROOT, 'test-template', 'sig1.png'), MOCK_PNG);
  await fs.writeFile(path.join(STORAGE_ROOT, 'test-template', 'sig2.png'), MOCK_PNG);
}

async function cleanMockFiles() {
  try {
    await fs.rm(path.join(STORAGE_ROOT, 'test-template'), { recursive: true, force: true });
    await fs.unlink(path.join(process.cwd(), 'test-output-simple.pdf')).catch(() => {});
    await fs.unlink(path.join(process.cwd(), 'test-output-signatures.pdf')).catch(() => {});
    await fs.unlink(path.join(process.cwd(), 'test-output-longname.pdf')).catch(() => {});
  } catch (e) {}
}

async function runTests() {
  console.log('🧪 Iniciando testes unitários do PDF Renderer...');
  await setupMockFiles();

  try {
    // Test 1: Simple template (Background + Name only, Montserrat-Regular)
    const params1: RenderParams = {
      backgroundKey: 'storage/test-template/bg.png',
      width: 841.89,
      height: 595.28,
      name: 'João da Silva Sauro',
      nameConfig: {
        x: 0.5,
        y: 0.5,
        maxWidth: 0.8,
        fontFamily: 'Montserrat-Regular',
        fontSize: 36,
        color: '#ff0000',
        alignment: 'center',
        minFontSize: 16
      }
    };

    const pdfBuffer1 = await renderCertificatePdf(params1);
    const magic1 = pdfBuffer1.subarray(0, 5).toString('utf-8');
    if (magic1 !== '%PDF-') throw new Error('Falha no Teste 1: Arquivo gerado não possui bytes mágicos de PDF.');
    await fs.writeFile(path.join(process.cwd(), 'test-output-simple.pdf'), pdfBuffer1);
    console.log('✅ Teste 1 concluído: PDF simples gerado com sucesso.');

    // Test 2: Double signatures templates (Roboto-Medium + signatures)
    const params2: RenderParams = {
      backgroundKey: 'storage/test-template/bg.png',
      width: 841.89,
      height: 595.28,
      name: 'Dr. Douglas Costa',
      nameConfig: {
        x: 0.5,
        y: 0.45,
        maxWidth: 0.7,
        fontFamily: 'Roboto-Medium',
        fontSize: 40,
        color: '#000000',
        alignment: 'center',
        minFontSize: 20
      },
      signature1: {
        active: true,
        storageKey: 'storage/test-template/sig1.png',
        x: 0.2,
        y: 0.8,
        width: 0.15,
        height: 0.08
      },
      signature2: {
        active: true,
        storageKey: 'storage/test-template/sig2.png',
        x: 0.8,
        y: 0.8,
        width: 0.15,
        height: 0.08
      }
    };

    const pdfBuffer2 = await renderCertificatePdf(params2);
    const magic2 = pdfBuffer2.subarray(0, 5).toString('utf-8');
    if (magic2 !== '%PDF-') throw new Error('Falha no Teste 2: Arquivo gerado não possui bytes mágicos de PDF.');
    await fs.writeFile(path.join(process.cwd(), 'test-output-signatures.pdf'), pdfBuffer2);
    console.log('✅ Teste 2 concluído: PDF com duas assinaturas gerado com sucesso.');

    // Test 3: Long name with autoscaling (AlexBrush-Regular + text width overflow)
    const params3: RenderParams = {
      backgroundKey: 'storage/test-template/bg.png',
      width: 841.89,
      height: 595.28,
      name: 'Maria Eduarda Albuquerque de Oliveira Santos e Silva da Dinamarca',
      nameConfig: {
        x: 0.5,
        y: 0.5,
        maxWidth: 0.5, // Restricted width to force autoscaling
        fontFamily: 'AlexBrush-Regular',
        fontSize: 48,
        color: '#0000ff',
        alignment: 'center',
        minFontSize: 12
      }
    };

    const pdfBuffer3 = await renderCertificatePdf(params3);
    const magic3 = pdfBuffer3.subarray(0, 5).toString('utf-8');
    if (magic3 !== '%PDF-') throw new Error('Falha no Teste 3: Arquivo gerado não possui bytes mágicos de PDF.');
    await fs.writeFile(path.join(process.cwd(), 'test-output-longname.pdf'), pdfBuffer3);
    console.log('✅ Teste 3 concluído: PDF com nome longo e autoscaling gerado com sucesso.');

    console.log('🎉 Todos os testes unitários do PDF Renderer passaram com sucesso!');
  } catch (err: any) {
    console.error('❌ Falha nos testes unitários:', err.message);
  } finally {
    await cleanMockFiles();
  }
}

runTests();
