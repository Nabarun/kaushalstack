/// <reference path="../pb_data/types.d.ts" />
//
// Auto-regenerate the OpenAI embedding for a skill any time its semantic
// content (name, description, category, agent_name) changes. The embedding
// gets written into the same save the user just submitted, so there's no
// recursive hook fire.
//
// Runs synchronously inside the create/update request. text-embedding-3-small
// typically responds in 300–800ms — acceptable overhead for a skill edit.
// On any failure we log and let the user's save proceed without changing the
// embedding (existing vector stays); the catalogue stays editable even if
// OpenAI is down.

const EMBED_FIELDS = ['name', 'description', 'category', 'agent_name'];

function buildEmbedText(record) {
    return [
        record.get('name') || '',
        record.get('agent_name') || '',
        record.get('category') || '',
        record.get('description') || '',
    ].join('\n').slice(0, 8000);
}

function callEmbedding(input) {
    const key = $os.getenv('OPENAI_API_KEY');
    if (!key) {
        $app.logger().warn('skill reembed: OPENAI_API_KEY missing, skipping');
        return null;
    }
    const res = $http.send({
        url: 'https://api.openai.com/v1/embeddings',
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input }),
        timeout: 20,
    });
    if (res.statusCode !== 200) {
        $app.logger().error('skill reembed: openai error', 'status', String(res.statusCode), 'body', String(res.json || '').slice(0, 200));
        return null;
    }
    const parsed = JSON.parse(res.json);
    return (parsed && parsed.data && parsed.data[0] && parsed.data[0].embedding) || null;
}

function reembedAndSetField(record) {
    const input = buildEmbedText(record);
    if (!input.trim()) return;
    const vector = callEmbedding(input);
    if (vector) {
        record.set('embedding', vector);
        $app.logger().info('skill reembedded', 'id', record.id);
    }
}

// Update path: only re-embed if a semantic field actually changed.
onRecordUpdate((e) => {
    try {
        const original = e.record.original();
        const changed = EMBED_FIELDS.some(f => e.record.get(f) !== original.get(f));
        if (changed) reembedAndSetField(e.record);
    } catch (err) {
        $app.logger().error('reembed update hook error', 'err', String(err && err.message || err));
    }
    e.next();
}, 'skills');

// Create path: always embed (record is brand new, no prior state).
onRecordCreate((e) => {
    try {
        reembedAndSetField(e.record);
    } catch (err) {
        $app.logger().error('reembed create hook error', 'err', String(err && err.message || err));
    }
    e.next();
}, 'skills');
