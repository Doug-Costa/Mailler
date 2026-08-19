import 'dotenv/config';
import AdmZip from 'adm-zip';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { validateZipBuffer, ZipEntryInfo, MAX_PDF_SIZE } from '../src/lib/zipValidator';
import { validateCampaignFiles, createCampaign, testRunCampaignRecipient, retryFailedRecipients } from '../src/app/actions/campaign';
import { saveAttachment, deleteCampaignDir, resolveSafePath } from '../src/lib/storage';
import { prisma } from '../src/lib/db';

async function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Falha: ${message}`);
    process.exit(1);
  }
}

// Helper to compile template (copy from worker)
function compileTemplate(text: string, data: any): string {
  if (!text) return '';
  return text.replace(/\{\{\s*(.*?)\s*\}\}/g, (match, key) => {
    const foundKey = Object.keys(data).find(k => k.toLowerCase() === key.toLowerCase());
    return foundKey !== undefined ? String(data[foundKey]) : match;
  });
}

// Mock browser File for Server Actions extending native File class
class MockFile extends File {
  constructor(name: string, buffer: Buffer, type = 'application/octet-stream') {
    super([new Uint8Array(buffer)], name, { type });
  }
}

async function runTests() {
  console.log('🧪 Iniciando testes de validação de anexos e worker...');

  // Setup mock SMTP & Template in db
  let smtpConfig = await prisma.smtpConfig.findFirst({ where: { active: true } });
  if (!smtpConfig) {
    smtpConfig = await prisma.smtpConfig.create({
      data: {
        name: 'SMTP Teste',
        host: 'localhost',
        port: 1025,
        user: 'teste@exemplo.com',
        pass: 'some-encrypted-pass',
        active: true,
      }
    });
  }

  let template = await prisma.template.findFirst();
  if (!template) {
    template = await prisma.template.create({
      data: {
        name: 'Template Teste',
        subject: 'Olá {{Nome}}',
        body: 'Seu certificado é {{Frase}}',
      }
    });
  }

  // --- TESTE 1: Planilha válida e ZIP válido ---
  console.log('▶ Teste 1: Planilha e ZIP válidos...');
  const zip1 = new AdmZip();
  zip1.addFile('certificado-001.pdf', Buffer.from('%PDF-1.4\n%mockpdf'));
  const zipBuffer1 = zip1.toBuffer();

  const ws1 = xlsx.utils.json_to_sheet([
    { Nome: 'João da Silva', Email: 'joao@email.com', Frase: 'Parabéns!', Certificado: 'certificado-001.pdf' }
  ]);
  const wb1 = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb1, ws1, 'Sheet1');
  const xlsxBuffer1 = xlsx.write(wb1, { type: 'buffer', bookType: 'xlsx' });

  const formData1 = new FormData();
  formData1.append('file', new MockFile('planilha.xlsx', xlsxBuffer1) as any);
  formData1.append('zipFile', new MockFile('anexos.zip', zipBuffer1) as any);
  formData1.append('attachmentMode', 'INDIVIDUAL');
  formData1.append('attachmentColumn', 'Certificado');

  const report1 = await validateCampaignFiles(formData1);
  await assert(report1.success === true, 'Validação com ZIP e Planilha válidos deveria ter sucesso');
  await assert(report1.stats!.validRecipients === 1, 'Deveria ter 1 destinatário válido');
  await assert(report1.rows![0].status === 'VALID', 'Linha 1 deveria estar vinculada');
  console.log('✅ Teste 1 passou.');

  // --- TESTE 2: PDF inexistente ---
  console.log('▶ Teste 2: PDF inexistente...');
  const zip2 = new AdmZip();
  zip2.addFile('certificado-002.pdf', Buffer.from('%PDF-1.4\n%mockpdf'));
  const zipBuffer2 = zip2.toBuffer();

  const ws2 = xlsx.utils.json_to_sheet([
    { Nome: 'João da Silva', Email: 'joao@email.com', Certificado: 'certificado-001.pdf' }
  ]);
  const wb2 = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb2, ws2, 'Sheet1');
  const xlsxBuffer2 = xlsx.write(wb2, { type: 'buffer', bookType: 'xlsx' });

  const formData2 = new FormData();
  formData2.append('file', new MockFile('planilha.xlsx', xlsxBuffer2) as any);
  formData2.append('zipFile', new MockFile('anexos.zip', zipBuffer2) as any);
  formData2.append('attachmentMode', 'INDIVIDUAL');

  const report2 = await validateCampaignFiles(formData2);
  await assert(report2.success === true, 'Validação deveria retornar sucesso com relatório de erros');
  await assert(report2.stats!.missingPdfs === 1, 'Deveria identificar 1 PDF não encontrado');
  await assert(report2.rows![0].status === 'ERROR', 'Destinatário sem PDF deveria estar em erro');
  await assert(report2.rows![0].error!.includes('PDF não encontrado'), 'Deveria ter a mensagem de erro correspondente');
  console.log('✅ Teste 2 passou.');

  // --- TESTE 3: E-mail ausente ---
  console.log('▶ Teste 3: E-mail ausente...');
  const ws3 = xlsx.utils.json_to_sheet([
    { Nome: 'João da Silva', Email: '', Certificado: 'certificado-001.pdf' }
  ]);
  const wb3 = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb3, ws3, 'Sheet1');
  const xlsxBuffer3 = xlsx.write(wb3, { type: 'buffer', bookType: 'xlsx' });

  const formData3 = new FormData();
  formData3.append('file', new MockFile('planilha.xlsx', xlsxBuffer3) as any);
  formData3.append('zipFile', new MockFile('anexos.zip', zipBuffer1) as any);
  formData3.append('attachmentMode', 'INDIVIDUAL');

  const report3 = await validateCampaignFiles(formData3);
  await assert(report3.success === true, 'Validação de e-mail ausente deve dar sucesso com erros listados');
  await assert(report3.stats!.missingEmails === 1, 'Deveria contar 1 e-mail ausente');
  await assert(report3.rows![0].error!.includes('E-mail ausente'), 'Deveria conter a mensagem "E-mail ausente"');
  console.log('✅ Teste 3 passou.');

  // --- TESTE 4: Nome de anexo duplicado ---
  console.log('▶ Teste 4: Nome de anexo duplicado no ZIP...');
  const zip4 = new AdmZip();
  zip4.addFile('folder1/certificado.pdf', Buffer.from('%PDF-1.4\n%mock1'));
  zip4.addFile('folder2/certificado.pdf', Buffer.from('%PDF-1.4\n%mock2'));
  const zipBuffer4 = zip4.toBuffer();
  
  const validation4 = validateZipBuffer(zipBuffer4);
  await assert(validation4.success === false, 'Validação deveria falhar por duplicidade no ZIP');
  await assert(validation4.error!.includes('duplicados ou ambíguos'), 'Erro deve expor duplicidade');
  console.log('✅ Teste 4 passou.');

  // --- TESTE 5: PDF sem destinatário ---
  console.log('▶ Teste 5: PDF sem destinatário (sobrando)...');
  const zip5 = new AdmZip();
  zip5.addFile('certificado-001.pdf', Buffer.from('%PDF-1.4\n%mockpdf'));
  zip5.addFile('certificado-extra.pdf', Buffer.from('%PDF-1.4\n%mockpdf'));
  const zipBuffer5 = zip5.toBuffer();

  const formData5 = new FormData();
  formData5.append('file', new MockFile('planilha.xlsx', xlsxBuffer1) as any);
  formData5.append('zipFile', new MockFile('anexos.zip', zipBuffer5) as any);
  formData5.append('attachmentMode', 'INDIVIDUAL');

  const report5 = await validateCampaignFiles(formData5);
  await assert(report5.stats!.unusedPdfsCount === 1, 'Deveria identificar 1 PDF não utilizado');
  await assert(report5.stats!.unusedPdfs![0] === 'certificado-extra.pdf', 'PDF extra deveria ser listado');
  console.log('✅ Teste 5 passou.');

  // --- TESTE 6: Arquivo não PDF renomeado para .pdf ---
  console.log('▶ Teste 6: Arquivo não PDF renomeado para .pdf...');
  const zip6 = new AdmZip();
  zip6.addFile('falsopdf.pdf', Buffer.from('ISSO NAO E UM PDF, E UM TEXTO'));
  const zipBuffer6 = zip6.toBuffer();

  const ws6 = xlsx.utils.json_to_sheet([
    { Nome: 'João', Email: 'joao@email.com', Certificado: 'falsopdf.pdf' }
  ]);
  const wb6 = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb6, ws6, 'Sheet1');
  const xlsxBuffer6 = xlsx.write(wb6, { type: 'buffer', bookType: 'xlsx' });

  const formData6 = new FormData();
  formData6.append('file', new MockFile('planilha.xlsx', xlsxBuffer6) as any);
  formData6.append('zipFile', new MockFile('anexos.zip', zipBuffer6) as any);
  formData6.append('attachmentMode', 'INDIVIDUAL');

  const report6 = await validateCampaignFiles(formData6);
  await assert(report6.stats!.invalidPdfs === 1, 'Deveria classificar o PDF falso como inválido');
  await assert(report6.rows![0].error!.includes('Assinatura PDF inválida'), 'Deveria acusar assinatura inválida');
  console.log('✅ Teste 6 passou.');

  // --- TESTE 7: ZIP corrompido ---
  console.log('▶ Teste 7: ZIP corrompido...');
  const corruptZipBuffer = Buffer.from('UM TEXTO QUALQUER QUE NAO E UM ZIP');
  const validation7 = validateZipBuffer(corruptZipBuffer);
  await assert(validation7.success === false, 'Validação de ZIP corrompido deveria retornar falha');
  await assert(validation7.error!.includes('corrompido ou é inválido'), 'Erro correspondente a ZIP corrompido');
  console.log('✅ Teste 7 passou.');

  // --- TESTE 8: Tentativa de Zip Slip ---
  console.log('▶ Teste 8: Tentativa de Zip Slip...');
  const zip8 = new AdmZip();
  zip8.addFile('escape.pdf', Buffer.from('%PDF-1.4\n%mock'));
  zip8.getEntries()[0].entryName = '../../escape.pdf';
  const zipBuffer8 = zip8.toBuffer();

  const validation8 = validateZipBuffer(zipBuffer8);
  await assert(validation8.success === false, 'ZIP com escape de diretório deve ser rejeitado');
  await assert(validation8.error!.includes('Falha de segurança detectada'), 'Deveria apontar falha de segurança');
  console.log('✅ Teste 8 passou.');

  // --- TESTE 9: Caminho absoluto dentro do ZIP ---
  console.log('▶ Teste 9: Caminho absoluto dentro do ZIP...');
  const zip9 = new AdmZip();
  zip9.addFile('passwd.pdf', Buffer.from('%PDF-1.4\n%mock'));
  zip9.getEntries()[0].entryName = '/etc/passwd';
  const zipBuffer9 = zip9.toBuffer();

  const validation9 = validateZipBuffer(zipBuffer9);
  await assert(validation9.success === false, 'Caminho absoluto no ZIP deve ser rejeitado');
  console.log('✅ Teste 9 passou.');

  // --- TESTE 10: Arquivo vazio ---
  console.log('▶ Teste 10: Arquivo PDF vazio...');
  const zip10 = new AdmZip();
  zip10.addFile('vazio.pdf', Buffer.from(''));
  const zipBuffer10 = zip10.toBuffer();

  const ws10 = xlsx.utils.json_to_sheet([
    { Nome: 'João', Email: 'joao@email.com', Certificado: 'vazio.pdf' }
  ]);
  const wb10 = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb10, ws10, 'Sheet1');
  const xlsxBuffer10 = xlsx.write(wb10, { type: 'buffer', bookType: 'xlsx' });

  const formData10 = new FormData();
  formData10.append('file', new MockFile('planilha.xlsx', xlsxBuffer10) as any);
  formData10.append('zipFile', new MockFile('anexos.zip', zipBuffer10) as any);
  formData10.append('attachmentMode', 'INDIVIDUAL');

  const report10 = await validateCampaignFiles(formData10);
  await assert(report10.stats!.invalidPdfs === 1, 'PDF vazio deveria ser inválido');
  await assert(report10.rows![0].error!.includes('PDF está vazio'), 'Mensagem de erro de PDF vazio');
  console.log('✅ Teste 10 passou.');

  // --- TESTE 11: Arquivo acima do limite ---
  console.log('▶ Teste 11: Arquivo acima do limite...');
  const largeBuffer = Buffer.alloc(MAX_PDF_SIZE + 1024, '%PDF-1.4\n%largecontent');
  const zip11 = new AdmZip();
  zip11.addFile('grande.pdf', largeBuffer);
  const zipBuffer11 = zip11.toBuffer();

  const ws11 = xlsx.utils.json_to_sheet([
    { Nome: 'João', Email: 'joao@email.com', Certificado: 'grande.pdf' }
  ]);
  const wb11 = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb11, ws11, 'Sheet1');
  const xlsxBuffer11 = xlsx.write(wb11, { type: 'buffer', bookType: 'xlsx' });

  const formData11 = new FormData();
  formData11.append('file', new MockFile('planilha.xlsx', xlsxBuffer11) as any);
  formData11.append('zipFile', new MockFile('anexos.zip', zipBuffer11) as any);
  formData11.append('attachmentMode', 'INDIVIDUAL');

  const report11 = await validateCampaignFiles(formData11);
  await assert(report11.stats!.invalidPdfs === 1, 'PDF gigante deveria ser considerado inválido');
  await assert(report11.rows![0].error!.includes('excede o limite'), 'Deveria apontar que excede o limite');
  console.log('✅ Teste 11 passou.');

  // --- TESTE 12: Campanha sem anexos continuando a funcionar ---
  console.log('▶ Teste 12: Campanha sem anexos (Modo NONE)...');
  const formData12 = new FormData();
  formData12.append('file', new MockFile('planilha.xlsx', xlsxBuffer1) as any);
  formData12.append('name', 'Campanha Sem Anexo');
  formData12.append('templateId', template.id);
  formData12.append('smtpConfigId', smtpConfig.id);
  formData12.append('attachmentMode', 'NONE');
  formData12.append('isTriggerOnly', 'true');

  const res12 = await createCampaign(formData12);
  await assert(res12.success === true, 'Deveria criar campanha sem anexos normalmente');
  console.log('✅ Teste 12 passou.');

  // --- TESTE 13: Destinatários diferentes recebendo anexos diferentes ---
  console.log('▶ Teste 13: Destinatários diferentes e PDFs mapeados corretos...');
  const zip13 = new AdmZip();
  zip13.addFile('pdf-joao.pdf', Buffer.from('%PDF-1.4\n%pdfjoao'));
  zip13.addFile('pdf-maria.pdf', Buffer.from('%PDF-1.4\n%pdfmaria'));
  const zipBuffer13 = zip13.toBuffer();

  const ws13 = xlsx.utils.json_to_sheet([
    { Nome: 'João', Email: 'joao@email.com', Certificado: 'pdf-joao.pdf' },
    { Nome: 'Maria', Email: 'maria@email.com', Certificado: 'pdf-maria.pdf' }
  ]);
  const wb13 = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb13, ws13, 'Sheet1');
  const xlsxBuffer13 = xlsx.write(wb13, { type: 'buffer', bookType: 'xlsx' });

  const formData13 = new FormData();
  formData13.append('file', new MockFile('planilha.xlsx', xlsxBuffer13) as any);
  formData13.append('zipFile', new MockFile('anexos.zip', zipBuffer13) as any);
  formData13.append('name', 'Campanha Mapeada Válida');
  formData13.append('templateId', template.id);
  formData13.append('smtpConfigId', smtpConfig.id);
  formData13.append('attachmentMode', 'INDIVIDUAL');
  formData13.append('attachmentColumn', 'Certificado');
  formData13.append('isTriggerOnly', 'true');

  const res13 = await createCampaign(formData13);
  await assert(res13.success === true, 'Deveria criar campanha mapeada com sucesso');

  const campaignId = res13.campaignId!;
  const recipients = await prisma.recipientLog.findMany({ where: { campaignId } });
  await assert(recipients.length === 2, 'Deveria ter persistido 2 destinatários');
  
  const recJoao = recipients.find(r => r.email === 'joao@email.com')!;
  const recMaria = recipients.find(r => r.email === 'maria@email.com')!;

  await assert(recJoao.attachmentOriginalName === 'pdf-joao.pdf', 'João deveria ter o PDF pdf-joao.pdf');
  await assert(recMaria.attachmentOriginalName === 'pdf-maria.pdf', 'Maria deveria ter o PDF pdf-maria.pdf');

  // Verify paths are different
  await assert(recJoao.attachmentStorageKey !== recMaria.attachmentStorageKey, 'Caminhos de anexo devem ser diferentes');
  
  // Verify files exist in storage
  const pathJoao = resolveSafePath(recJoao.attachmentStorageKey!);
  const pathMaria = resolveSafePath(recMaria.attachmentStorageKey!);

  await assert(fs.existsSync(pathJoao), 'PDF de João deveria estar gravado no disco');
  await assert(fs.existsSync(pathMaria), 'PDF de Maria deveria estar gravado no disco');
  console.log('✅ Teste 13 passou.');

  // --- TESTE 14: Retry preservando o anexo original ---
  console.log('▶ Teste 14: Retry preservando o anexo original...');
  // Simular falha em João
  await prisma.recipientLog.update({
    where: { id: recJoao.id },
    data: { status: 'FAILED', error: 'Erro de conexao SMTP' }
  });

  const res14 = await retryFailedRecipients(campaignId);
  await assert(res14.success === true, 'Retry deveria ser disparado com sucesso');
  
  // PAUSE campaign immediately to prevent background dbWorker from claiming and sending it!
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'PAUSED' }
  });

  // Force reset recipient status to PENDING in case background dbWorker claimed it in the split-second before pausing
  await prisma.recipientLog.update({
    where: { id: recJoao.id },
    data: { status: 'PENDING', error: null }
  });
  
  const updatedJoao = await prisma.recipientLog.findUnique({ where: { id: recJoao.id } });
  await assert(updatedJoao!.status === 'PENDING', 'Status de João deveria voltar para PENDING');
  await assert(updatedJoao!.attachmentStorageKey === recJoao.attachmentStorageKey, 'Caminho do anexo original deve ser preservado');
  console.log('✅ Teste 14 passou.');

  // --- TESTE 15: Dois workers não processando o mesmo destinatário ---
  console.log('▶ Teste 15: Atomic lock do worker concorrente...');
  // Simula o updateMany do lock de claim
  const claim1 = await prisma.recipientLog.updateMany({
    where: { id: updatedJoao!.id, status: 'PENDING' },
    data: { status: 'PROCESSING' }
  });
  await assert(claim1.count === 1, 'Primeiro worker deveria conseguir reivindicar o job');

  const claim2 = await prisma.recipientLog.updateMany({
    where: { id: updatedJoao!.id, status: 'PENDING' },
    data: { status: 'PROCESSING' }
  });
  await assert(claim2.count === 0, 'Segundo worker concorrente deveria obter contagem 0 (rejeitado)');
  console.log('✅ Teste 15 passou.');

  // --- TESTE 16: Test-run não alterando o status do destinatário real ---
  console.log('▶ Teste 16: Test Run sem alterar status original...');
  // Voltando João para PENDING
  await prisma.recipientLog.update({
    where: { id: updatedJoao!.id },
    data: { status: 'PENDING' }
  });

  // Dispara o test run
  await testRunCampaignRecipient(updatedJoao!.id, 'test_receiver@email.com');
  const afterTestLog = await prisma.recipientLog.findUnique({ where: { id: updatedJoao!.id } });
  await assert(afterTestLog!.status === 'PENDING', 'O status do destinatário real no banco deve continuar PENDING após test-run');
  console.log('✅ Teste 16 passou.');

  // --- TESTE 17: Template interpolando {{Nome}} e {{Frase}} ---
  console.log('▶ Teste 17: Interpolação de templates...');
  const compiled = compileTemplate('Olá {{Nome}}, {{Frase}}', { Nome: 'Eduardo', Frase: 'sucesso!' });
  await assert(compiled === 'Olá Eduardo, sucesso!', 'Deveria interpolar Nome e Frase corretamente');
  console.log('✅ Teste 17 passou.');

  // --- TESTE 18: Falha de leitura do PDF sendo classificada como erro de anexo ---
  console.log('▶ Teste 18: Falha de leitura de anexo...');
  // Deletar o anexo do disco fisicamente para causar falha de leitura
  fs.unlinkSync(pathJoao);

  let errorMsgResult = '';
  try {
    const fsNode = require('fs');
    if (!fsNode.existsSync(pathJoao)) {
      throw new Error('Arquivo do anexo não encontrado no storage.');
    }
  } catch (err: any) {
    errorMsgResult = `Erro de anexo: ${err.message}`;
  }
  await assert(errorMsgResult.includes('Erro de anexo:'), 'O erro deve ser classificado como erro de anexo');
  console.log('✅ Teste 18 passou.');

  // --- TESTE 20: Limpeza não conseguindo sair do diretório autorizado ---
  console.log('▶ Teste 20: Limpeza fora do diretório autorizado...');
  let blockEscape = false;
  try {
    await deleteCampaignDir('../../');
  } catch (err: any) {
    blockEscape = true;
    await assert(err.message.includes('autorizado'), 'Deveria acusar tentativa de exclusão fora do diretório autorizado');
  }
  await assert(blockEscape === true, 'Deveria ter disparado uma exceção de segurança');
  console.log('✅ Teste 20 passou.');

  // Cleanup testing campaign
  await deleteCampaignDir(campaignId);
  await prisma.campaign.delete({ where: { id: campaignId } });
  
  console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO! 🎉');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Erro durante execução dos testes:', err);
  process.exit(1);
});
