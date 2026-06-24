import pb from '../../utils/pocketbaseClient.js';
import { getUserIdFromAuth } from '../../utils/auth.js';

const adminCache = new Map();
const TTL_MS = 60 * 1000;

async function userIsAdmin(userId) {
    if (!userId) return false;
    const entry = adminCache.get(userId);
    if (entry && Date.now() - entry.at < TTL_MS) return entry.value;
    try {
        const user = await pb.collection('users').getOne(userId, { fields: 'id,is_admin' });
        const value = !!user?.is_admin;
        adminCache.set(userId, { value, at: Date.now() });
        return value;
    } catch {
        return false;
    }
}

export async function requireAdmin(req, res, next) {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: 'auth required' });
    const ok = await userIsAdmin(userId);
    if (!ok) return res.status(403).json({ error: 'admin only' });
    req.adminUserId = userId;
    next();
}

export async function checkAdmin(req) {
    const userId = await getUserIdFromAuth(req);
    if (!userId) return null;
    const ok = await userIsAdmin(userId);
    return ok ? userId : null;
}
