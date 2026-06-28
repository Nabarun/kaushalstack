// Admin-only routes for managing private skills attached to a business.
// Each attached skill is a SKILL.md (YAML frontmatter + markdown body)
// uploaded by an admin. The growth-report pipeline runs each of them as an
// additional analysis layer on top of the competitor scan.
//
// Routes:
//   GET    /admin/businesses/:id/skills           — list attached skills
//   POST   /admin/businesses/:id/skills           — multipart upload (name + file)
//   DELETE /admin/businesses/:id/skills/:skillId  — detach + delete the skill

import { Router } from 'express';
import multer from 'multer';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { requireAdmin } from './auth.js';

const router = Router();

// Multer for the SKILL.md upload. In-memory (small files), 1MB cap, .md/.txt
// MIME types. Browsers sometimes send application/octet-stream for .md so we
// accept that too — we'll validate the parsed content separately.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = /\.(md|markdown|txt)$/i.test(file.originalname || '')
                || ['text/markdown', 'text/plain', 'application/octet-stream'].includes(file.mimetype);
        cb(ok ? null : new Error('Only .md / .txt files accepted'), ok);
    },
});

// Gate everything under /admin/businesses/:id/skills behind requireAdmin.
router.use('/admin/businesses/:id/skills', requireAdmin);

// Minimal YAML frontmatter parser — same shape as the SKILL.md format
// (Claude Code skill files). Pulls `name` and `description` so we can show
// them in the admin UI even if the user overrides via the form.
function parseFrontmatter(md) {
    const m = (md || '').match(/^---\n([\s\S]*?)\n---/);
    if (!m) return {};
    const fm = {};
    for (const line of m[1].split('\n')) {
        const kv = line.match(/^([\w_]+):\s*(.*)$/);
        if (kv) fm[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
    }
    return fm;
}

// GET /admin/businesses/:id/skills — list attached skills
router.get('/admin/businesses/:id/skills', async (req, res) => {
    const businessId = req.params.id;
    try {
        // Confirm the business exists (also gives us a useful 404 path).
        await pb.collection('businesses').getOne(businessId);
        const r = await pb.collection('skills').getList(1, 100, {
            filter: `business_id = "${businessId}" && private = true`,
            sort: '-created',
            fields: 'id,name,agent_name,category,competitor_website,description,created',
        });
        // Trim the description preview server-side so the list payload is small.
        const items = r.items.map(s => ({
            ...s,
            description_preview: (s.description || '').slice(0, 200),
        }));
        res.json({ items, total: r.totalItems });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: 'business not found' });
        logger.error(`admin/business-skills list error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// POST /admin/businesses/:id/skills — upload a SKILL.md
//   form fields: name (string, required), file (the .md, required)
router.post('/admin/businesses/:id/skills', upload.single('file'), async (req, res) => {
    const businessId = req.params.id;
    const name       = String(req.body?.name || '').trim().slice(0, 200);
    const file       = req.file;

    if (!name)      return res.status(400).json({ error: 'name is required' });
    if (!file)      return res.status(400).json({ error: 'file is required' });
    if (!file.size) return res.status(400).json({ error: 'file is empty' });

    const body = file.buffer.toString('utf8');
    if (body.length > 200_000) return res.status(400).json({ error: 'file too large (max ~200KB of text)' });

    const fm = parseFrontmatter(body);

    try {
        await pb.collection('businesses').getOne(businessId);
        const record = await pb.collection('skills').create({
            name,                                                  // form-provided, overrides frontmatter
            agent_name:        fm.name || name,                    // frontmatter slug if present
            description:       body,                                // full markdown (frontmatter + body)
            category:          'operations',
            phase:             'execution',
            difficulty_level:  'Advanced',
            business_id:       businessId,
            private:           true,
            created_by:        req.adminUserId,
            likes_count:       0,
            comments_count:    0,
        });
        logger.info(`admin/business-skills uploaded: business=${businessId} skill=${record.id} name="${name}" bytes=${body.length}`);
        res.status(201).json({ item: record });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: 'business not found' });
        logger.error(`admin/business-skills upload error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /admin/businesses/:id/skills/:skillId
router.delete('/admin/businesses/:id/skills/:skillId', async (req, res) => {
    const { id: businessId, skillId } = req.params;
    try {
        const skill = await pb.collection('skills').getOne(skillId);
        if (skill.business_id !== businessId) {
            return res.status(400).json({ error: 'skill does not belong to this business' });
        }
        await pb.collection('skills').delete(skillId);
        logger.info(`admin/business-skills deleted: business=${businessId} skill=${skillId}`);
        res.json({ ok: true });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: 'skill not found' });
        logger.error(`admin/business-skills delete error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

export default router;
