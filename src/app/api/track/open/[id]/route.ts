import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const log = await prisma.recipientLog.findUnique({
      where: { id },
      select: { opened: true, campaignId: true },
    });

    if (log && !log.opened) {
      await prisma.$transaction([
        prisma.recipientLog.update({
          where: { id },
          data: { opened: true, openedAt: new Date() },
        }),
        prisma.campaign.update({
          where: { id: log.campaignId },
          data: { openedEmails: { increment: 1 } },
        }),
      ]);
    }
  } catch (error) {
    console.error('Error tracking email open:', error);
  }

  // Retorna imagem GIF transparente de 1x1
  return new NextResponse(TRANSPARENT_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': TRANSPARENT_GIF.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
