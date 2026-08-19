"use client";

import { useState, useEffect } from 'react';
import { getSmtpConfigs, saveSmtpConfig, setActiveSmtpConfig, deleteSmtpConfig, testSmtpConnection } from '@/app/actions/smtp';
import { Mail, Shield, Plus, Check, Trash2, Edit3, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

export default function SmtpPanel() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingConfig, setEditingConfig] = useState<any | null>(null);
  
  // Form states
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [secure, setSecure] = useState(false);
  
  const [testStatus, setTestStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    try {
      const data = await getSmtpConfigs();
      setConfigs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(config: any) {
    setEditingConfig(config);
    setName(config.name);
    setHost(config.host);
    setPort(config.port);
    setUser(config.user);
    setPass(config.pass); // Default placeholder '••••••••'
    setSecure(config.secure);
    setTestStatus(null);
  }

  function handleNew() {
    setEditingConfig({});
    setName('');
    setHost('');
    setPort(587);
    setUser('');
    setPass('');
    setSecure(false);
    setTestStatus(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await saveSmtpConfig({
        id: editingConfig?.id,
        name,
        host,
        port,
        user,
        pass,
        secure,
      });
      if (res.success) {
        setEditingConfig(null);
        await loadConfigs();
      } else {
        alert(res.error || 'Erro ao salvar SMTP');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTest() {
    setTestingConnection(true);
    setTestStatus(null);
    try {
      const res = await testSmtpConnection({
        id: editingConfig?.id,
        host,
        port,
        user,
        pass,
        secure,
      });
      if (res.success) {
        setTestStatus({ success: true, message: res.message });
      } else {
        setTestStatus({ success: false, message: res.error });
      }
    } catch (err: any) {
      setTestStatus({ success: false, message: err.message });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleActivate(id: string) {
    try {
      const res = await setActiveSmtpConfig(id);
      if (res.success) {
        await loadConfigs();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja realmente remover esta configuração SMTP?')) return;
    try {
      const res = await deleteSmtpConfig(id);
      if (res.success) {
        await loadConfigs();
      }
    } catch (err) {
      console.error(err);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Servidores SMTP</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
            Gerencie e teste suas credenciais de disparo de e-mails
          </p>
        </div>
        {!editingConfig && (
          <button className="btn btn-primary" onClick={handleNew}>
            <Plus size={18} /> Novo SMTP
          </button>
        )}
      </div>

      {editingConfig ? (
        <form onSubmit={handleSave} className="glass-card" style={{ padding: 28, maxWidth: 650 }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: 20 }}>
            {editingConfig.id ? 'Editar Servidor SMTP' : 'Novo Servidor SMTP'}
          </h3>

          <div className="form-group">
            <label className="form-label">Nome de Exibição (Remetente)</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Ex: Comercial - Minha Empresa" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Host SMTP</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Ex: smtp.hostinger.com" 
                value={host} 
                onChange={e => setHost(e.target.value)} 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Porta</label>
              <input 
                type="number" 
                className="form-input" 
                value={port} 
                onChange={e => setPort(Number(e.target.value))} 
                required 
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Usuário / E-mail</label>
            <input 
              type="email" 
              className="form-input" 
              placeholder="usuario@dominio.com" 
              value={user} 
              onChange={e => setUser(e.target.value)} 
              required 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Senha</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder={editingConfig.id ? '••••••••' : 'Senha do SMTP'} 
              value={pass} 
              onChange={e => setPass(e.target.value)} 
              required={!editingConfig.id} 
            />
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0' }}>
            <input 
              type="checkbox" 
              id="secure" 
              checked={secure} 
              onChange={e => setSecure(e.target.checked)} 
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <label htmlFor="secure" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
              Conexão Segura (SSL/TLS / Porta 465)
            </label>
          </div>

          {testStatus && (
            <div style={{
              padding: 14,
              borderRadius: 'var(--radius-md)',
              backgroundColor: testStatus.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${testStatus.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
              color: testStatus.success ? '#6ee7b7' : '#fca5a5',
              fontSize: '0.9rem',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              {testStatus.success ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
              <span>{testStatus.message}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={handleTest}
              disabled={testingConnection || actionLoading || !host || !user || (!pass && !editingConfig.id)}
            >
              {testingConnection ? (
                <>
                  <Loader2 className="animate-spin" size={18} /> Testando...
                </>
              ) : (
                'Testar Conexão'
              )}
            </button>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => setEditingConfig(null)}
              disabled={actionLoading}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={actionLoading || testingConnection}
            >
              {actionLoading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 20 }}>
          {configs.length === 0 ? (
            <div className="glass-card" style={{ padding: 40, textAlign: 'center', gridColumn: '1 / -1' }}>
              <Mail size={48} style={{ margin: '0 auto 16px', color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-secondary)' }}>Nenhum servidor SMTP cadastrado.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleNew}>
                Cadastrar Primeiro SMTP
              </button>
            </div>
          ) : (
            configs.map((config) => (
              <div 
                key={config.id} 
                className="glass-card" 
                style={{ 
                  padding: 20, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  borderLeft: config.active ? '4px solid var(--primary)' : '1px solid var(--border-color)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h4 style={{ fontWeight: 600, fontSize: '1.05rem' }}>{config.name}</h4>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{config.host}:{config.port}</span>
                    </div>
                    {config.active && (
                      <span className="badge badge-completed" style={{ gap: 4 }}>
                        <Check size={12} /> Ativo
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
                    <Shield size={14} />
                    <span>{config.secure ? 'SSL/TLS ativado' : 'Sem criptografia (STARTTLS)'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                  {!config.active ? (
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => handleActivate(config.id)}
                    >
                      Ativar
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 500 }}>Configuração ativa</span>
                  )}
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: 8 }} 
                      onClick={() => handleEdit(config)}
                      title="Editar"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button 
                      className="btn btn-danger" 
                      style={{ padding: 8 }} 
                      onClick={() => handleDelete(config.id)}
                      title="Remover"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
