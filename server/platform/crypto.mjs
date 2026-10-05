/**
 * Criptografía de la plataforma. Todo sale de PLATFORM_SECRET (≥ 32 caracteres, aleatorio):
 *   - las claves de cada ots se guardan cifradas (AES-256-GCM),
 *   - las cookies temporales del login (estado de OIDC) van firmadas (HMAC-SHA256),
 *   - los tokens (sesión, enlace por email) se guardan como hash, nunca en claro.
 * Cambiar PLATFORM_SECRET invalida las claves guardadas: los usuarios tendrían que volver a ponerlas.
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

let keys = null;

function derive() {
  if (keys) return keys;
  const secret = process.env.PLATFORM_SECRET || '';
  if (secret.length < 32) throw new Error('PLATFORM_SECRET debe tener al menos 32 caracteres (la plataforma no arranca sin él)');
  const k = (info) => Buffer.from(hkdfSync('sha256', secret, '7ots-platform', info, 32));
  keys = { box: k('secrets-v1'), mac: k('cookies-v1') };
  return keys;
}

/** Comprueba PLATFORM_SECRET al arrancar (lanza si falta). */
export function assertSecret() {
  derive();
}

/** Cifra un objeto → "v1.<iv>.<tag>.<datos>" (base64url). */
export function seal(obj) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', derive().box, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj ?? {}), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/** Descifra lo de seal(). Vacío o inválido → {} (y avisa: nunca rompe el ots). */
export function open(text) {
  if (!text) return {};
  try {
    const [v, iv, tag, data] = String(text).split('.');
    if (v !== 'v1') return {};
    const d = createDecipheriv('aes-256-gcm', derive().box, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8'));
  } catch {
    console.warn('[7ots] plataforma: no se pudieron descifrar unas claves (¿cambió PLATFORM_SECRET?)');
    return {};
  }
}

/** Firma un valor corto para una cookie: "<valor>.<mac>". */
export function signValue(value) {
  return `${value}.${createHmac('sha256', derive().mac).update(value).digest('base64url')}`;
}

/** Devuelve el valor si la firma es buena; si no, null. */
export function unsignValue(signed) {
  const s = String(signed || '');
  const i = s.lastIndexOf('.');
  if (i < 1) return null;
  const value = s.slice(0, i);
  return safeEqual(s.slice(i + 1), createHmac('sha256', derive().mac).update(value).digest('base64url')) ? value : null;
}

export const token = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s) => createHash('sha256').update(String(s)).digest('base64url');

/** Id corto y legible para URLs: prefijo + 16 caracteres [a-z0-9]. */
export function newId(prefix) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const b = randomBytes(16);
  let out = '';
  for (const x of b) out += alphabet[x % 36];
  return `${prefix}_${out}`;
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
