"use client";

import { useState, useTransition } from 'react';
import SmtpPanel from '@/components/SmtpPanel';
import TemplatePanel from '@/components/TemplatePanel';
import UploadPanel from '@/components/UploadPanel';
import CampaignPanel from '@/components/CampaignPanel';
import { Mail, LayoutDashboard, FileText, Send, Settings, ShieldAlert, LogOut } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { useRouter } from 'next/navigation';

type TabType = 'dashboard' | 'upload' | 'templates' | 'smtp';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [newCampaignId, setNewCampaignId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCampaignCreated(campaignId: string) {
    setNewCampaignId(campaignId);
    setActiveTab('dashboard');
  }

  function handleClearCampaignId() {
    setNewCampaignId(null);
  }

  function handleLogout() {
    if (confirm('Deseja realmente sair?')) {
      startTransition(async () => {
        const res = await logoutAction();
        if (res.success) {
          router.push('/login');
          router.refresh();
        }
      });
    }
  }

  return (
    <main className="container">
      {/* Header */}
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="logo-container">
          <div style={{
            background: 'var(--primary-gradient)',
            padding: 10,
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
          }}>
            <Mail size={24} color="white" />
          </div>
          <div>
            <h1 className="logo-text">Web Bulk Mailer</h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: 0.5 }}>
              DISPARADOR DE E-MAILS DE ALTA PERFORMANCE
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-color)',
            borderRadius: '9999px',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)'
          }}>
            <div style={{ width: 8, height: 8, background: 'var(--success)', borderRadius: '50%' }}></div>
            <span>Hospedagem Ativa</span>
          </div>

          <button
            onClick={handleLogout}
            disabled={isPending}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '9999px',
              fontSize: '0.82rem',
              color: '#f87171',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
            }}
          >
            <LogOut size={14} />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="layout-grid">
        {/* Sidebar */}
        <aside className="glass-card" style={{ padding: 20, height: 'fit-content' }}>
          <div className="nav-menu">
            <button 
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard size={18} />
              Dashboard
            </button>
            <button 
              className={`nav-item ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <Send size={18} />
              Novo Disparo
            </button>
            <button 
              className={`nav-item ${activeTab === 'templates' ? 'active' : ''}`}
              onClick={() => setActiveTab('templates')}
            >
              <FileText size={18} />
              Templates
            </button>
            <button 
              className={`nav-item ${activeTab === 'smtp' ? 'active' : ''}`}
              onClick={() => setActiveTab('smtp')}
            >
              <Settings size={18} />
              SMTP Config
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <section className="glass-card" style={{ padding: 32, minHeight: 500 }}>
          {activeTab === 'dashboard' && (
            <CampaignPanel 
              initialCampaignId={newCampaignId} 
              onClearInitialId={handleClearCampaignId} 
            />
          )}
          {activeTab === 'upload' && (
            <UploadPanel onCampaignCreated={handleCampaignCreated} />
          )}
          {activeTab === 'templates' && (
            <TemplatePanel />
          )}
          {activeTab === 'smtp' && (
            <SmtpPanel />
          )}
        </section>
      </div>
    </main>
  );
}
