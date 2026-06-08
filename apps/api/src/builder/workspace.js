import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Per-session workspace lives under /tmp/kaushal-build/<sessionId>/.
// /tmp gets wiped on container restart — fine for first cut. Cleanup runs
// opportunistically (sessions older than 1h are removed on each new session).

const ROOT = '/tmp/kaushal-build';
const SESSION_TTL_MS = 60 * 60 * 1000;

async function ensureRoot() {
    await fs.mkdir(ROOT, { recursive: true });
}

export function newSessionId() {
    return crypto.randomBytes(8).toString('hex');
}

export async function sessionDir(sessionId) {
    if (!/^[a-f0-9]{16}$/.test(sessionId)) throw new Error('bad session id');
    return path.join(ROOT, sessionId);
}

export async function createSession() {
    await ensureRoot();
    await cleanupOld();
    const sessionId = newSessionId();
    const dir = await sessionDir(sessionId);
    await fs.mkdir(dir, { recursive: true });
    return { sessionId, dir };
}

// Resolve a user-provided path inside the session, blocking traversal.
export async function safeResolve(sessionId, userPath) {
    const root = await sessionDir(sessionId);
    const cleaned = String(userPath || '').replace(/^\/+/, '').replace(/\\/g, '/');
    if (cleaned.includes('..')) throw new Error('path traversal not allowed');
    if (cleaned.length > 200) throw new Error('path too long');
    const abs = path.resolve(root, cleaned || '.');
    if (!abs.startsWith(root)) throw new Error('path escapes workspace');
    return abs;
}

export async function listDir(sessionId, relPath = '.') {
    const abs = await safeResolve(sessionId, relPath);
    try {
        const entries = await fs.readdir(abs, { withFileTypes: true });
        return entries.map(e => ({
            name: e.name,
            kind: e.isDirectory() ? 'dir' : 'file',
        }));
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

export async function readFile(sessionId, relPath) {
    const abs = await safeResolve(sessionId, relPath);
    const buf = await fs.readFile(abs, 'utf8');
    return buf;
}

const MAX_FILE_BYTES = 200 * 1024; // 200 KB per file

export async function writeFile(sessionId, relPath, contents) {
    if (typeof contents !== 'string') throw new Error('contents must be a string');
    if (Buffer.byteLength(contents, 'utf8') > MAX_FILE_BYTES) {
        throw new Error(`file too large (max ${MAX_FILE_BYTES} bytes)`);
    }
    const abs = await safeResolve(sessionId, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, contents, 'utf8');
    return { path: relPath, bytes: Buffer.byteLength(contents, 'utf8') };
}

// Walk the workspace and return a flat list of {path, bytes} for every file.
export async function fileManifest(sessionId) {
    const root = await sessionDir(sessionId);
    const out = [];
    async function walk(dir, prefix) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dir, e.name);
            const rel = prefix ? `${prefix}/${e.name}` : e.name;
            if (e.isDirectory()) await walk(full, rel);
            else {
                const stat = await fs.stat(full);
                out.push({ path: rel, bytes: stat.size });
            }
        }
    }
    try { await walk(root, ''); } catch { /* empty workspace */ }
    return out;
}

async function cleanupOld() {
    try {
        const entries = await fs.readdir(ROOT, { withFileTypes: true });
        const now = Date.now();
        for (const e of entries) {
            if (!e.isDirectory()) continue;
            const dir = path.join(ROOT, e.name);
            try {
                const stat = await fs.stat(dir);
                if (now - stat.mtimeMs > SESSION_TTL_MS) {
                    await fs.rm(dir, { recursive: true, force: true });
                }
            } catch { /* skip */ }
        }
    } catch { /* root missing — fine */ }
}
