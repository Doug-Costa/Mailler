"use client";

import { useState, useEffect } from 'react';
import { getTemplates, saveTemplate, deleteTemplate } from '@/app/actions/template';
import { FileText, Plus, Trash2, Edit3, Loader2, Info } from 'lucide-react';

export default function TemplatePanel() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const data = await getTemplates();
      setTemplates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(tpl: any) {
    setEditingTemplate(tpl);
    setName(tpl.name);
    setSubject(tpl.subject);
    setBody(tpl.body);
  }

  function handleNew() {
    setEditingTemplate({});
    setName('');
    setSubject('');
    setBody(`<h2>Olá {{Nome}},</h2>
<p>Escreva o corpo do seu e-mail aqui. Você pode usar qualquer coluna da sua planilha como variável usando o padrão duplo de chaves, exemplo: <strong>{{Nome}}</strong>, <strong>{{Empresa}}</strong>.</p>
<p>Atenciosamente,<br>Sua Equipe</p>`);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await saveTemplate({
        id: editingTemplate?.id,
        name,
        subject,
        body,
      });
      if (res.success) {
        setEditingTemplate(null);
        await loadTemplates();
      } else {
        alert(res.error || 'Erro ao salvar template');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja realmente remover este template?')) return;
    try {
      const res = await deleteTemplate(id);
      if (res.success) {
        await loadTemplates();
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
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Templates de E-mail</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
            Crie templates dinâmicos em HTML utilizando tags de sua planilha
          </p>
        </div>
        {!editingTemplate && (
          <button className="btn btn-primary" onClick={handleNew}>
            <Plus size={18} /> Novo Template
          </button>
        )}
      </div>

      {editingTemplate ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Form Editor */}
          <form onSubmit={handleSave} className="glass-card" style={{ padding: 28 }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: 20 }}>
              {editingTemplate.id ? 'Editar Template' : 'Criar Template'}
            </h3>

            <div className="form-group">
              <label className="form-label">Nome do Template</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Ex: Boas-vindas Clientes" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label font-bold">Assunto do E-mail</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Assunto (aceita tags ex: Olá {{Nome}}!)" 
                value={subject} 
                onChange={e => setSubject(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Corpo do E-mail (HTML)</label>
              <textarea 
                className="form-input" 
                style={{ height: 280, fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}
                value={body} 
                onChange={e => setBody(e.target.value)} 
                required 
              />
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: 12,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.15)',
              color: '#93c5fd',
              fontSize: '0.82rem',
              lineHeight: '1.4',
              marginBottom: 20
            }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                Dica: O editor aceita tags HTML como <code>&lt;strong&gt;</code>, <code>&lt;h2&gt;</code>, <code>&lt;p&gt;</code>, etc. Use <code>{"{{Nome}}"}</code> para interpolar os dados de cada linha de sua planilha.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setEditingTemplate(null)}
                disabled={actionLoading}
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={actionLoading}
              >
                {actionLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>

          {/* HTML Live Preview */}
          <div className="glass-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: 20 }}>Visualização Prévia</h3>
            
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 4 }}>Assunto:</div>
              <div style={{ fontWeight: 600, padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                {subject ? subject.replace(/\{\{\s*Nome\s*\}\}/g, 'João da Silva') : 'Sem Assunto'}
              </div>
            </div>

            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 4 }}>Conteúdo:</div>
              <div 
                style={{ 
                  background: 'white', 
                  color: '#1e293b', 
                  padding: 20, 
                  borderRadius: 'var(--radius-md)', 
                  border: '1px solid var(--border-color)',
                  minHeight: 280,
                  overflowY: 'auto'
                }}
                dangerouslySetInnerHTML={{ 
                  __html: body.replace(/\{\{\s*Nome\s*\}\}/g, 'João da Silva') 
                }} 
              />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {templates.length === 0 ? (
            <div className="glass-card" style={{ padding: 40, textAlign: 'center', gridColumn: '1 / -1' }}>
              <FileText size={48} style={{ margin: '0 auto 16px', color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-secondary)' }}>Nenhum template de e-mail cadastrado.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleNew}>
                Criar Primeiro Template
              </button>
            </div>
          ) : (
            templates.map((tpl) => (
              <div 
                key={tpl.id} 
                className="glass-card" 
                style={{ 
                  padding: 20, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h4 style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: 6 }}>{tpl.name}</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 12 }}>
                    <strong>Assunto:</strong> {tpl.subject}
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 20 }}>
                    {tpl.body.replace(/<[^>]*>/g, '')}
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: 8 }} 
                    onClick={() => handleEdit(tpl)}
                    title="Editar"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button 
                    className="btn btn-danger" 
                    style={{ padding: 8 }} 
                    onClick={() => handleDelete(tpl.id)}
                    title="Remover"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
