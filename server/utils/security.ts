import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config.ts';
import { getDb } from '../db/database.ts';

export type UserRole = 'USER' | 'PROFESSIONAL' | 'ADMIN';

export interface JwtUserPayload {
  id: number;
  email: string;
  role: UserRole;
  fullName: string;
}

const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function signAccessToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, CONFIG.jwtAccessSecret, {
    expiresIn: '30m',
  });
}

export function verifyAccessToken(token: string): JwtUserPayload {
  return jwt.verify(token, CONFIG.jwtAccessSecret) as JwtUserPayload;
}

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateCsrfToken(): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Date.now().toString(36);
  const base = `${ts}.${nonce}`;
  const sig = crypto
    .createHmac('sha256', CONFIG.csrfSecret)
    .update(base)
    .digest('hex')
    .slice(0, 32);
  return `${base}.${sig}`;
}

export function verifySignedCsrfToken(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [ts, nonce, sig] = parts;
  const base = `${ts}.${nonce}`;
  const expectedSig = crypto
    .createHmac('sha256', CONFIG.csrfSecret)
    .update(base)
    .digest('hex')
    .slice(0, 32);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

/**
 * Cryptographic QR Verification Token Architecture:
 * - Never embeds customer PII (name, email, phone, service) inside the QR payload.
 * - Derives an opaque HMAC token from (bookingCode, qrNonce) using server-only QR_HMAC_SECRET.
 * - Only SHA-256(rawToken) is persisted in SQLite `appointments.qr_token_hash`.
 */
export function deriveQrRawToken(bookingCode: string, qrNonce: string): string {
  return crypto
    .createHmac('sha256', CONFIG.qrHmacSecret)
    .update(`${bookingCode}:${qrNonce}`)
    .digest('hex');
}

export function createQrCredentials(bookingCode: string): {
  qrNonce: string;
  rawToken: string;
  qrTokenHash: string;
  qrPayload: string;
} {
  const qrNonce = crypto.randomBytes(16).toString('hex');
  const rawToken = deriveQrRawToken(bookingCode, qrNonce);
  const qrTokenHash = sha256Hex(rawToken);
  return {
    qrNonce,
    rawToken,
    qrTokenHash,
    qrPayload: `SCQR.v1.${rawToken}`,
  };
}

export function extractRawQrToken(scannedInput: string): string {
  const trimmed = scannedInput.trim();
  if (trimmed.startsWith('SCQR.v1.')) {
    return trimmed.slice('SCQR.v1.'.length).trim();
  }
  return trimmed;
}

export function generateBookingCode(dateStr: string): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const rand = crypto.randomInt(1000, 9999);
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `SC-${cleanDate}-${rand}${suffix}`;
}

export function logActivity(params: {
  actorUserId?: number | null;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: number | null;
  details?: string;
  ipAddress?: string;
}): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO activity_logs (actor_user_id, actor_role, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.actorUserId ?? null,
      params.actorRole ?? 'SYSTEM',
      params.action,
      params.entityType,
      params.entityId ?? null,
      params.details ?? '',
      params.ipAddress ?? ''
    );
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}
