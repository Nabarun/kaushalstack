// Pairing logic for the admin Customers page (the merged Businesses + Teams
// view). Kept out of the .jsx so it can be unit-tested without a JSX loader.
//
// `partners` and `businesses` are separate PocketBase collections with no
// foreign key between them — they back different machinery (portal/credits vs
// the growth-report scheduler). A company can exist as either or both, so the
// two are paired here by a loose name key.

export function normKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Every partner and every business keeps its own row unless a business has
 * exactly ONE same-named partner to attach to.
 *
 * Rows are keyed by record id, never by name: several partners can share a
 * name, and collapsing them would hide records the admin still needs to see
 * and delete. An ambiguous name is left un-merged rather than guessed at.
 */
export function mergeCustomers(partners = [], businesses = []) {
    const partnersByKey = new Map();
    for (const p of partners) {
        const key = normKey(p.name);
        if (!partnersByKey.has(key)) partnersByKey.set(key, []);
        partnersByKey.get(key).push(p);
    }

    const rows = partners.map(p => ({ key: `p:${p.id}`, name: p.name, partner: p, business: null }));

    for (const b of businesses) {
        const matches = partnersByKey.get(normKey(b.name)) || [];
        const target = matches.length === 1
            ? rows.find(r => r.partner?.id === matches[0].id)
            : null;
        if (target) target.business = b;
        else rows.push({ key: `b:${b.id}`, name: b.name, partner: null, business: b });
    }
    return rows;
}
