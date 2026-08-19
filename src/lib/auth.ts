import crypto from 'crypto';
import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = 'auth_session';
const SESSION_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 dias

function getSecretKey(): string {
  return process.env.AES_SECRET || 'default-session-secret-key-at-least-32-chars-long';
}

// Hashing de Senha usando Scrypt
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const verifyHash = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
  } catch (e) {
    return false;
  }
}

// Helper para converter ArrayBuffer em Hex sem dependências
function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Assinatura HMAC-SHA256 usando Web Crypto (Edge-compatible)
async function signSessionPayload(message: string): Promise<string> {
  const secret = getSecretKey();
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoInstance = typeof window === 'undefined' ? globalThis.crypto : window.crypto;

  const key = await cryptoInstance.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await cryptoInstance.subtle.sign('HMAC', key, messageData);
  return arrayBufferToHex(signature);
}

interface SessionPayload {
  userId: string;
  email: string;
  expires: number;
}

// Cria a sessão e define o cookie HTTP-only assinado
export async function createSession(userId: string, email: string) {
  const expires = Date.now() + SESSION_EXPIRY;
  const payloadString = `${userId}:${email}:${expires}`;
  const signature = await signSessionPayload(payloadString);
  const cookieValue = `${payloadString}:${signature}`;

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    expires: new Date(expires),
    path: '/',
  });
}

// Valida a assinatura da sessão e retorna o payload ou null se for inválido/expirado
export async function getSession(directCookieValue?: string): Promise<SessionPayload | null> {
  try {
    let cookieValue = directCookieValue;
    if (!cookieValue) {
      const cookieStore = await cookies();
      const cookie = cookieStore.get(SESSION_COOKIE_NAME);
      if (!cookie) return null;
      cookieValue = cookie.value;
    }

    const parts = cookieValue.split(':');
    if (parts.length !== 4) return null;

    const [userId, email, expiresStr, signature] = parts;
    const expires = parseInt(expiresStr, 10);

    if (isNaN(expires) || expires < Date.now()) {
      return null;
    }

    const payloadString = `${userId}:${email}:${expiresStr}`;
    const expectedSignature = await signSessionPayload(payloadString);

    if (signature !== expectedSignature) {
      return null;
    }

    return { userId, email, expires };
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}

// Exclui o cookie de sessão
export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
