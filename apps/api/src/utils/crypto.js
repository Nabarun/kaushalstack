import crypto from 'node:crypto';
import logger from './logger.js';

// AES-256-GCM authenticated encryption for storing sensitive user data
// (currently: per-user OpenAI API keys).
//
// Format on disk: base64(iv) . base64(authTag) . base64(ciphertext)
//   - iv: 12 bytes random per-encryption (recommended for GCM)
//   - authTag: 16 bytes integrity tag
//   - ciphertext: AES-256-GCM output
//
// Key: KEY_ENCRYPTION_SECRET env var, must be 32 bytes after decoding.
//   Accepts either a 64-char hex string or a 44-char base64 (no padding) string.

const ALGO   = 'aes-256-gcm';
const IV_LEN = 12;

function getKey() {
    const raw = process.env.KEY_ENCRYPTION_SECRET || '';
    if (!raw) throw new Error('KEY_ENCRYPTION_SECRET is not set');

    // Try hex (64 chars → 32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');

    // Try base64 (must decode to exactly 32 bytes)
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;

    throw new Error('KEY_ENCRYPTION_SECRET must be 32 bytes (64 hex chars or base64 of 32 bytes)');
}

let cachedKey = null;
function key() {
    if (!cachedKey) cachedKey = getKey();
    return cachedKey;
}

export function encrypt(plaintext) {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
        throw new Error('encrypt: plaintext must be a non-empty string');
    }
    const iv     = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key(), iv);
    const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag    = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decrypt(payload) {
    if (typeof payload !== 'string' || !payload.includes('.')) {
        throw new Error('decrypt: malformed payload');
    }
    const [ivB64, tagB64, ctB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !ctB64) throw new Error('decrypt: malformed payload');

    const iv  = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct  = Buffer.from(ctB64, 'base64');
    if (iv.length !== IV_LEN) throw new Error('decrypt: bad iv length');

    const decipher = crypto.createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function safeDecrypt(payload) {
    try { return decrypt(payload); }
    catch (err) { logger.warn('decrypt failed:', err.message); return null; }
}

// Verify the env is configured at startup so we fail fast, not on first request.
try { key(); logger.info('Encryption secret loaded'); }
catch (err) { logger.error(err.message); }
