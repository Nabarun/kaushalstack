// Admin view over the build-session workspace folders (<WORKSPACE_ROOT>/<id>).
// Each folder is a generated site/mockup; roundtable chats reference them by
// session_id inside tool_results/responses, and portal campaigns point at the
// same sessions — so deleting a folder kills its previews/Studio/Site-Builder.

import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';

const router = Router();

const ROOT = process.env.WORKSPACE_ROOT || '/tmp/kaushal-build';
const SESSION_ID_RE = /^[a-f0-9]{16}$/;

async function folderStats(dir) {
    let bytes = 0;
    let files = 0;
    let latest = 0;
    async function walk(d) {
        const entries = await fs.readdir(d, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) { await walk(full); continue; }
            const st = await fs.stat(full);
            bytes += st.size;
            files += 1;
            if (st.mtimeMs > latest) latest = st.mtimeMs;
        }
    }
    try { await walk(dir); } catch { /* unreadable — report zeros */ }
    return { bytes, files, latest };
}

// Pull every session_id a chat references (mockup/build tool results plus
// per-agent responses).
function sessionIdsFromChat(chat) {
    const ids = new Set();
    const scan = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (typeof obj.session_id === 'string' && SESSION_ID_RE.test(obj.session_id)) ids.add(obj.session_id);
        for (const v of Object.values(obj)) {
            if (v && typeof v === 'object') scan(v);
        }
    };
    for (const field of ['tool_results', 'responses']) {
        let val = chat[field];
        if (typeof val === 'string') { try { val = JSON.parse(val); } catch { continue; } }
        scan(val);
    }
    return ids;
}

router.get('/admin/workspaces', requireAdmin, async (req, res) => {
    try {
        let entries = [];
        try {
            entries = (await fs.readdir(ROOT, { withFileTypes: true }))
                .filter(e => e.isDirectory() && SESSION_ID_RE.test(e.name));
        } catch { /* root missing — no sessions yet */ }

        // session -> owning chat (first chat found that references it)
        const chatBySession = {};
        try {
            const chats = await pb.collection('roundtable_chats').getFullList({
                fields: 'id,query,phase,created,tool_results,responses',
                sort: '-created',
            });
            for (const c of chats) {
                for (const sid of sessionIdsFromChat(c)) {
                    if (!chatBySession[sid]) {
                        chatBySession[sid] = {
                            chat_id: c.id,
                            phase: c.phase || '',
                            title: String(c.query || '').replace(/\s+/g, ' ').slice(0, 140),
                            chat_created: c.created,
                        };
                    }
                }
            }
        } catch (e) {
            logger.warn('admin/workspaces chat linkage failed:', e.message);
        }

        const items = await Promise.all(entries.map(async (e) => {
            const dir = path.join(ROOT, e.name);
            const [stats, result] = await Promise.all([
                folderStats(dir),
                fs.readFile(path.join(dir, '_session_result.json'), 'utf8')
                    .then(JSON.parse).catch(() => null),
            ]);
            const dirStat = await fs.stat(dir).catch(() => null);
            return {
                id: e.name,
                bytes: stats.bytes,
                files: stats.files,
                modified: new Date(stats.latest || dirStat?.mtimeMs || Date.now()).toISOString(),
                created: new Date(dirStat?.birthtimeMs || dirStat?.mtimeMs || Date.now()).toISOString(),
                agent_name: result?.agent_name || '',
                summary: String(result?.summary || '').slice(0, 200),
                deployed: !!result?.deploy,
                chat: chatBySession[e.name] || null,
            };
        }));

        items.sort((a, b) => (a.modified < b.modified ? 1 : -1));
        const totalBytes = items.reduce((s, i) => s + i.bytes, 0);
        res.json({ root: ROOT, items, total_bytes: totalBytes });
    } catch (err) {
        logger.error('admin workspaces list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/admin/workspaces/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    if (!SESSION_ID_RE.test(id)) return res.status(400).json({ error: 'bad session id' });
    const dir = path.join(ROOT, id);
    try {
        await fs.access(dir);
    } catch {
        return res.status(404).json({ error: 'folder not found' });
    }
    try {
        await fs.rm(dir, { recursive: true, force: true });
        logger.info(`admin: workspace ${id} deleted by ${req.adminUserId}`);
        res.json({ ok: true });
    } catch (err) {
        logger.error('admin workspace delete failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
