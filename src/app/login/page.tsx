"use client";

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Shield, Loader2 } from 'lucide-react';
import { loginAction } from '@/app/actions/auth';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = await loginAction(formData);
      if (res.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(res.error || 'Erro desconhecido');
      }
    });
  }

  return (
    <main className="container" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '40px 30px',
        boxShadow: 'var(--shadow-premium)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          marginBottom: '32px'
        }}>
          <div style={{
            background: 'var(--primary-gradient)',
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
            marginBottom: '16px'
          }}>
            <Shield size={32} color="white" />
          </div>
          <h2 style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            letterSpacing: '-0.5px',
            background: 'linear-gradient(to right, #ffffff, var(--text-secondary))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '8px'
          }}>
            Painel Administrativo
          </h2>
          <p style={{
            fontSize: '0.875rem',
            color: 'var(--text-muted)'
          }}>
            Faça login para acessar o disparador DentalGo
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: 'var(--danger-bg)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label" htmlFor="email">
              E-mail corporativo
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center'
              }}>
                <Mail size={18} />
              </span>
              <input
                id="email"
                name="email"
                type="email"
                className="form-input"
                placeholder="exemplo@dentalgo.com.br"
                required
                disabled={isPending}
                style={{ paddingLeft: '44px' }}
              />
            </div>
          </div>

          <div className="form-group" style={{ position: 'relative', marginBottom: '32px' }}>
            <label className="form-label" htmlFor="password">
              Senha de acesso
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center'
              }}>
                <Lock size={18} />
              </span>
              <input
                id="password"
                name="password"
                type="password"
                className="form-input"
                placeholder="Digite sua senha"
                required
                disabled={isPending}
                style={{ paddingLeft: '44px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending}
            style={{ width: '100%', gap: '10px' }}
          >
            {isPending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Autenticando...
              </>
            ) : (
              'Entrar no Sistema'
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
