"use server";

import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';

export async function getSmtpConfigs() {
  try {
    const configs = await prisma.smtpConfig.findMany({
      orderBy: { createdAt: 'desc' },
    });
    // Omitimos a senha por segurança na listagem
    return configs.map(c => ({ ...c, pass: '••••••••' }));
  } catch (error: any) {
    throw new Error('Erro ao listar SMTPs: ' + error.message);
  }
}

export async function saveSmtpConfig(data: {
  id?: string;
  name: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}) {
  try {
    const encryptedPassword = data.pass === '••••••••' && data.id
      ? undefined // Mantém a senha existente se não foi alterada
      : encrypt(data.pass);

    const payload: any = {
      name: data.name,
      host: data.host,
      port: Number(data.port),
      user: data.user,
      secure: data.secure,
    };

    if (encryptedPassword) {
      payload.pass = encryptedPassword;
    }

    if (data.id) {
      const updated = await prisma.smtpConfig.update({
        where: { id: data.id },
        data: payload,
      });
      return { success: true, config: { ...updated, pass: '••••••••' } };
    } else {
      // Se for a primeira configuração, já define como ativa
      const count = await prisma.smtpConfig.count();
      payload.active = count === 0;

      const created = await prisma.smtpConfig.create({
        data: payload,
      });
      return { success: true, config: { ...created, pass: '••••••••' } };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function setActiveSmtpConfig(id: string) {
  try {
    await prisma.$transaction([
      prisma.smtpConfig.updateMany({
        data: { active: false },
      }),
      prisma.smtpConfig.update({
        where: { id },
        data: { active: true },
      }),
    ]);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteSmtpConfig(id: string) {
  try {
    await prisma.smtpConfig.delete({
      where: { id },
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function testSmtpConnection(data: {
  id?: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}) {
  try {
    let passwordToTest = data.pass;

    if (data.pass === '••••••••' && data.id) {
      const existing = await prisma.smtpConfig.findUnique({
        where: { id: data.id },
      });
      if (existing) {
        passwordToTest = decrypt(existing.pass);
      }
    }

    const transporter = nodemailer.createTransport({
      host: data.host,
      port: Number(data.port),
      secure: data.secure,
      auth: {
        user: data.user,
        pass: passwordToTest,
      },
    });

    await transporter.verify();
    return { success: true, message: 'Conexão SMTP validada com sucesso!' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Falha ao autenticar no servidor SMTP' };
  }
}
