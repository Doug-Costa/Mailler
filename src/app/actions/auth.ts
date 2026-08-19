"use server";

import { prisma } from '@/lib/db';
import { verifyPassword, createSession, deleteSession, getSession } from '@/lib/auth';

export async function loginAction(formData: FormData) {
  try {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
      return { success: false, error: 'Por favor, preencha todos os campos.' };
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return { success: false, error: 'Credenciais inválidas.' };
    }

    const isPasswordValid = verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return { success: false, error: 'Credenciais inválidas.' };
    }

    // Cria a sessão (define o cookie)
    await createSession(user.id, user.email);

    return { success: true };
  } catch (error: any) {
    console.error('Erro na Action de Login:', error);
    return { success: false, error: 'Ocorreu um erro ao fazer login. Tente novamente.' };
  }
}

export async function logoutAction() {
  try {
    await deleteSession();
    return { success: true };
  } catch (error: any) {
    console.error('Erro na Action de Logout:', error);
    return { success: false, error: 'Erro ao deslogar.' };
  }
}

export async function getCurrentUserAction() {
  try {
    return await getSession();
  } catch (error) {
    return null;
  }
}
