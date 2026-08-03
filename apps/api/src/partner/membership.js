// Server-side membership check for client-supplied partner_id values.
// Any endpoint that tags usage or writes data against a partner MUST verify
// the caller is actually a member — a partner_id in a request body is never
// trusted on its own (otherwise any user could bill/attribute usage to
// someone else's partner).

import pb from '../utils/pocketbaseClient.js';

const esc = (s) => String(s).replace(/"/g, '\\"');

export async function isPartnerMember(partnerId, userId) {
    if (!partnerId || !userId) return false;
    try {
        const p = await pb.collection('partners').getOne(partnerId);
        if (p.owner_user_id === userId) return true;
        const m = await pb.collection('partner_members').getList(1, 1, {
            filter: `partner_id = "${esc(partnerId)}" && user_id = "${esc(userId)}"`,
        });
        return !!m.items[0];
    } catch {
        return false;
    }
}

// Returns the partner_id if the user is verified as a member, else ''.
export async function verifiedPartnerId(partnerId, userId) {
    return (await isPartnerMember(partnerId, userId)) ? partnerId : '';
}

// Derive a tenant when the caller supplied none: if the user belongs to
// exactly ONE partner (as member or owner), that partner is unambiguous and
// safe to attribute spend to. Multi-partner users — the platform operator,
// agency accounts — return '' so their spend is never guessed onto a
// customer; they must claim a partner_id explicitly.
export async function solePartnerIdForUser(userId) {
    if (!userId) return '';
    try {
        const [m, owned] = await Promise.all([
            pb.collection('partner_members').getList(1, 2, { filter: `user_id = "${esc(userId)}"` }),
            pb.collection('partners').getList(1, 2, { filter: `owner_user_id = "${esc(userId)}"`, fields: 'id' }),
        ]);
        const ids = new Set([
            ...m.items.map(r => r.partner_id).filter(Boolean),
            ...owned.items.map(r => r.id),
        ]);
        return ids.size === 1 ? [...ids][0] : '';
    } catch {
        return '';
    }
}
