export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { ensureAdminUser, triggerDbWorker } = await import('./lib/dbWorker');
      
      // Cria o administrador padrão caso não exista
      await ensureAdminUser();
      
      // Inicializa o worker para retomar campanhas ativas/agendadas
      await triggerDbWorker();
      
      console.log('✅ [Instrumentation] Aplicação inicializada com sucesso.');
    } catch (error) {
      console.error('❌ [Instrumentation] Falha ao inicializar aplicação:', error);
    }
  }
}
