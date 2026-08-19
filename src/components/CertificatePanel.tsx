"use client";

import React, { useState, useEffect, useTransition } from 'react';
import * as xlsx from 'xlsx';
import { 
  Award, 
  FileSpreadsheet, 
  Plus, 
  Trash2, 
  Edit3, 
  Download, 
  RefreshCw, 
  FileArchive, 
  CheckCircle2, 
  XCircle, 
  Filter, 
  ArrowLeft, 
  Mail, 
  Search, 
  FileText, 
  Loader2, 
  AlertTriangle 
} from 'lucide-react';

import { 
  getCertificateTemplates, 
  getCertificateTemplateDetails,
  saveCertificateTemplate, 
  deleteCertificateTemplate,
  getCertificateBatches,
  getCertificateBatchDetails,
  createCertificateBatch,
  deleteCertificateBatch,
  generateSingleCertificatePreview,
  startBatchGeneration,
  retryFailedBatchCertificates,
  regenerateSingleCertificate,
  createCampaignFromBatch,
  generateBatchZipExport,
  getSingleCertificateFile,
  generateBatchCsvReport
} from '@/app/actions/certificate';

import { getTemplates as getEmailTemplates } from '@/app/actions/template';
import { getSmtpConfigs } from '@/app/actions/smtp';

import CertificateEditor from './CertificateEditor';

type SubTab = 'list-templates' | 'edit-template' | 'list-batches' | 'new-batch' | 'batch-details';

export default function CertificatePanel() {
  const [subTab, setSubTab] = useState<SubTab>('list-templates');
  const [templates, setTemplates] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Email campaigns config dropdowns
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [smtpConfigs, setSmtps] = useState<any[]>([]);

  // ----------------------------------------------------
  // TEMPLATE STATES
  // ----------------------------------------------------
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreviewUrl, setBgPreviewUrl] = useState('');
  
  // Template positioning configurations
  const [width, setWidth] = useState(841.89);
  const [height, setHeight] = useState(595.28);
  const [orientation, setOrientation] = useState('LANDSCAPE');
  
  // Name configuration
  const [nameX, setNameX] = useState(0.5);
  const [nameY, setNameY] = useState(0.45);
  const [nameMaxWidth, setNameMaxWidth] = useState(0.7);
  const [nameFont, setNameFont] = useState('Roboto-Regular');
  const [nameSize, setNameSize] = useState(36);
  const [nameColor, setNameColor] = useState('#000000');
  const [nameAlign, setNameAlign] = useState<'left' | 'center' | 'right'>('center');
  const [nameTransform, setNameTransform] = useState<'uppercase' | 'none'>('none');
  const [nameMinSize, setNameMinSize] = useState(16);

  // Signature 1
  const [sig1Active, setSig1Active] = useState(false);
  const [sig1File, setSig1File] = useState<File | null>(null);
  const [sig1PreviewUrl, setSig1PreviewUrl] = useState('');
  const [sig1X, setSig1X] = useState(0.2);
  const [sig1Y, setSig1Y] = useState(0.75);
  const [sig1W, setSig1W] = useState(0.15);
  const [sig1H, setSig1H] = useState(0.08);

  // Signature 2
  const [sig2Active, setSig2Active] = useState(false);
  const [sig2File, setSig2File] = useState<File | null>(null);
  const [sig2PreviewUrl, setSig2PreviewUrl] = useState('');
  const [sig2X, setSig2X] = useState(0.65);
  const [sig2Y, setSig2Y] = useState(0.75);
  const [sig2W, setSig2W] = useState(0.15);
  const [sig2H, setSig2H] = useState(0.08);

  // Preview real modal
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPdfBase64, setPreviewPdfBase64] = useState<string | null>(null);

  // ----------------------------------------------------
  // BATCH STATES
  // ----------------------------------------------------
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDetails, setBatchDetails] = useState<any | null>(null);
  const [batchName, setBatchName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  
  // Sheet variables
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [sheetRows, setSheetRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappedNameCol, setMappedNameCol] = useState('');
  const [mappedEmailCol, setMappedEmailCol] = useState('');
  const [mappedIdCol, setMappedIdCol] = useState('');
  const [filenamePattern, setFilenamePattern] = useState('{id}-{nome-normalizado}');

  // Batch Details filtering
  const [batchSearch, setBatchSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState<'all' | 'generated' | 'failed' | 'no-email'>('all');

  // Regenerate Single Cert modal
  const [regenerateCertId, setRegenerateCertId] = useState<string | null>(null);
  const [regenerateName, setRegenerateName] = useState('');

  // Create Campaign modal
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campName, setCampName] = useState('');
  const [campTemplateId, setCampTemplateId] = useState('');
  const [campSmtpId, setCampSmtpId] = useState('');
  const [campSendingMode, setCampSendingMode] = useState('IMMEDIATE');
  const [campMinDelay, setCampMinDelay] = useState(1000);
  const [campMaxDelay, setCampMaxDelay] = useState(5000);
  const [campNextId, setCampNextId] = useState('');
  const [campNextDelay, setCampNextDelay] = useState(5);
  const [campIsTriggerOnly, setCampIsTriggerOnly] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Polling for batch generation progress
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (subTab === 'batch-details' && selectedBatchId && batchDetails?.status === 'GENERATING') {
      interval = setInterval(async () => {
        const details = await getCertificateBatchDetails(selectedBatchId);
        setBatchDetails(details);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [subTab, selectedBatchId, batchDetails?.status]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [tpls, bts, emailTpls, smtpsList] = await Promise.all([
        getCertificateTemplates(),
        getCertificateBatches(),
        getEmailTemplates(),
        getSmtpConfigs()
      ]);
      setTemplates(tpls);
      setBatches(bts);
      setEmailTemplates(emailTpls);
      setSmtps(smtpsList);

      if (tpls.length > 0) {
        setSelectedTemplateId(tpls[0].id);
        const lastVer = tpls[0].versions?.[0];
        if (lastVer) setSelectedVersionId(lastVer.id);
      }
      if (emailTpls.length > 0) {
        setCampTemplateId(emailTpls[0].id);
      }
      const activeSmtp = smtpsList.find(s => s.active);
      if (activeSmtp) {
        setCampSmtpId(activeSmtp.id);
      } else if (smtpsList.length > 0) {
        setCampSmtpId(smtpsList[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------------------------------
  // TEMPLATES HANDLERS
  // ----------------------------------------------------
  
  function handleNewTemplate() {
    setEditingTemplate({});
    setTemplateName('');
    setTemplateDesc('');
    setBgFile(null);
    setBgPreviewUrl('');
    setWidth(841.89);
    setHeight(595.28);
    setOrientation('LANDSCAPE');
    
    // Reset configs
    setNameX(0.5);
    setNameY(0.45);
    setNameMaxWidth(0.7);
    setNameFont('Roboto-Regular');
    setNameSize(36);
    setNameColor('#000000');
    setNameAlign('center');
    setNameTransform('none');
    setNameMinSize(16);

    setSig1Active(false);
    setSig1File(null);
    setSig1PreviewUrl('');
    setSig1X(0.2);
    setSig1Y(0.75);
    setSig1W(0.15);
    setSig1H(0.08);

    setSig2Active(false);
    setSig2File(null);
    setSig2PreviewUrl('');
    setSig2X(0.65);
    setSig2Y(0.75);
    setSig2W(0.15);
    setSig2H(0.08);

    setSubTab('edit-template');
  }

  async function handleEditTemplate(tpl: any) {
    setEditingTemplate(tpl);
    setTemplateName(tpl.name);
    setTemplateDesc(tpl.description || '');
    setWidth(tpl.width);
    setHeight(tpl.height);
    setOrientation(tpl.orientation);
    
    setBgFile(null);
    setBgPreviewUrl('/api/track/open/preview-bg?key=' + encodeURIComponent(tpl.backgroundKey));

    const lastVer = tpl.versions?.[0];
    if (lastVer) {
      const config = lastVer.configuration;
      const nf = config.nameField;
      setNameX(nf.x);
      setNameY(nf.y);
      setNameMaxWidth(nf.maxWidth);
      setNameFont(nf.fontFamily);
      setNameSize(nf.fontSize);
      setNameColor(nf.color);
      setNameAlign(nf.alignment);
      setNameTransform(nf.transformation || 'none');
      setNameMinSize(nf.minFontSize || 16);

      if (config.signature1?.active) {
        setSig1Active(true);
        setSig1X(config.signature1.x);
        setSig1Y(config.signature1.y);
        setSig1W(config.signature1.width);
        setSig1H(config.signature1.height);
        if (lastVer.signature1Key) {
          setSig1PreviewUrl('/api/track/open/preview-bg?key=' + encodeURIComponent(lastVer.signature1Key));
        }
      } else {
        setSig1Active(false);
      }

      if (config.signature2?.active) {
        setSig2Active(true);
        setSig2X(config.signature2.x);
        setSig2Y(config.signature2.y);
        setSig2W(config.signature2.width);
        setSig2H(config.signature2.height);
        if (lastVer.signature2Key) {
          setSig2PreviewUrl('/api/track/open/preview-bg?key=' + encodeURIComponent(lastVer.signature2Key));
        }
      } else {
        setSig2Active(false);
      }
    }

    setSubTab('edit-template');
  }

  const handleEditorChange = (updates: { nameConfig?: any; signature1?: any; signature2?: any }) => {
    if (updates.nameConfig) {
      const nc = updates.nameConfig;
      setNameX(nc.x);
      setNameY(nc.y);
      setNameMaxWidth(nc.maxWidth);
    }
    if (updates.signature1) {
      const s1 = updates.signature1;
      setSig1X(s1.x);
      setSig1Y(s1.y);
      setSig1W(s1.width);
      setSig1H(s1.height);
    }
    if (updates.signature2) {
      const s2 = updates.signature2;
      setSig2X(s2.x);
      setSig2Y(s2.y);
      setSig2W(s2.width);
      setSig2H(s2.height);
    }
  };

  async function handleRealPreview() {
    setPreviewLoading(true);
    setPreviewPdfBase64(null);
    try {
      if (!editingTemplate.id && !bgFile) {
        alert('Carregue uma imagem de fundo antes de visualizar o preview real.');
        setPreviewLoading(false);
        return;
      }

      const fd = new FormData();
      fd.append('name', templateName || 'Rascunho');
      fd.append('width', String(width));
      fd.append('height', String(height));
      fd.append('orientation', orientation);

      const nameConfigJson = {
        x: nameX,
        y: nameY,
        maxWidth: nameMaxWidth,
        fontFamily: nameFont,
        fontSize: nameSize,
        color: nameColor,
        alignment: nameAlign,
        transformation: nameTransform,
        minFontSize: nameMinSize
      };

      fd.append('nameConfig', JSON.stringify(nameConfigJson));
      fd.append('signature1Active', String(sig1Active));
      fd.append('signature2Active', String(sig2Active));
      
      const sig1Conf = { x: sig1X, y: sig1Y, width: sig1W, height: sig1H };
      const sig2Conf = { x: sig2X, y: sig2Y, width: sig2W, height: sig2H };
      fd.append('signature1Config', JSON.stringify(sig1Conf));
      fd.append('signature2Config', JSON.stringify(sig2Conf));

      if (bgFile) fd.append('background', bgFile);
      if (sig1File) fd.append('signature1', sig1File);
      if (sig2File) fd.append('signature2', sig2File);

      if (editingTemplate.id) {
        fd.append('id', editingTemplate.id);
      }

      const saveRes = await saveCertificateTemplate(fd);
      if (saveRes.success && saveRes.templateId) {
        const details = await getCertificateTemplateDetails(saveRes.templateId);
        const lastVer = details?.versions?.[0];
        if (lastVer) {
          const prevFd = new FormData();
          prevFd.append('templateVersionId', lastVer.id);
          prevFd.append('participantName', 'Maria Eduarda Albuquerque Santos');
          const previewRes = await generateSingleCertificatePreview(prevFd);
          if (previewRes.success && previewRes.pdfBase64) {
            setPreviewPdfBase64(previewRes.pdfBase64);
            setEditingTemplate({ id: saveRes.templateId });
          } else {
            alert(previewRes.error || 'Erro ao renderizar PDF');
          }
        }
      } else {
        alert(saveRes.error || 'Erro ao compilar template temporário');
      }
    } catch (err: any) {
      alert('Erro de visualização: ' + err.message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    try {
      const fd = new FormData();
      if (editingTemplate.id) fd.append('id', editingTemplate.id);
      fd.append('name', templateName);
      fd.append('description', templateDesc);
      fd.append('width', String(width));
      fd.append('height', String(height));
      fd.append('orientation', orientation);

      const nameConfigJson = {
        x: nameX,
        y: nameY,
        maxWidth: nameMaxWidth,
        fontFamily: nameFont,
        fontSize: nameSize,
        color: nameColor,
        alignment: nameAlign,
        transformation: nameTransform,
        minFontSize: nameMinSize
      };

      fd.append('nameConfig', JSON.stringify(nameConfigJson));
      fd.append('signature1Active', String(sig1Active));
      fd.append('signature2Active', String(sig2Active));
      
      const sig1Conf = { x: sig1X, y: sig1Y, width: sig1W, height: sig1H };
      const sig2Conf = { x: sig2X, y: sig2Y, width: sig2W, height: sig2H };
      fd.append('signature1Config', JSON.stringify(sig1Conf));
      fd.append('signature2Config', JSON.stringify(sig2Conf));

      if (bgFile) fd.append('background', bgFile);
      if (sig1File) fd.append('signature1', sig1File);
      if (sig2File) fd.append('signature2', sig2File);

      const res = await saveCertificateTemplate(fd);
      if (res.success) {
        setSubTab('list-templates');
        await loadData();
      } else {
        alert(res.error || 'Erro ao salvar template');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Deseja realmente remover este template?')) return;
    try {
      const res = await deleteCertificateTemplate(id);
      if (res.success) {
        await loadData();
      } else {
        alert(res.error);
      }
    } catch (err: any) {
      alert(err.message);
    }
  }

  // ----------------------------------------------------
  // BATCH HANDLERS
  // ----------------------------------------------------

  function handleNewBatch() {
    setBatchName('');
    setXlsxFile(null);
    setSheetRows([]);
    setHeaders([]);
    setMappedNameCol('');
    setMappedEmailCol('');
    setMappedIdCol('');
    setFilenamePattern('{id}-{nome-normalizado}');
    
    if (templates.length > 0) {
      setSelectedTemplateId(templates[0].id);
      const lastVer = templates[0].versions?.[0];
      if (lastVer) setSelectedVersionId(lastVer.id);
    }
    
    setSubTab('new-batch');
  }

  const handleXlsxUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileItem = files[0];
    setXlsxFile(fileItem);
    setBatchName('Lote - ' + fileItem.name.replace(/\.[^/.]+$/, ''));

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = xlsx.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = xlsx.utils.sheet_to_json<any>(worksheet);
      
      if (json.length > 0) {
        setSheetRows(json);
        const keys = Object.keys(json[0]);
        setHeaders(keys);
        
        const foundName = keys.find(k => k.toLowerCase() === 'nome');
        setMappedNameCol(foundName || keys[0]);

        const foundEmail = keys.find(k => k.toLowerCase() === 'email' || k.toLowerCase() === 'e-mail');
        setMappedEmailCol(foundEmail || '');

        const foundId = keys.find(k => k.toLowerCase() === 'id' || k.toLowerCase() === 'identificador' || k.toLowerCase() === 'codigo');
        setMappedIdCol(foundId || '');
      }
    };
    reader.readAsArrayBuffer(fileItem);
  };

  async function handleSaveBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!xlsxFile) return alert('Selecione uma planilha de participantes.');
    setActionLoading(true);
    try {
      const fd = new FormData();
      fd.append('name', batchName);
      fd.append('templateId', selectedTemplateId);
      fd.append('templateVersionId', selectedVersionId);
      fd.append('file', xlsxFile);
      fd.append('nameColumn', mappedNameCol);
      fd.append('emailColumn', mappedEmailCol);
      fd.append('idColumn', mappedIdCol);
      fd.append('filenamePattern', filenamePattern);

      const res = await createCertificateBatch(fd);
      if (res.success && res.batchId) {
        setSelectedBatchId(res.batchId);
        const details = await getCertificateBatchDetails(res.batchId);
        setBatchDetails(details);
        setSubTab('batch-details');
        await loadData();
      } else {
        alert(res.error || 'Erro ao criar lote');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSelectBatch(id: string) {
    setSelectedBatchId(id);
    setLoading(true);
    try {
      const details = await getCertificateBatchDetails(id);
      setBatchDetails(details);
      setSubTab('batch-details');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteBatch(id: string) {
    if (!confirm('Deseja realmente remover este lote e todos os certificados gerados nele? Esta ação é irreversível.')) return;
    try {
      const res = await deleteCertificateBatch(id);
      if (res.success) {
        if (selectedBatchId === id) {
          setSubTab('list-batches');
          setBatchDetails(null);
        }
        await loadData();
      } else {
        alert(res.error);
      }
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleStartBatchGeneration() {
    if (!selectedBatchId) return;
    try {
      const res = await startBatchGeneration(selectedBatchId);
      if (res.success) {
        const details = await getCertificateBatchDetails(selectedBatchId);
        setBatchDetails(details);
      } else {
        alert(res.error);
      }
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleRetryFailed() {
    if (!selectedBatchId) return;
    try {
      const res = await retryFailedBatchCertificates(selectedBatchId);
      if (res.success) {
        const details = await getCertificateBatchDetails(selectedBatchId);
        setBatchDetails(details);
      } else {
        alert(res.error);
      }
    } catch (err: any) {
      alert(err.message);
    }
  }

  // ----------------------------------------------------
  // DOWNLOADS HANDLERS
  // ----------------------------------------------------

  async function handleDownloadIndividual(certId: string, filename: string) {
    try {
      const res = await getSingleCertificateFile(certId);
      if (res.success && res.pdfBase64) {
        const linkSource = `data:application/pdf;base64,${res.pdfBase64}`;
        const downloadLink = document.createElement("a");
        downloadLink.href = linkSource;
        downloadLink.download = filename;
        downloadLink.click();
      } else {
        alert(res.error || 'Erro ao baixar arquivo');
      }
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDownloadZip(filterType: 'all' | 'no-email') {
    if (!selectedBatchId) return;
    setActionLoading(true);
    try {
      const res = await generateBatchZipExport(selectedBatchId, filterType);
      if (res.success && res.zipBase64 && res.filename) {
        const linkSource = `data:application/zip;base64,${res.zipBase64}`;
        const downloadLink = document.createElement("a");
        downloadLink.href = linkSource;
        downloadLink.download = res.filename;
        downloadLink.click();
      } else {
        alert(res.error || 'Erro ao exportar ZIP');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDownloadCsv() {
    if (!selectedBatchId) return;
    try {
      const res = await generateBatchCsvReport(selectedBatchId);
      if (res.success && res.csvBase64 && res.filename) {
        const linkSource = `data:text/csv;base64,${res.csvBase64}`;
        const downloadLink = document.createElement("a");
        downloadLink.href = linkSource;
        downloadLink.download = res.filename;
        downloadLink.click();
      } else {
        alert(res.error || 'Erro ao exportar CSV');
      }
    } catch (err: any) {
      alert(err.message);
    }
  }

  // ----------------------------------------------------
  // REGENERATE & CAMPAIGN MODAL HANDLERS
  // ----------------------------------------------------

  async function handleRegenerateCert(e: React.FormEvent) {
    e.preventDefault();
    if (!regenerateCertId) return;
    setActionLoading(true);
    try {
      const res = await regenerateSingleCertificate(regenerateCertId, regenerateName);
      if (res.success) {
        setRegenerateCertId(null);
        if (selectedBatchId) {
          const details = await getCertificateBatchDetails(selectedBatchId);
          setBatchDetails(details);
        }
      } else {
        alert(res.error || 'Erro ao regenerar certificado');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBatchId) return;
    setActionLoading(true);
    try {
      const fd = new FormData();
      fd.append('batchId', selectedBatchId);
      fd.append('name', campName);
      fd.append('templateId', campTemplateId);
      fd.append('smtpConfigId', campSmtpId);
      fd.append('sendingMode', campSendingMode);
      fd.append('minDelay', String(campMinDelay));
      fd.append('maxDelay', String(campMaxDelay));
      fd.append('nextCampaignId', campNextId);
      fd.append('nextCampaignDelayMinutes', String(campNextDelay));
      fd.append('isTriggerOnly', String(campIsTriggerOnly));

      const res = await createCampaignFromBatch(fd);
      if (res.success) {
        setShowCampaignModal(false);
        alert('Campanha de disparos criada com sucesso!');
        window.location.reload();
      } else {
        alert(res.error || 'Erro ao criar campanha');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
        <Loader2 className="animate-spin" size={40} color="var(--primary)" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: '1px solid var(--border-color)', paddingBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <button 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: subTab.startsWith('list-templates') || subTab === 'edit-template' ? 'var(--primary)' : 'var(--text-secondary)',
              fontSize: '1rem', 
              fontWeight: 600, 
              cursor: 'pointer',
              borderBottom: subTab.startsWith('list-templates') || subTab === 'edit-template' ? '2px solid var(--primary)' : 'none',
              paddingBottom: 8
            }}
            onClick={() => setSubTab('list-templates')}
          >
            Templates de Certificado
          </button>
          <button 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: subTab.startsWith('list-batches') || subTab === 'batch-details' || subTab === 'new-batch' ? 'var(--primary)' : 'var(--text-secondary)',
              fontSize: '1rem', 
              fontWeight: 600, 
              cursor: 'pointer',
              borderBottom: subTab.startsWith('list-batches') || subTab === 'batch-details' || subTab === 'new-batch' ? '2px solid var(--primary)' : 'none',
              paddingBottom: 8
            }}
            onClick={() => setSubTab('list-batches')}
          >
            Lotes de Certificados
          </button>
        </div>
      </div>

      {subTab === 'list-templates' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Modelos Visuais</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Crie e configure layouts de certificados</p>
            </div>
            <button className="btn btn-primary" onClick={handleNewTemplate}>
              <Plus size={16} /> Novo Layout
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {templates.map(tpl => (
              <div key={tpl.id} className="glass-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                <div>
                  <h4 style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{tpl.name}</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4, minHeight: 40 }}>{tpl.description || 'Sem descrição.'}</p>
                  
                  <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>A4: {tpl.orientation === 'LANDSCAPE' ? 'Paisagem' : 'Retrato'}</span>
                    <span>Versão: {tpl.versions?.[0]?.version || 1}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 20, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                  <button className="btn btn-secondary" onClick={() => handleEditTemplate(tpl)} style={{ flex: 1, padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Edit3 size={14} /> Editar
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDeleteTemplate(tpl.id)} style={{ padding: '6px 10px' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {templates.length === 0 && (
              <div className="glass-card" style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                Nenhum template de certificado criado ainda. Clique em "Novo Layout" para começar.
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'edit-template' && (
        <div>
          <button className="btn btn-secondary" onClick={() => setSubTab('list-templates')} style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={16} /> Voltar aos layouts
          </button>

          <form onSubmit={handleSaveTemplate} style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
            <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: 16, fontWeight: 600 }}>Editor Visual do Certificado</h3>
              
              {bgPreviewUrl || bgFile ? (
                <div style={{ flex: 1 }}>
                  <CertificateEditor 
                    backgroundImageUrl={bgFile ? URL.createObjectURL(bgFile) : bgPreviewUrl}
                    nameConfig={{
                      x: nameX,
                      y: nameY,
                      maxWidth: nameMaxWidth,
                      fontFamily: nameFont,
                      fontSize: nameSize,
                      color: nameColor,
                      alignment: nameAlign,
                      transformation: nameTransform,
                      minFontSize: nameMinSize
                    }}
                    signature1={sig1Active ? {
                      active: true,
                      imageUrl: sig1File ? URL.createObjectURL(sig1File) : sig1PreviewUrl,
                      x: sig1X,
                      y: sig1Y,
                      width: sig1W,
                      height: sig1H
                    } : null}
                    signature2={sig2Active ? {
                      active: true,
                      imageUrl: sig2File ? URL.createObjectURL(sig2File) : sig2PreviewUrl,
                      x: sig2X,
                      y: sig2Y,
                      width: sig2W,
                      height: sig2H
                    } : null}
                    onChange={handleEditorChange}
                  />
                </div>
              ) : (
                <div style={{ flex: 1, border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, color: 'var(--text-secondary)', minHeight: 400 }}>
                  <FileSpreadsheet size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                  <p style={{ textAlign: 'center', fontSize: '0.9rem' }}>Carregue uma imagem de fundo (fundo do certificado) na barra lateral de propriedades para iniciar o design visual.</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="glass-card" style={{ padding: 20 }}>
                <h4 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 12, borderBottom: '1px solid var(--border-color)', paddingBottom: 8 }}>Propriedades do Layout</h4>
                
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Nome Interno</label>
                  <input type="text" className="form-input" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Ex: Certificado Evento 2026" required />
                </div>
                
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Descrição</label>
                  <textarea className="form-input" style={{ height: 60, fontSize: '0.8rem' }} value={templateDesc} onChange={e => setTemplateDesc(e.target.value)} placeholder="Opcional..." />
                </div>

                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Imagem de Fundo (PNG/JPG)</label>
                  <input type="file" accept="image/png, image/jpeg, image/jpg" onChange={e => e.target.files?.[0] && setBgFile(e.target.files[0])} style={{ fontSize: '0.8rem', width: '100%' }} required={!editingTemplate.id} />
                </div>
              </div>

              <div className="glass-card" style={{ padding: 20 }}>
                <h4 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 12, borderBottom: '1px solid var(--border-color)', paddingBottom: 8 }}>Estilo do Campo Nome</h4>
                
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Família de Fonte</label>
                  <select className="form-select" value={nameFont} onChange={e => setNameFont(e.target.value)} style={{ fontSize: '0.8rem' }}>
                    <option value="Roboto-Regular">Roboto Regular (Sem serifa)</option>
                    <option value="Roboto-Medium">Roboto Medium (Sem serifa Médio)</option>
                    <option value="Montserrat-Regular">Montserrat Regular (Limpo)</option>
                    <option value="Montserrat-Bold">Montserrat Negrito</option>
                    <option value="AlexBrush-Regular">Alex Brush (Cursiva/Caligrafia)</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Tamanho Fonte</label>
                    <input type="number" className="form-input" value={nameSize} onChange={e => setNameSize(Number(e.target.value))} style={{ fontSize: '0.8rem' }} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Cor Fonte</label>
                    <input type="color" value={nameColor} onChange={e => setNameColor(e.target.value)} style={{ width: '100%', height: 38, padding: 2, background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }} />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Alinhamento Texto</label>
                  <select className="form-select" value={nameAlign} onChange={e => setNameAlign(e.target.value as any)} style={{ fontSize: '0.8rem' }}>
                    <option value="center">Centralizado</option>
                    <option value="left">Esquerda</option>
                    <option value="right">Direita</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Transformação de Texto</label>
                  <select className="form-select" value={nameTransform} onChange={e => setNameTransform(e.target.value as any)} style={{ fontSize: '0.8rem' }}>
                    <option value="none">Nenhuma (Como na planilha)</option>
                    <option value="uppercase">Tudo Maiúsculo (Caixa Alta)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Tamanho Mínimo (Autoscale)</label>
                  <input type="number" className="form-input" value={nameMinSize} onChange={e => setNameMinSize(Number(e.target.value))} style={{ fontSize: '0.8rem' }} />
                </div>
              </div>

              <div className="glass-card" style={{ padding: 20 }}>
                <h4 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 12, borderBottom: '1px solid var(--border-color)', paddingBottom: 8 }}>Assinaturas Adicionais</h4>
                
                <div style={{ marginBottom: 16, borderBottom: '1px dashed var(--border-color)', paddingBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={sig1Active} onChange={e => setSig1Active(e.target.checked)} style={{ accentColor: 'var(--primary)' }} /> Ativar Assinatura 1
                  </label>
                  {sig1Active && (
                    <div style={{ marginTop: 8 }}>
                      <input type="file" accept="image/png" onChange={e => e.target.files?.[0] && setSig1File(e.target.files[0])} style={{ fontSize: '0.75rem', width: '100%' }} />
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={sig2Active} onChange={e => setSig2Active(e.target.checked)} style={{ accentColor: 'var(--primary)' }} /> Ativar Assinatura 2
                  </label>
                  {sig2Active && (
                    <div style={{ marginTop: 8 }}>
                      <input type="file" accept="image/png" onChange={e => e.target.files?.[0] && setSig2File(e.target.files[0])} style={{ fontSize: '0.75rem', width: '100%' }} />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={handleRealPreview} disabled={previewLoading || actionLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {previewLoading ? <Loader2 className="animate-spin" size={16} /> : <Award size={16} />} Testar Preview Real PDF
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading || previewLoading}>
                  {actionLoading ? 'Salvando...' : 'Salvar Layout'}
                </button>
              </div>
            </div>
          </form>

          {previewPdfBase64 && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', flexDirection: 'column', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Visualização Real do PDF Gerado</h4>
                <button className="btn btn-secondary" onClick={() => setPreviewPdfBase64(null)} style={{ padding: '6px 12px' }}>Fechar</button>
              </div>
              <iframe 
                src={`data:application/pdf;base64,${previewPdfBase64}`} 
                style={{ flex: 1, border: 'none', borderRadius: 'var(--radius-md)', background: 'white' }} 
              />
            </div>
          )}
        </div>
      )}

      {subTab === 'list-batches' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Lotes de Certificados</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Gere e gerencie remessas de certificados em massa</p>
            </div>
            <button className="btn btn-primary" onClick={handleNewBatch} disabled={templates.length === 0}>
              <Plus size={16} /> Novo Lote
            </button>
          </div>

          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>Nome do Lote</th>
                  <th style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>Template Layout</th>
                  <th style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>Status Lote</th>
                  <th style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>Progresso</th>
                  <th style={{ padding: '16px 20px', color: 'var(--text-secondary)', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(bt => {
                  const processed = bt.generatedCount + bt.failedCount;
                  const percent = bt.totalRows > 0 ? Math.min(100, Math.round((processed / bt.totalRows) * 100)) : 0;
                  
                  return (
                    <tr key={bt.id} style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }} onClick={() => handleSelectBatch(bt.id)}>
                      <td style={{ padding: '16px 20px', fontWeight: 600, color: 'var(--text-primary)' }}>{bt.name}</td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>{bt.template.name} (v{bt.templateVersion.version})</td>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{
                          display: 'inline-flex',
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: bt.status === 'GENERATED' ? 'var(--success-bg)' : bt.status === 'GENERATING' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
                          color: bt.status === 'GENERATED' ? 'var(--success)' : bt.status === 'GENERATING' ? 'var(--info)' : 'var(--text-secondary)'
                        }}>
                          {bt.status === 'GENERATED' ? 'Concluído' : bt.status === 'GENERATING' ? 'Gerando...' : bt.status === 'PARTIALLY_GENERATED' ? 'Concluído c/ erros' : 'Pendente'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ width: 120 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4, color: 'var(--text-secondary)' }}>
                            <span>{processed}/{bt.totalRows}</span>
                            <span>{percent}%</span>
                          </div>
                          <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${percent}%`, height: '100%', background: bt.status === 'GENERATED' ? 'var(--success)' : 'var(--primary)', transition: 'width 0.3s ease' }}></div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          <button className="btn btn-secondary" onClick={() => handleSelectBatch(bt.id)} style={{ padding: '6px 10px', fontSize: '0.8rem' }}>Detalhes</button>
                          <button className="btn btn-danger" onClick={() => handleDeleteBatch(bt.id)} style={{ padding: '6px 10px' }}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {batches.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Nenhum lote de certificados criado ainda. Clique em "Novo Lote" para iniciar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'new-batch' && (
        <div>
          <button className="btn btn-secondary" onClick={() => setSubTab('list-batches')} style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={16} /> Voltar
          </button>

          <form onSubmit={handleSaveBatch} style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
            <div className="glass-card" style={{ padding: 28 }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: 20, fontWeight: 600 }}>Configuração de Ingestão do Lote</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div className="form-group">
                  <label className="form-label">Nome do Lote</label>
                  <input type="text" className="form-input" value={batchName} onChange={e => setBatchName(e.target.value)} placeholder="Ex: Lote Congresso Odonto" required />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Selecionar Template Layout</label>
                  <select className="form-select" value={selectedTemplateId} onChange={e => {
                    setSelectedTemplateId(e.target.value);
                    const tpl = templates.find(t => t.id === e.target.value);
                    const lastVer = tpl?.versions?.[0];
                    if (lastVer) setSelectedVersionId(lastVer.id);
                  }}>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} (v{t.versions?.[0]?.version || 1})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Planilha de Participantes (.xlsx)</label>
                <input type="file" accept=".xlsx" onChange={handleXlsxUpload} style={{ display: 'block', width: '100%' }} required />
              </div>

              {headers.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-color)', marginTop: 24, paddingTop: 20 }}>
                  <h4 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 16, color: 'var(--text-primary)' }}>Mapeamento de Colunas da Planilha</h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Coluna de NOME</label>
                      <select className="form-select" value={mappedNameCol} onChange={e => setMappedNameCol(e.target.value)} required>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Coluna de E-MAIL (Opcional)</label>
                      <select className="form-select" value={mappedEmailCol} onChange={e => setMappedEmailCol(e.target.value)}>
                        <option value="">-- Ignorar/Não enviar --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Coluna de ID (Opcional)</label>
                      <select className="form-select" value={mappedIdCol} onChange={e => setMappedIdCol(e.target.value)}>
                        <option value="">-- Auto-gerado --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Padrão de Nome de Arquivo PDF</label>
                    <input type="text" className="form-input" value={filenamePattern} onChange={e => setFilenamePattern(e.target.value)} placeholder="Ex: {id}-{nome-normalizado}" required />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Tags aceitas: {"{id}"}, {"{nome-normalizado}"}, {"{linha}"}</span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="glass-card" style={{ padding: 20 }}>
                <h4 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 12, borderBottom: '1px solid var(--border-color)', paddingBottom: 8 }}>Pré-Visualização do Lote</h4>
                
                {sheetRows.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Total de linhas detectadas:</span>
                      <span style={{ fontWeight: 600 }}>{sheetRows.length}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Nomes mapeados:</span>
                      <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                        {sheetRows.filter(r => mappedNameCol && String(r[mappedNameCol] || '').trim()).length}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Pessoas sem e-mail:</span>
                      <span style={{ fontWeight: 600, color: 'var(--warning)' }}>
                        {sheetRows.filter(r => !mappedEmailCol || !String(r[mappedEmailCol] || '').trim()).length}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Erros de Nome Ausente:</span>
                      <span style={{ fontWeight: 600, color: 'var(--danger)' }}>
                        {sheetRows.filter(r => !mappedNameCol || !String(r[mappedNameCol] || '').trim()).length}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Faça o upload do Excel para ver as estatísticas rápidas.</p>
                )}
              </div>

              <button type="submit" className="btn btn-primary" disabled={actionLoading || sheetRows.length === 0}>
                {actionLoading ? 'Aguarde...' : 'Criar Lote e Importar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {subTab === 'batch-details' && batchDetails && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <button className="btn btn-secondary" onClick={() => setSubTab('list-batches')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={16} /> Voltar aos lotes
            </button>
            
            <div style={{ display: 'flex', gap: 8 }}>
              {batchDetails.status === 'GENERATING' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--info)' }}>
                  <Loader2 className="animate-spin" size={16} /> Processando lote em background...
                </div>
              ) : (
                <>
                  <button className="btn btn-primary" onClick={handleStartBatchGeneration} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={16} /> {batchDetails.generatedCount > 0 ? 'Regenerar Todo o Lote' : 'Gerar Certificados (PDF)'}
                  </button>
                  {batchDetails.failedCount > 0 && (
                    <button className="btn btn-warning" onClick={handleRetryFailed} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={16} /> Tentar Novamente Falhas ({batchDetails.failedCount})
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Registros</span>
              <h4 style={{ fontSize: '2rem', fontWeight: 700, marginTop: 4 }}>{batchDetails.totalRows}</h4>
            </div>
            <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Certificados Gerados</span>
              <h4 style={{ fontSize: '2rem', fontWeight: 700, marginTop: 4, color: 'var(--success)' }}>{batchDetails.generatedCount}</h4>
            </div>
            <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Erros de Geração</span>
              <h4 style={{ fontSize: '2rem', fontWeight: 700, marginTop: 4, color: 'var(--danger)' }}>{batchDetails.failedCount}</h4>
            </div>
            <div className="glass-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Campanha Disparo</span>
              {batchDetails.campaignId ? (
                <span style={{ fontSize: '0.9rem', color: 'var(--success)', fontWeight: 600, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={14} /> Vinculada
                </span>
              ) : (
                <button className="btn btn-secondary" onClick={() => {
                  setCampName('Campanha - ' + batchDetails.name);
                  setShowCampaignModal(true);
                }} disabled={batchDetails.generatedCount === 0 || batchDetails.status === 'GENERATING'} style={{ padding: '4px 10px', fontSize: '0.75rem', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Mail size={12} /> Criar Campanha
                </button>
              )}
            </div>
          </div>

          <div className="glass-card" style={{ padding: 20, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ fontWeight: 600, fontSize: '1rem' }}>Downloads e Exportações do Lote</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 2 }}>Baixe arquivos compilados em lote ou relatórios de auditoria</p>
            </div>
            
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => handleDownloadZip('all')} disabled={batchDetails.generatedCount === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                <FileArchive size={16} /> Baixar ZIP Completo
              </button>
              <button className="btn btn-secondary" onClick={() => handleDownloadZip('no-email')} disabled={batchDetails.generatedCount === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                <FileArchive size={16} /> ZIP Sem E-mail
              </button>
              <button className="btn btn-secondary" onClick={handleDownloadCsv} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                <Download size={16} /> Relatório CSV
              </button>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h4 style={{ fontWeight: 600 }}>Tabela de Participantes</h4>
              
              <div style={{ display: 'flex', gap: 12, width: 440 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input type="text" className="form-input" style={{ paddingLeft: 36, fontSize: '0.8rem', height: 38 }} placeholder="Buscar por nome, e-mail ou arquivo..." value={batchSearch} onChange={e => setBatchSearch(e.target.value)} />
                </div>
                
                <select className="form-select" style={{ width: 160, fontSize: '0.8rem', height: 38 }} value={batchFilter} onChange={e => setBatchFilter(e.target.value as any)}>
                  <option value="all">Todos</option>
                  <option value="generated">Gerados</option>
                  <option value="failed">Falhas</option>
                  <option value="no-email">Sem e-mail</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: 12, color: 'var(--text-secondary)' }}>Linha</th>
                    <th style={{ padding: 12, color: 'var(--text-secondary)' }}>Participante</th>
                    <th style={{ padding: 12, color: 'var(--text-secondary)' }}>E-mail</th>
                    <th style={{ padding: 12, color: 'var(--text-secondary)' }}>Nome Arquivo PDF</th>
                    <th style={{ padding: 12, color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {batchDetails.certificates
                    .filter((c: any) => {
                      if (batchFilter === 'generated' && c.status !== 'GENERATED') return false;
                      if (batchFilter === 'failed' && c.status !== 'FAILED') return false;
                      if (batchFilter === 'no-email' && c.email) return false;

                      if (batchSearch) {
                        const s = batchSearch.toLowerCase();
                        const mName = c.participantName.toLowerCase().includes(s);
                        const mEmail = (c.email || '').toLowerCase().includes(s);
                        const mFile = c.filename.toLowerCase().includes(s);
                        return mName || mEmail || mFile;
                      }
                      return true;
                    })
                    .map((c: any) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: 12, color: 'var(--text-muted)' }}>{c.sourceRow}</td>
                        <td style={{ padding: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{c.participantName}</td>
                        <td style={{ padding: 12, color: c.email ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{c.email || 'Sem e-mail'}</td>
                        <td style={{ padding: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{c.filename}</td>
                        <td style={{ padding: 12 }}>
                          <span style={{
                            display: 'inline-flex',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: c.status === 'GENERATED' ? 'var(--success-bg)' : c.status === 'FAILED' ? 'var(--danger-bg)' : 'rgba(255,255,255,0.03)',
                            color: c.status === 'GENERATED' ? 'var(--success)' : c.status === 'FAILED' ? 'var(--danger)' : 'var(--text-secondary)'
                          }}>
                            {c.status === 'GENERATED' ? 'Gerado' : c.status === 'FAILED' ? 'Falhou' : c.status === 'GENERATING' ? 'Gerando...' : 'Pendente'}
                          </span>
                          {c.errorMessage && (
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--danger)', marginTop: 2 }}>{c.errorMessage}</span>
                          )}
                        </td>
                        <td style={{ padding: 12, textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                            <button className="btn btn-secondary" onClick={() => {
                              setRegenerateCertId(c.id);
                              setRegenerateName(c.participantName);
                            }} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>Corrigir/Gerar</button>
                            
                            <button className="btn btn-secondary" onClick={() => handleDownloadIndividual(c.id, c.filename)} disabled={c.status !== 'GENERATED'} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                              <Download size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {regenerateCertId && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form onSubmit={handleRegenerateCert} className="glass-card" style={{ padding: 28, width: 420 }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Corrigir Nome & Regenerar Certificado</h4>
            
            <div className="form-group">
              <label className="form-label">Nome do Participante</label>
              <input type="text" className="form-input" value={regenerateName} onChange={e => setRegenerateName(e.target.value)} required />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRegenerateCertId(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={actionLoading}>{actionLoading ? 'Salvando...' : 'Salvar e Gerar'}</button>
            </div>
          </form>
        </div>
      )}

      {showCampaignModal && batchDetails && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form onSubmit={handleCreateCampaign} className="glass-card" style={{ padding: 28, width: 500 }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Criar Campanha de Envio SMTP</h4>
            
            <div className="form-group">
              <label className="form-label">Nome da Campanha</label>
              <input type="text" className="form-input" value={campName} onChange={e => setCampName(e.target.value)} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Template de E-mail</label>
                <select className="form-select" value={campTemplateId} onChange={e => setCampTemplateId(e.target.value)} required>
                  {emailTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Configuração SMTP</label>
                <select className="form-select" value={campSmtpId} onChange={e => setCampSmtpId(e.target.value)} required>
                  {smtpConfigs.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Modo de Cadência</label>
                <select className="form-select" value={campSendingMode} onChange={e => setCampSendingMode(e.target.value)}>
                  <option value="IMMEDIATE">Imediato (Immediate)</option>
                  <option value="FIXED">Fixo (Fixed Delay)</option>
                  <option value="RANDOM">Aleatório (Random Interval)</option>
                </select>
              </div>

              {campSendingMode !== 'IMMEDIATE' && (
                <div className="form-group">
                  <label className="form-label">Delay Mínimo (ms)</label>
                  <input type="number" className="form-input" value={campMinDelay} onChange={e => setCampMinDelay(Number(e.target.value))} />
                </div>
              )}
            </div>

            {campSendingMode === 'RANDOM' && (
              <div className="form-group">
                <label className="form-label">Delay Máximo (ms)</label>
                <input type="number" className="form-input" value={campMaxDelay} onChange={e => setCampMaxDelay(Number(e.target.value))} />
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: 12, paddingTop: 16 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 12 }}>
                Participantes no Lote: **{batchDetails.totalRows}** | Gerados com Sucesso: **{batchDetails.generatedCount}**
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--warning)', display: 'block', marginBottom: 16 }}>
                ⚠️ Apenas os certificados gerados com sucesso e que possuem e-mail válido serão incluídos na campanha de disparo.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCampaignModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={actionLoading}>{actionLoading ? 'Salvando...' : 'Criar e Disparar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
