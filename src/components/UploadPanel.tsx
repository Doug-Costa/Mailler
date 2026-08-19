"use client";

import { useState, useEffect } from 'react';
import * as xlsx from 'xlsx';
import { getTemplates } from '@/app/actions/template';
import { getSmtpConfigs } from '@/app/actions/smtp';
import { createCampaign, getCampaigns, validateCampaignFiles } from '@/app/actions/campaign';
import { 
  Upload, 
  FileSpreadsheet, 
  Play, 
  AlertCircle, 
  Loader2, 
  Clock, 
  GitMerge, 
  FileArchive, 
  CheckCircle2, 
  XCircle,
  Filter
} from 'lucide-react';

interface UploadPanelProps {
  onCampaignCreated: (campaignId: string) => void;
}

type FilterType = 'all' | 'valid' | 'error' | 'no-attachment' | 'no-email';

export default function UploadPanel({ onCampaignCreated }: UploadPanelProps) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [smtps, setSmtps] = useState<any[]>([]);
  const [otherCampaigns, setOtherCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedSmtp, setSelectedSmtp] = useState('');
  const [file, setFile] = useState<File | null>(null);
  
  // Cadence states
  const [sendingMode, setSendingMode] = useState('IMMEDIATE'); // IMMEDIATE, FIXED, RANDOM
  const [minDelay, setMinDelay] = useState(1000); // ms
  const [maxDelay, setMaxDelay] = useState(5000); // ms

  // Encadeamento/Fluxos
  const [nextCampaignId, setNextCampaignId] = useState('');
  const [nextCampaignDelayMinutes, setNextCampaignDelayMinutes] = useState(5);
  const [isTriggerOnly, setIsTriggerOnly] = useState(false);

  // Attachments Config
  const [attachmentMode, setAttachmentMode] = useState<'NONE' | 'INDIVIDUAL'>('NONE');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [attachmentColumn, setAttachmentColumn] = useState('');
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  
  // Validation States
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any | null>(null);
  const [ignoreInvalidRows, setIgnoreInvalidRows] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [tplList, smtpList, campaignList] = await Promise.all([
          getTemplates(),
          getSmtpConfigs(),
          getCampaigns()
        ]);
        
        setTemplates(tplList);
        setSmtps(smtpList);
        setOtherCampaigns(campaignList);
        
        // Auto select active SMTP config if present
        const activeSmtp = smtpList.find(s => s.active);
        if (activeSmtp) {
          setSelectedSmtp(activeSmtp.id);
        } else if (smtpList.length > 0) {
          setSelectedSmtp(smtpList[0].id);
        }

        if (tplList.length > 0) {
          setSelectedTemplate(tplList[0].id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // React to Excel or ZIP changes to run Validation
  useEffect(() => {
    async function runValidation() {
      if (!file) {
        setValidationResult(null);
        return;
      }
      if (attachmentMode === 'INDIVIDUAL' && !zipFile) {
        setValidationResult(null);
        return;
      }

      setValidating(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('attachmentMode', attachmentMode);
      formData.append('attachmentColumn', attachmentColumn);
      if (attachmentMode === 'INDIVIDUAL' && zipFile) {
        formData.append('zipFile', zipFile);
      }

      try {
        const res = await validateCampaignFiles(formData);
        if (res.success) {
          setValidationResult(res);
          if (res.detectedColumn && !attachmentColumn) {
            setAttachmentColumn(res.detectedColumn);
          }
        } else {
          setError(res.error || 'Erro ao processar validação dos arquivos.');
          setValidationResult(null);
        }
      } catch (err: any) {
        setError(err.message || 'Falha de comunicação com o servidor na validação.');
        setValidationResult(null);
      } finally {
        setValidating(false);
      }
    }

    runValidation();
  }, [file, zipFile, attachmentMode, attachmentColumn]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);
      setValidationResult(null);
      setIgnoreInvalidRows(false);

      // Parse spreadsheet headers client-side for immediate feedback
      try {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = xlsx.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const headers = xlsx.utils.sheet_to_json<any>(worksheet, { header: 1 })[0] as string[];
            
            if (headers && headers.length > 0) {
              setDetectedColumns(headers);
              const hasCertCol = headers.find(h => String(h).toLowerCase() === 'certificado');
              if (hasCertCol) {
                setAttachmentColumn(String(hasCertCol));
              } else {
                setAttachmentColumn(headers[0]);
              }
            }
          } catch (err) {
            console.error('Erro ao ler colunas no cliente:', err);
          }
        };
        reader.readAsArrayBuffer(selectedFile);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function handleZipChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      setZipFile(e.target.files[0]);
      setError(null);
      setValidationResult(null);
      setIgnoreInvalidRows(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Por favor, selecione uma planilha do Excel.');
      return;
    }
    if (!selectedTemplate) {
      setError('Por favor, selecione ou crie um template.');
      return;
    }
    if (!selectedSmtp) {
      setError('Por favor, selecione ou configure um servidor SMTP.');
      return;
    }
    if (attachmentMode === 'INDIVIDUAL' && !zipFile) {
      setError('Por favor, selecione o arquivo ZIP contendo os certificados.');
      return;
    }

    const hasInconsistencies = validationResult && 
      (validationResult.stats.missingEmails > 0 || 
       validationResult.stats.missingPdfs > 0 || 
       validationResult.stats.invalidPdfs > 0);

    if (hasInconsistencies && !ignoreInvalidRows) {
      setError('Existem inconsistências críticas. Por favor, marque "Criar campanha apenas com destinatários válidos".');
      return;
    }

    if (hasInconsistencies && ignoreInvalidRows) {
      const ignoredCount = validationResult.stats.totalRows - validationResult.stats.validRecipients;
      if (!confirm(`Confirmação: Você está criando a campanha ignorando ${ignoredCount} destinatário(s) inválido(s). Eles serão salvos como "Falha de Importação" no painel. Prosseguir?`)) {
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('templateId', selectedTemplate);
    formData.append('smtpConfigId', selectedSmtp);
    
    // Cadência
    formData.append('sendingMode', sendingMode);
    formData.append('minDelay', String(minDelay));
    formData.append('maxDelay', String(maxDelay));
    
    // Fluxo
    formData.append('nextCampaignId', nextCampaignId);
    formData.append('nextCampaignDelayMinutes', String(nextCampaignDelayMinutes));
    formData.append('isTriggerOnly', String(isTriggerOnly));

    // Anexos
    formData.append('attachmentMode', attachmentMode);
    formData.append('attachmentColumn', attachmentColumn);
    formData.append('ignoreInvalidRows', String(ignoreInvalidRows));
    if (attachmentMode === 'INDIVIDUAL' && zipFile) {
      formData.append('zipFile', zipFile);
    }

    try {
      const res = await createCampaign(formData);
      if (res.success && res.campaignId) {
        onCampaignCreated(res.campaignId);
      } else {
        setError(res.error || 'Erro inesperado ao criar a campanha.');
      }
    } catch (err: any) {
      setError(err.message || 'Falha na conexão com o servidor.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
        <Loader2 className="animate-spin" size={40} color="var(--primary)" />
      </div>
    );
  }

  const noSmtp = smtps.length === 0;
  const noTemplate = templates.length === 0;

  // Filter preview table rows
  const filteredRows = validationResult ? validationResult.rows.filter((r: any) => {
    if (filter === 'all') return true;
    if (filter === 'valid') return r.status === 'VALID';
    if (filter === 'error') return r.status === 'ERROR';
    if (filter === 'no-attachment') return r.status === 'ERROR' && (!r.attachmentExpected || r.error.includes('não encontrado') || r.error.includes('inválido'));
    if (filter === 'no-email') return r.status === 'ERROR' && r.error.includes('E-mail ausente');
    return true;
  }) : [];

  const hasErrors = validationResult && (
    validationResult.stats.missingEmails > 0 ||
    validationResult.stats.missingPdfs > 0 ||
    validationResult.stats.invalidPdfs > 0
  );

  return (
    <div style={{ maxWidth: 850, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Nova Campanha de Disparo</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
          Faça upload de sua planilha de contatos, configure anexos individuais por destinatário, gerencie a cadência e execute fluxos cadenciados.
        </p>
      </div>

      {(noSmtp || noTemplate) && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: 16,
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: '#fca5a5',
          marginBottom: 24
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h4 style={{ fontWeight: 600, marginBottom: 4 }}>Ação Requerida</h4>
            <p style={{ fontSize: '0.88rem' }}>
              Para iniciar uma campanha, você precisa cadastrar pelo menos:
            </p>
            <ul style={{ paddingLeft: 20, marginTop: 6, fontSize: '0.85rem' }}>
              {noSmtp && <li>Um servidor SMTP em &quot;SMTP Config&quot;.</li>}
              {noTemplate && <li>Um template em &quot;Templates&quot;.</li>}
            </ul>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-card" style={{ padding: 28 }}>
        {/* Nome da Campanha */}
        <div className="form-group">
          <label className="form-label">Nome da Campanha</label>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Ex: Envio de Certificados - Lote Junho" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            required 
            disabled={noSmtp || noTemplate || submitting}
          />
        </div>

        {/* Template e SMTP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="form-group">
            <label className="form-label">Template de E-mail</label>
            <select 
              className="form-select"
              value={selectedTemplate}
              onChange={e => setSelectedTemplate(e.target.value)}
              required
              disabled={noTemplate || submitting}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Servidor SMTP para Disparo</label>
            <select 
              className="form-select"
              value={selectedSmtp}
              onChange={e => setSelectedSmtp(e.target.value)}
              required
              disabled={noSmtp || submitting}
            >
              {smtps.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.user})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Planilha de Contatos */}
        <div className="form-group" style={{ marginTop: 10 }}>
          <label className="form-label">Planilha de Contatos (.xlsx)</label>
          <div 
            style={{
              border: '2px dashed var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '30px 20px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-input)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative'
            }}
          >
            <input 
              type="file" 
              accept=".xlsx" 
              onChange={handleFileChange}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}
              disabled={noSmtp || noTemplate || submitting}
            />
            {file ? (
              <div>
                <FileSpreadsheet size={36} color="var(--success)" style={{ margin: '0 auto 10px' }} />
                <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{file.name}</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 2 }}>
                  {(file.size / 1024).toFixed(1)} KB • Clique ou arraste para substituir
                </p>
              </div>
            ) : (
              <div>
                <Upload size={36} color="var(--text-muted)" style={{ margin: '0 auto 10px' }} />
                <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>Arraste sua planilha .xlsx ou clique para escolher</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
                  A planilha deve conter uma coluna &quot;email&quot; ou &quot;Email&quot;
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ANEXOS DA CAMPANHA */}
        <div style={{
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: 20,
          background: 'rgba(255, 255, 255, 0.01)',
          marginBottom: 20
        }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', fontWeight: 600, marginBottom: 16 }}>
            <FileArchive size={16} color="var(--primary)" />
            Anexos da Campanha
          </h4>

          <div className="form-group">
            <label className="form-label">Modo de Anexo</label>
            <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem' }}>
                <input 
                  type="radio" 
                  name="attachmentMode" 
                  checked={attachmentMode === 'NONE'} 
                  onChange={() => { setAttachmentMode('NONE'); setZipFile(null); }}
                  style={{ width: 16, height: 16 }}
                  disabled={submitting}
                />
                Sem anexo
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem' }}>
                <input 
                  type="radio" 
                  name="attachmentMode" 
                  checked={attachmentMode === 'INDIVIDUAL'} 
                  onChange={() => setAttachmentMode('INDIVIDUAL')}
                  style={{ width: 16, height: 16 }}
                  disabled={submitting}
                />
                Anexo individual por destinatário (Requer ZIP + Coluna XLSX)
              </label>
            </div>
          </div>

          {attachmentMode === 'INDIVIDUAL' && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              
              {/* ZIP upload file */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'block', marginBottom: 8 }}>Arquivo ZIP contendo os PDFs</label>
                <div 
                  style={{
                    border: '2px dashed var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '24px 20px',
                    textAlign: 'center',
                    backgroundColor: 'var(--bg-input)',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    position: 'relative'
                  }}
                >
                  <input 
                    type="file" 
                    accept=".zip" 
                    onChange={handleZipChange}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: submitting ? 'not-allowed' : 'pointer'
                    }}
                    disabled={submitting}
                    required
                  />
                  {zipFile ? (
                    <div>
                      <FileArchive size={30} color="var(--primary)" style={{ margin: '0 auto 8px' }} />
                      <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>{zipFile.name}</p>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>
                        {(zipFile.size / (1024 * 1024)).toFixed(2)} MB • Clique ou arraste para substituir
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Upload size={30} color="var(--text-muted)" style={{ margin: '0 auto 8px' }} />
                      <p style={{ fontWeight: 500, fontSize: '0.85rem' }}>Arraste seu arquivo .zip ou clique para escolher</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>
                        O arquivo ZIP deve conter apenas certificados em formato PDF (Max 100MB)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Excel column mapping selector */}
              <div className="form-group">
                <label className="form-label">Coluna da Planilha para Mapear os PDFs</label>
                <select
                  className="form-select"
                  value={attachmentColumn}
                  onChange={e => setAttachmentColumn(e.target.value)}
                  disabled={submitting || detectedColumns.length === 0}
                  required
                >
                  {detectedColumns.length === 0 ? (
                    <option value="">Selecione a planilha primeiro</option>
                  ) : (
                    detectedColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))
                  )}
                </select>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  O sistema procurará no ZIP o arquivo PDF correspondente ao nome exato desta coluna.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* PRE-VALIDATION STATE / VISUAL REPORT */}
        {validating && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: 20,
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            marginBottom: 20
          }}>
            <Loader2 className="animate-spin" size={20} color="var(--primary)" />
            <span style={{ fontSize: '0.9rem' }}>Processando e analisando cruzamento de dados (planilha vs PDFs)...</span>
          </div>
        )}

        {validationResult && !validating && (
          <div style={{
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: 20,
            background: 'rgba(255, 255, 255, 0.02)',
            marginBottom: 20
          }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              📊 Resultado da Pré-Validação
            </h4>

            {/* Metrics cards grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 12,
              marginBottom: 20
            }}>
              <div style={{ padding: 12, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: 2 }}>Total Linhas</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{validationResult.stats.totalRows}</div>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: 2 }}>PDFs no ZIP</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{validationResult.stats.totalPdfs}</div>
              </div>
              <div style={{ padding: 12, background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <div style={{ color: 'var(--success)', fontSize: '0.75rem', marginBottom: 2 }}>Destinatários Válidos</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success)' }}>{validationResult.stats.validRecipients}</div>
              </div>
              <div style={{ padding: 12, background: validationResult.stats.missingEmails > 0 ? 'var(--danger-bg)' : 'var(--bg-input)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ color: validationResult.stats.missingEmails > 0 ? '#ef4444' : 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: 2 }}>Sem E-mail</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: validationResult.stats.missingEmails > 0 ? '#ef4444' : 'inherit' }}>{validationResult.stats.missingEmails}</div>
              </div>
              {attachmentMode === 'INDIVIDUAL' && (
                <>
                  <div style={{ padding: 12, background: validationResult.stats.missingPdfs > 0 ? 'var(--danger-bg)' : 'var(--bg-input)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ color: validationResult.stats.missingPdfs > 0 ? '#ef4444' : 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: 2 }}>PDF Não Encontrado</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: validationResult.stats.missingPdfs > 0 ? '#ef4444' : 'inherit' }}>{validationResult.stats.missingPdfs}</div>
                  </div>
                  <div style={{ padding: 12, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: 2 }}>PDFs Sobrando</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: validationResult.stats.unusedPdfsCount > 0 ? 'var(--primary)' : 'inherit' }}>{validationResult.stats.unusedPdfsCount}</div>
                  </div>
                </>
              )}
            </div>

            {/* List filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Filter size={14} /> Filtros:
              </span>
              <button 
                type="button" 
                className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`} 
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => setFilter('all')}
              >
                Todos ({validationResult.stats.totalRows})
              </button>
              <button 
                type="button" 
                className={`btn ${filter === 'valid' ? 'btn-primary' : 'btn-secondary'}`} 
                style={{ padding: '6px 12px', fontSize: '0.8rem', color: filter === 'valid' ? 'white' : 'var(--success)' }}
                onClick={() => setFilter('valid')}
              >
                Válidos ({validationResult.stats.validRecipients})
              </button>
              <button 
                type="button" 
                className={`btn ${filter === 'error' ? 'btn-primary' : 'btn-secondary'}`} 
                style={{ padding: '6px 12px', fontSize: '0.8rem', color: filter === 'error' ? 'white' : '#f87171' }}
                onClick={() => setFilter('error')}
              >
                Com erro ({validationResult.stats.totalRows - validationResult.stats.validRecipients})
              </button>
              {attachmentMode === 'INDIVIDUAL' && (
                <button 
                  type="button" 
                  className={`btn ${filter === 'no-attachment' ? 'btn-primary' : 'btn-secondary'}`} 
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  onClick={() => setFilter('no-attachment')}
                >
                  Sem PDF / PDF Inválido ({validationResult.stats.missingPdfs + validationResult.stats.invalidPdfs})
                </button>
              )}
              <button 
                type="button" 
                className={`btn ${filter === 'no-email' ? 'btn-primary' : 'btn-secondary'}`} 
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => setFilter('no-email')}
              >
                Sem e-mail ({validationResult.stats.missingEmails})
              </button>
            </div>

            {/* List Table */}
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead style={{ background: 'var(--bg-input)', position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: 10, width: 60 }}>Linha</th>
                    <th style={{ padding: 10 }}>Nome</th>
                    <th style={{ padding: 10 }}>E-mail</th>
                    {attachmentMode === 'INDIVIDUAL' && <th style={{ padding: 10 }}>Anexo esperado</th>}
                    <th style={{ padding: 10 }}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>
                        Nenhum registro encontrado para este filtro.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row: any) => (
                      <tr key={row.line} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: row.status === 'ERROR' ? '#fca5a5' : 'inherit' }}>
                        <td style={{ padding: 10, fontWeight: 500 }}>{row.line}</td>
                        <td style={{ padding: 10 }}>{row.name || '-'}</td>
                        <td style={{ padding: 10 }}>{row.email || <span style={{ fontStyle: 'italic', color: '#f87171' }}>[Ausente]</span>}</td>
                        {attachmentMode === 'INDIVIDUAL' && (
                          <td style={{ padding: 10, fontFamily: 'monospace' }}>{row.attachmentExpected || <span style={{ fontStyle: 'italic', color: '#f87171' }}>[Vazio]</span>}</td>
                        )}
                        <td style={{ padding: 10 }}>
                          {row.status === 'VALID' ? (
                            <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={12} /> Vinculado
                            </span>
                          ) : (
                            <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }} title={row.error}>
                              <XCircle size={12} /> {row.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PDFs in ZIP not linked warning */}
            {attachmentMode === 'INDIVIDUAL' && validationResult.stats.unusedPdfsCount > 0 && (
              <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                ℹ️ <strong>Nota:</strong> Existem {validationResult.stats.unusedPdfsCount} PDFs sobressalentes no arquivo ZIP que não foram associados a nenhum participante (ex: <i>{validationResult.stats.unusedPdfs.slice(0, 3).join(', ')}</i>...).
              </div>
            )}

            {/* Inconsistency Warning & Ignore Choice */}
            {hasErrors && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: 14,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                marginTop: 16
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fca5a5' }}>
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Existem destinatários com erros na planilha ou arquivos ZIP ausentes.</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                  O disparo não pode ser criado no modo normal com destinatários inválidos. Por favor, marque a caixa abaixo para prosseguir enviando e-mails apenas para as linhas corretas. As linhas com erro serão registradas como falha de importação no log da campanha.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: 'white', marginTop: 4 }}>
                  <input 
                    type="checkbox" 
                    checked={ignoreInvalidRows} 
                    onChange={e => setIgnoreInvalidRows(e.target.checked)} 
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                    disabled={submitting}
                  />
                  Criar campanha apenas com destinatários válidos
                </label>
              </div>
            )}
          </div>
        )}

        {/* Seção 1: Controle de Cadência */}
        <div style={{
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: 20,
          background: 'rgba(255, 255, 255, 0.01)',
          marginBottom: 20
        }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', fontWeight: 600, marginBottom: 16 }}>
            <Clock size={16} color="var(--primary)" />
            1. Controle de Cadência (Evitar Blacklist)
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="form-group">
              <label className="form-label">Modo de Envio</label>
              <select 
                className="form-select"
                value={sendingMode}
                onChange={e => setSendingMode(e.target.value)}
                disabled={submitting}
              >
                <option value="IMMEDIATE">Envio Imediato Padrão (Sem Delay)</option>
                <option value="FIXED">Cadência Fixa (Delay constante)</option>
                <option value="RANDOM">Cadência Aleatória (Delay variável)</option>
              </select>
            </div>

            {sendingMode !== 'IMMEDIATE' && (
              <div style={{ display: 'grid', gridTemplateColumns: sendingMode === 'RANDOM' ? '1fr 1fr' : '1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">{sendingMode === 'RANDOM' ? 'Delay Mínimo (ms)' : 'Delay do Envio (ms)'}</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={minDelay}
                    min={100}
                    onChange={e => setMinDelay(Number(e.target.value))}
                    required
                  />
                </div>
                {sendingMode === 'RANDOM' && (
                  <div className="form-group">
                    <label className="form-label">Delay Máximo (ms)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={maxDelay}
                      min={minDelay}
                      onChange={e => setMaxDelay(Number(e.target.value))}
                      required
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Seção 2: Criador de Fluxo Cadenciado */}
        <div style={{
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: 20,
          background: 'rgba(255, 255, 255, 0.01)',
          marginBottom: 20
        }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', fontWeight: 600, marginBottom: 16 }}>
            <GitMerge size={16} color="var(--primary)" />
            2. Criador de Fluxo Cadenciado (Gatilhos)
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="form-group">
              <label className="form-label">Próxima Campanha (Auto-Gatilho)</label>
              <select 
                className="form-select"
                value={nextCampaignId}
                onChange={e => setNextCampaignId(e.target.value)}
                disabled={submitting}
              >
                <option value="">Nenhuma (Fim do fluxo)</option>
                {otherCampaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.totalEmails} e-mails)</option>
                ))}
              </select>
            </div>

            {nextCampaignId && (
              <div className="form-group">
                <label className="form-label">Intervalo antes de iniciar (Minutos)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={nextCampaignDelayMinutes}
                  min={0}
                  onChange={e => setNextCampaignDelayMinutes(Number(e.target.value))}
                  required
                />
              </div>
            )}
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0' }}>
            <input 
              type="checkbox" 
              id="isTriggerOnly" 
              checked={isTriggerOnly} 
              onChange={e => setIsTriggerOnly(e.target.checked)} 
              style={{ width: 18, height: 18, cursor: 'pointer' }}
              disabled={submitting}
            />
            <label htmlFor="isTriggerOnly" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
              Apenas salvar contatos e aguardar gatilho (Campanha Pendente)
            </label>
          </div>
        </div>

        {error && (
          <div style={{
            padding: 12,
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#fca5a5',
            fontSize: '0.9rem',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <button 
          type="submit" 
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 10 }}
          disabled={noSmtp || noTemplate || submitting || !file || (hasErrors && !ignoreInvalidRows) || validating}
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" size={18} /> Criando e Configurando Campanha...
            </>
          ) : (
            <>
              <Play size={18} /> {
                isTriggerOnly 
                  ? 'Salvar Campanha no Fluxo' 
                  : (hasErrors && ignoreInvalidRows) 
                    ? 'Criar Campanha Apenas com Destinatários Válidos' 
                    : 'Enviar Planilha e Iniciar Disparos'
              }
            </>
          )}
        </button>
      </form>
    </div>
  );
}
