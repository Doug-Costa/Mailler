import { NextRequest, NextResponse } from 'next/server';
import { triggerDbWorker } from '@/lib/dbWorker';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    const expectedToken = process.env.AES_SECRET || 'default-session-secret-key-at-least-32-chars-long';

    if (!token || token !== expectedToken) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado.' },
        { status: 401 }
      );
    }

    // Dispara o processador de campanhas em background
    // Não damos await aqui para liberar a resposta HTTP imediatamente e deixar rodando em background
    triggerDbWorker();

    return NextResponse.json({
      success: true,
      message: 'Worker do banco de dados disparado com sucesso.',
    });
  } catch (error: any) {
    console.error('Erro na rota do Cron:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
