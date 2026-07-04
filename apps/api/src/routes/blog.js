import { Router } from 'express';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { requireAdmin } from './admin/auth.js';

const router = Router();

let blogReady = false;

const BLOG_FIELDS = [
    { type: 'text',     name: 'title',        required: true,  max: 300 },
    { type: 'text',     name: 'slug',         required: true,  max: 300 },
    { type: 'text',     name: 'content',      required: false, max: 0 },
    { type: 'text',     name: 'excerpt',      required: false, max: 500 },
    { type: 'text',     name: 'status',       required: false, max: 20 },
    { type: 'text',     name: 'tags',         required: false, max: 500 },
    { type: 'date',     name: 'published_at', required: false },
    { type: 'autodate', name: 'created',      onCreate: true,  onUpdate: false },
    { type: 'autodate', name: 'updated',      onCreate: true,  onUpdate: true },
];

async function ensureBlogCollection() {
    if (blogReady) return true;
    try {
        const existing = await pb.collections.getOne('blog_posts');
        const have = new Set((existing.fields || []).map(f => f.name));
        const missing = BLOG_FIELDS.filter(f => !have.has(f.name));
        if (missing.length > 0) {
            await pb.collections.update('blog_posts', {
                fields: [...(existing.fields || []), ...missing],
            });
        }
        blogReady = true;
        return true;
    } catch {
        try {
            await pb.send('/api/collections', {
                method: 'POST',
                body: { name: 'blog_posts', type: 'base', fields: BLOG_FIELDS },
            });
            logger.info('blog_posts collection created');
            blogReady = true;
            return true;
        } catch (err) {
            logger.warn('Could not create blog_posts collection:', err.message);
            return false;
        }
    }
}

ensureBlogCollection().catch(() => {});

function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 280);
}

// Public: list published posts
router.get('/blog', async (req, res) => {
    if (!(await ensureBlogCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const perPage = Math.min(50, parseInt(req.query.perPage) || 10);
        const list = await pb.collection('blog_posts').getList(page, perPage, {
            filter: 'status = "published"',
            sort: '-published_at,-created',
            fields: 'id,title,slug,excerpt,tags,published_at,created',
        });
        res.json(list);
    } catch (err) {
        logger.error('blog list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Public: single post by slug
router.get('/blog/:slug', async (req, res) => {
    if (!(await ensureBlogCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '').slice(0, 300);
        const list = await pb.collection('blog_posts').getList(1, 1, {
            filter: `slug = "${slug}" && status = "published"`,
        });
        if (!list.items.length) return res.status(404).json({ error: 'not found' });
        res.json(list.items[0]);
    } catch (err) {
        logger.error('blog post fetch failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Admin: list all posts (including drafts)
router.get('/admin/blog', requireAdmin, async (req, res) => {
    if (!(await ensureBlogCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const list = await pb.collection('blog_posts').getList(1, 100, {
            sort: '-created',
        });
        res.json(list);
    } catch (err) {
        logger.error('admin blog list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Admin: create post
router.post('/admin/blog', requireAdmin, async (req, res) => {
    if (!(await ensureBlogCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const { title, slug, content, excerpt, status, tags, published_at } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });
        const finalSlug = (slug || slugify(title)) || String(Date.now());
        const post = await pb.collection('blog_posts').create({
            title: String(title).slice(0, 300),
            slug: finalSlug,
            content: content ? String(content) : '',
            excerpt: excerpt ? String(excerpt).slice(0, 500) : '',
            status: status === 'published' ? 'published' : 'draft',
            tags: tags ? String(tags).slice(0, 500) : '',
            published_at: status === 'published' ? (published_at || new Date().toISOString()) : '',
        });
        res.status(201).json(post);
    } catch (err) {
        logger.error('admin blog create failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Admin: update post
router.patch('/admin/blog/:id', requireAdmin, async (req, res) => {
    if (!(await ensureBlogCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        const { title, slug, content, excerpt, status, tags, published_at } = req.body;
        const updates = {};
        if (title !== undefined)   updates.title   = String(title).slice(0, 300);
        if (slug !== undefined)    updates.slug    = String(slug).slice(0, 300);
        if (content !== undefined) updates.content = String(content);
        if (excerpt !== undefined) updates.excerpt = String(excerpt).slice(0, 500);
        if (tags !== undefined)    updates.tags    = String(tags).slice(0, 500);
        if (status !== undefined) {
            updates.status = status === 'published' ? 'published' : 'draft';
            if (updates.status === 'published' && !published_at) {
                updates.published_at = new Date().toISOString();
            }
        }
        if (published_at !== undefined) updates.published_at = published_at;
        const post = await pb.collection('blog_posts').update(req.params.id, updates);
        res.json(post);
    } catch (err) {
        logger.error('admin blog update failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Admin: delete post
router.delete('/admin/blog/:id', requireAdmin, async (req, res) => {
    if (!(await ensureBlogCollection())) return res.status(500).json({ error: 'collection not ready' });
    try {
        await pb.collection('blog_posts').delete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        logger.error('admin blog delete failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
