import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/api/track',
  '/api/cron',
];

async function verifySessionSignature(cookieValue: string, secret: string): Promise<boolean> {
  try {
    const parts = cookieValue.split(':');
    if (parts.length !== 4) return false;
    const [userId, email, expiresStr, signature] = parts;
    
    const expires = parseInt(expiresStr, 10);
    if (isNaN(expires) || expires < Date.now()) {
      return false;
    }

    const payloadString = `${userId}:${email}:${expiresStr}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(payloadString);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBuffer = await crypto.subtle.sign('HMAC', key, messageData);
    const expectedSignature = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return signature === expectedSignature;
  } catch (e) {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permite arquivos estáticos e de otimização de imagens do Next.js
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/public') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some(path => pathname.startsWith(path));
  const sessionCookie = request.cookies.get('auth_session');

  const secret = process.env.AES_SECRET || 'default-session-secret-key-at-least-32-chars-long';
  const isValid = sessionCookie ? await verifySessionSignature(sessionCookie.value, secret) : false;

  if (!isValid && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isValid && pathname === '/login') {
    const homeUrl = new URL('/', request.url);
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Roda em todas as rotas exceto arquivos estáticos explícitos
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
