"use client";

import { useState, useEffect, useCallback } from 'react';
import { 
  getCampaigns, 
  getCampaignDetails, 
  pauseCampaign, 
  resumeCampaign, 
  cancelCampaign, 
  deleteCampaign, 
  retryFailedRecipients, 
  cleanupCampaignFiles, 
  testRunCampaignRecipient 
} from '@/app/actions/campaign';
import { 
  Play, 
  Pause, 
  XCircle, 
  Trash2, 
  ChevronRight, 
  ArrowLeft, 
  RefreshCw, 
  Mail, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  Loader2, 
  FileArchive, 
  Paperclip, 
  Send,
  HelpCircle
} from 'lucide-react';

interface CampaignPanelProps {
  initialCampaignId?: string | null;
  onClearInitialId?: () => void;
}

export default function CampaignPanel({ initialCampaignId, onClearInitialId }: CampaignPanelProps) {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialCampaignId || null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Test Run modal states
  const [testLogId, setTestLogId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async (showSilent = false) => {
    if (!showSilent) setLoading(true);
    try {
      const data = await getCampaigns();
      setCampaigns(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!showSilent) setLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (id: string, showSilent = false) => {
    if (!showSilent) setDetailLoading(true);
    try {
      const details = await getCampaignDetails(id);
      setDetailData(details);
    } catch (err) {
      console.error(err);
    } finally {
      if (!showSilent) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (selectedId) {
      loadDetails(selectedId);
    } else {
      setDetailData(null);
    }
  }, [selectedId, loadDetails]);

  // Polling to update progress of active campaigns
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const hasActiveCampaigns = campaigns.some(c => c.status === 'PROCESSING');
    if (hasActiveCampaigns || selectedId) {
      interval = setInterval(() => {
        loadCampaigns(true);
        if (selectedId) {
          loadDetails(selectedId, true);
        }
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [campaigns, selectedId, loadCampaigns, loadDetails]);

  useEffect(() => {
    if (initialCampaignId) {
      setSelectedId(initialCampaignId);
      if (onClearInitialId) onClearInitialId();
    }
  }, [initialCampaignId, onClearInitialId]);

  async function handlePause(id: string) {
    setActionLoading('pause-' + id);
    try {
      const res = await pauseCampaign(id);
      if (res.success) {
        await Promise.all([loadCampaigns(true), selectedId === id ? loadDetails(id, true) : null]);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResume(id: string) {
    setActionLoading('resume-' + id);
    try {
      const res = await resumeCampaign(id);
      if (res.success) {
        await Promise.all([loadCampaigns(true), selectedId === id ? loadDetails(id, true) : null]);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel(id: string) {
    if (!confirm('Deseja realmente cancelar este disparo? Destinatários pendentes não serão enviados.')) return;
    setActionLoading('cancel-' + id);
    try {
      const res = await cancelCampaign(id);
      if (res.success) {
        await Promise.all([loadCampaigns(true), selectedId === id ? loadDetails(id, true) : null]);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja deletar esta campanha? Isso removerá todo o histórico, logs e os arquivos PDFs vinculados a ela.')) return;
    setActionLoading('delete-' + id);
    try {
      const res = await deleteCampaign(id);
      if (res.success) {
        if (selectedId === id) setSelectedId(null);
        await loadCampaigns();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRetryFailed(id: string) {
    if (!confirm('Deseja reenviar apenas os contatos que falharam? O vínculo de anexo original será mantido.')) return;
    setActionLoading('retry-' + id);
    try {
      const res = await retryFailedRecipients(id);
      if (res.success) {
        alert('Disparo de retentativa iniciado com sucesso!');
        await Promise.all([loadCampaigns(true), loadDetails(id, true)]);
      } else {
        alert(res.error || 'Erro ao tentar reenviar falhas.');
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCleanupFiles(id: string) {
    if (!confirm('ATENÇÃO: Isso excluirá permanentemente todos os arquivos PDF de certificados salvos no servidor para esta campanha (liberando espaço em disco). Apenas campanhas concluídas ou canceladas podem ser limpas. Confirmar?')) return;
    setActionLoading('cleanup-' + id);
    try {
      const res = await cleanupCampaignFiles(id);
      if (res.success) {
        alert('Arquivos excluídos com sucesso.');
        await Promise.all([loadCampaigns(true), loadDetails(id, true)]);
      } else {
        alert(res.error || 'Erro ao excluir arquivos.');
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSendTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testLogId || !testEmail) return;
    setTestSending(true);
    setTestSuccess(null);
    setTestError(null);
    try {
      const res = await testRunCampaignRecipient(testLogId, testEmail);
      if (res.success) {
        setTestSuccess('E-mail de teste enviado com sucesso!');
      } else {
        setTestError(res.error || 'Falha ao enviar e-mail de teste.');
      }
    } catch (err: any) {
      setTestError(err.message || 'Erro inesperado no envio de teste.');
    } finally {
      setTestSending(false);
    }
  }

  function getStatusBadgeClass(status: string) {
    switch (status) {
      case 'PENDING': return 'badge-pending';
      case 'PROCESSING': return 'badge-processing';
      case 'PAUSED': return 'badge-paused';
      case 'COMPLETED': return 'badge-completed';
      case 'CANCELLED': return 'badge-cancelled';
      default: return 'badge-paused';
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'PENDING': return 'Pendente';
      case 'PROCESSING': return 'Enviando';
      case 'PAUSED': return 'Pausada';
      case 'COMPLETED': return 'Concluída';
      case 'CANCELLED': return 'Cancelada';
      default: return status;
    }
  }

  if (loading && campaigns.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
        <Loader2 className="animate-spin" size={40} color="var(--primary)" />
      </div>
    );
  }

  if (selectedId && detailData) {
    const progress = detailData.totalEmails > 0 
      ? Math.round(((detailData.sentEmails + detailData.failedEmails) / detailData.totalEmails) * 100) 
      : 0;

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button className="btn btn-secondary" style={{ padding: 10 }} onClick={() => setSelectedId(null)}>
            <ArrowLeft size={18} /> Voltar
          </button>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 600 }}>{detailData.name}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 2 }}>
              ID: {detailData.id} • Criada em: {new Date(detailData.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Status Card */}
            <div className="glass-card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status da Campanha</span>
                <span className={`badge ${getStatusBadgeClass(detailData.status)}`} style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
                  {getStatusLabel(detailData.status)}
                </span>
              </div>

              {/* Progress */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: 8 }}>
                  <span>Progresso Geral ({progress}%)</span>
                  <span>{detailData.sentEmails + detailData.failedEmails} de {detailData.totalEmails} e-mails</span>
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, textAlign: 'center', margin: '20px 0' }}>
                <div style={{ padding: 16, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 4 }}>Total contatos</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{detailData.totalEmails}</div>
                </div>
                <div style={{ padding: 16, background: 'var(--success-bg)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ color: '#10b981', fontSize: '0.8rem', marginBottom: 4 }}>Enviados</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981' }}>{detailData.sentEmails}</div>
                </div>
                <div style={{ padding: 16, background: 'rgba(99, 102, 241, 0.15)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ color: '#818cf8', fontSize: '0.8rem', marginBottom: 4 }}>Aberturas</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#818cf8' }}>
                    {detailData.openedEmails} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>({detailData.sentEmails > 0 ? Math.round((detailData.openedEmails / detailData.sentEmails) * 100) : 0}%)</span>
                  </div>
                </div>
                <div style={{ padding: 16, background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: 4 }}>Falhas</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ef4444' }}>{detailData.failedEmails}</div>
                </div>
              </div>

              {/* Controller Buttons */}
              <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border-color)', paddingTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {detailData.status === 'PROCESSING' && (
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => handlePause(detailData.id)}
                    disabled={actionLoading === 'pause-' + detailData.id}
                  >
                    <Pause size={16} /> Pausar
                  </button>
                )}
                {(detailData.status === 'PAUSED' || detailData.status === 'PENDING') && (
                  <button 
                    className="btn btn-primary" 
                    onClick={() => handleResume(detailData.id)}
                    disabled={actionLoading === 'resume-' + detailData.id}
                  >
                    <Play size={16} /> {detailData.status === 'PENDING' ? 'Iniciar Disparos' : 'Retomar'}
                  </button>
                )}
                {(detailData.status === 'COMPLETED' || detailData.status === 'PAUSED' || detailData.status === 'CANCELLED') && detailData.failedEmails > 0 && (
                  <button 
                    className="btn btn-primary" 
                    style={{ background: 'var(--primary-gradient)' }}
                    onClick={() => handleRetryFailed(detailData.id)}
                    disabled={actionLoading === 'retry-' + detailData.id}
                  >
                    <RefreshCw size={16} /> Reenviar Falhas
                  </button>
                )}
                {(detailData.status === 'COMPLETED' || detailData.status === 'CANCELLED') && detailData.attachmentMode === 'INDIVIDUAL' && detailData.totalAttachments > 0 && (
                  <button 
                    className="btn btn-secondary" 
                    style={{ color: '#fca5a5' }}
                    onClick={() => handleCleanupFiles(detailData.id)}
                    disabled={actionLoading === 'cleanup-' + detailData.id}
                  >
                    <Trash2 size={16} /> Limpar PDFs
                  </button>
                )}
                {(detailData.status === 'PROCESSING' || detailData.status === 'PAUSED' || detailData.status === 'PENDING') && (
                  <button 
                    className="btn btn-danger" 
                    onClick={() => handleCancel(detailData.id)}
                    disabled={actionLoading === 'cancel-' + detailData.id}
                  >
                    <XCircle size={16} /> Cancelar Disparo
                  </button>
                )}
                <button 
                  className="btn btn-secondary" 
                  style={{ color: '#fca5a5' }}
                  onClick={() => handleDelete(detailData.id)}
                  disabled={actionLoading === 'delete-' + detailData.id}
                >
                  <Trash2 size={16} /> Excluir Campanha
                </button>
              </div>
            </div>

            {/* Recipient logs preview */}
            <div className="glass-card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Logs de Envio</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>Mostrando os primeiros 150 contatos da campanha</p>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Status em tempo real</span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: 10 }}>Destinatário</th>
                      <th style={{ padding: 10 }}>Status</th>
                      <th style={{ padding: 10 }}>Abertura</th>
                      {detailData.attachmentMode === 'INDIVIDUAL' && <th style={{ padding: 10 }}>Anexo Associado</th>}
                      <th style={{ padding: 10 }}>Data/Hora</th>
                      <th style={{ padding: 10, width: 80 }}>Teste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailData.recipients.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                          Nenhum registro de contatos encontrado.
                        </td>
                      </tr>
                    ) : (
                      detailData.recipients.map((rec: any) => (
                        <tr key={rec.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: 10 }}>
                            <div style={{ fontWeight: 600 }}>{rec.email}</div>
                            {rec.error && (
                              <div style={{ color: '#fca5a5', fontSize: '0.75rem', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rec.error}>
                                ⚠️ {rec.error}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: 10 }}>
                            {rec.status === 'SENT' ? (
                              <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle2 size={13} /> Enviado
                              </span>
                            ) : rec.status === 'FAILED' ? (
                              <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <XCircle size={13} /> Falhou
                              </span>
                            ) : rec.status === 'PROCESSING' ? (
                              <span style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Loader2 className="animate-spin" size={13} /> Processando
                              </span>
                            ) : (
                              <span style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Clock size={13} /> Aguardando
                              </span>
                            )}
                          </td>
                          <td style={{ padding: 10 }}>
                            {rec.opened ? (
                              <span style={{ color: '#818cf8', fontWeight: 600 }} title={rec.openedAt ? new Date(rec.openedAt).toLocaleString() : ''}>
                                Aberto
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>
                                Não aberto
                              </span>
                            )}
                          </td>
                          {detailData.attachmentMode === 'INDIVIDUAL' && (
                            <td style={{ padding: 10 }}>
                              {rec.attachmentOriginalName ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                    <Paperclip size={12} color="var(--primary)" />
                                    {rec.attachmentOriginalName}
                                  </div>
                                  {rec.attachmentSize && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                      {(rec.attachmentSize / 1024).toFixed(1)} KB • SHA256: {rec.attachmentSha256?.substring(0, 8)}
                                    </div>
                                  )}
                                  {rec.attachmentStatus === 'ERROR' && (
                                    <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>❌ {rec.attachmentError || 'Erro no anexo'}</span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem anexo</span>
                              )}
                            </td>
                          )}
                          <td style={{ padding: 10, color: 'var(--text-secondary)' }}>
                            {rec.sentAt ? new Date(rec.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                          </td>
                          <td style={{ padding: 10 }}>
                            {rec.status === 'PENDING' && (
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '6px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                                onClick={() => {
                                  setTestLogId(rec.id);
                                  setTestEmail(rec.email);
                                  setTestSuccess(null);
                                  setTestError(null);
                                }}
                              >
                                <Send size={12} /> Teste
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Details Sidebar info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Metadata Card */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Configuração Usada</h3>
              
              <div style={{ marginBottom: 16 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Template</span>
                <div style={{ fontWeight: 500 }}>{detailData.template?.name || 'Deletado'}</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Servidor SMTP</span>
                <div style={{ fontWeight: 500 }}>{detailData.smtpConfig?.name || 'Deletado'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{detailData.smtpConfig?.user}</div>
              </div>

              <div style={{ marginBottom: 16, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Cadência de Envio</span>
                <div style={{ fontWeight: 600, color: 'var(--primary)' }}>
                  {detailData.sendingMode === 'IMMEDIATE' && 'Imediato (Sem Delay)'}
                  {detailData.sendingMode === 'FIXED' && `Fixo (Delay de ${detailData.minDelay}ms)`}
                  {detailData.sendingMode === 'RANDOM' && `Aleatório (${detailData.minDelay}ms - ${detailData.maxDelay}ms)`}
                </div>
              </div>

              {detailData.nextCampaign && (
                <div style={{ marginBottom: 16, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Próxima Campanha (Fluxo)</span>
                  <div style={{ fontWeight: 500, color: 'var(--success)' }}>{detailData.nextCampaign.name}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 2 }}>
                    Inicia após {detailData.nextCampaignDelayMinutes} minutos do fim desta
                  </div>
                </div>
              )}
            </div>

            {/* Attachment Config Card */}
            {detailData.attachmentMode === 'INDIVIDUAL' && (
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileArchive size={18} color="var(--primary)" /> Anexos Detalhes
                </h3>

                <div style={{ marginBottom: 12 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Modo de Anexo</span>
                  <div style={{ fontWeight: 600, color: 'var(--primary)' }}>Anexo individual por destinatário</div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Coluna de Mapeamento</span>
                  <div style={{ fontWeight: 500, fontFamily: 'monospace' }}>{detailData.attachmentColumn || 'Não especificada'}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ background: 'var(--bg-input)', padding: 10, borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2 }}>ZIP PDFs</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{detailData.totalAttachments}</div>
                  </div>
                  <div style={{ background: 'var(--bg-input)', padding: 10, borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2 }}>Rejeitados</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: detailData.rejectedRecipientsCount > 0 ? '#f87171' : 'inherit' }}>{detailData.rejectedRecipientsCount}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TEST RUN MODAL */}
        {testLogId && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
          }}>
            <form onSubmit={handleSendTest} className="glass-card" style={{ padding: 28, maxWidth: 450, width: '90%', border: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Send size={18} color="var(--primary)" /> Enviar E-mail de Teste (Test Run)
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: 20 }}>
                O e-mail será enviado com as variáveis e o certificado correspondente da linha selecionada. O participante original não receberá nada.
              </p>

              <div className="form-group">
                <label className="form-label">E-mail de Destino do Teste</label>
                <input 
                  type="email" 
                  className="form-input" 
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="seu-email@exemplo.com"
                  required
                  disabled={testSending}
                />
              </div>

              {testSuccess && (
                <div style={{ color: 'var(--success)', background: 'var(--success-bg)', padding: 10, borderRadius: 'var(--radius-md)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                  <CheckCircle2 size={16} /> {testSuccess}
                </div>
              )}

              {testError && (
                <div style={{ color: '#fca5a5', background: 'var(--danger-bg)', padding: 10, borderRadius: 'var(--radius-md)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                  <AlertCircle size={16} /> {testError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setTestLogId(null)}
                  disabled={testSending}
                >
                  Fechar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ background: 'var(--primary-gradient)', display: 'flex', alignItems: 'center', gap: 6 }}
                  disabled={testSending}
                >
                  {testSending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} Enviar Teste
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Dashboard de Campanhas</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
            Monitore e gerencie o progresso dos disparos em lote da VPS
          </p>
        </div>
        <button className="btn btn-secondary" style={{ padding: 10 }} onClick={() => loadCampaigns()}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              <th style={{ padding: '16px 20px' }}>Nome da Campanha</th>
              <th style={{ padding: '16px 20px' }}>Anexos</th>
              <th style={{ padding: '16px 20px' }}>Status</th>
              <th style={{ padding: '16px 20px' }}>Progresso</th>
              <th style={{ padding: '16px 20px' }}>Sucesso / Erro</th>
              <th style={{ padding: '16px 20px' }}>Aberturas</th>
              <th style={{ padding: '16px 20px' }}>Data Criação</th>
              <th style={{ padding: '16px 20px', width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 40, textAlign: 'center' }}>
                  <Mail size={40} style={{ margin: '0 auto 12px', color: 'var(--text-muted)' }} />
                  <p style={{ color: 'var(--text-secondary)' }}>Nenhuma campanha de disparos cadastrada.</p>
                </td>
              </tr>
            ) : (
              campaigns.map((camp) => {
                const progress = camp.totalEmails > 0 
                  ? Math.round(((camp.sentEmails + camp.failedEmails) / camp.totalEmails) * 100) 
                  : 0;

                return (
                  <tr 
                    key={camp.id} 
                    style={{ 
                      borderBottom: '1px solid var(--border-color)', 
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onClick={() => setSelectedId(camp.id)}
                    className="hover-row"
                  >
                    <td style={{ padding: '18px 20px', fontWeight: 600 }}>{camp.name}</td>
                    <td style={{ padding: '18px 20px', fontSize: '0.85rem' }}>
                      {camp.attachmentMode === 'INDIVIDUAL' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontWeight: 600 }}>
                          <Paperclip size={13} /> {camp.totalAttachments} PDFs
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Sem anexos</span>
                      )}
                    </td>
                    <td style={{ padding: '18px 20px' }}>
                      <span className={`badge ${getStatusBadgeClass(camp.status)}`}>
                        {getStatusLabel(camp.status)}
                      </span>
                    </td>
                    <td style={{ padding: '18px 20px', width: 180 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="progress-bar-container" style={{ flex: 1 }}>
                          <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500, minWidth: 35 }}>{progress}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '18px 20px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--success)' }}>{camp.sentEmails}</span> / <span style={{ color: 'var(--danger)' }}>{camp.failedEmails}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}> (Total: {camp.totalEmails})</span>
                    </td>
                    <td style={{ padding: '18px 20px', fontSize: '0.9rem', color: '#818cf8', fontWeight: 600 }}>
                      {camp.openedEmails} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)' }}>({camp.sentEmails > 0 ? Math.round((camp.openedEmails / camp.sentEmails) * 100) : 0}%)</span>
                    </td>
                    <td style={{ padding: '18px 20px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                      {new Date(camp.createdAt).toLocaleDateString()} {new Date(camp.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '18px 20px', textAlign: 'right' }}>
                      <ChevronRight size={18} color="var(--text-muted)" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
