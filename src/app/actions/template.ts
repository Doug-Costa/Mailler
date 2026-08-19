"use server";

import { prisma } from '@/lib/db';

export async function getTemplates() {
  try {
    return await prisma.template.findMany({
      orderBy: { createdAt: 'desc' },
    });
  } catch (error: any) {
    throw new Error('Erro ao listar templates: ' + error.message);
  }
}

export async function saveTemplate(data: {
  id?: string;
  name: string;
  subject: string;
  body: string;
}) {
  try {
    if (data.id) {
      const updated = await prisma.template.update({
        where: { id: data.id },
        data: {
          name: data.name,
          subject: data.subject,
          body: data.body,
        },
      });
      return { success: true, template: updated };
    } else {
      const created = await prisma.template.create({
        data: {
          name: data.name,
          subject: data.subject,
          body: data.body,
        },
      });
      return { success: true, template: created };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteTemplate(id: string) {
  try {
    await prisma.template.delete({
      where: { id },
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
