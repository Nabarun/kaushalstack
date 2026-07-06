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
