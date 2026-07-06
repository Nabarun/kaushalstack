// Shared HTTP plumbing for the creative routes (/api/creative,
// /api/build POST, /api/mockup). Two response modes:
//   - JSON (default): collect the full agent run, return one application/json
//   - SSE  (?stream=1 OR Accept: text/event-stream): stream agent events
//     live with 20s heartbeats so proxies don't idle-close the connection.

import { runCreativeAgent } from '../builder/creative-registry.js';

export function wantsStream(req) {
    return req.query?.stream === '1'
        || req.query?.stream === 'true'
        || (req.headers.accept || '').includes('text/event-stream');
}

// Build agent input from the request. agentIdOverride lets the build/mockup
// wrappers force a specific agent regardless of body. Without override, the
// generic /creative endpoint reads it from body.agent_id.
function readAgentInput(req, agentIdOverride) {
    return {
        agentId:           agentIdOverride || req.body?.agent_id,
        rawQuery:          req.body?.query,
        rawContext:        req.body?.context,
        designSessionId:   req.body?.design_session_id,
        designBriefInline: req.body?.design_brief,   // fallback brief text when the design workspace is gone
        authHeader:        req.headers.authorization,
        partnerId:         typeof req.body?.partner_id === 'string' ? req.body.partner_id.trim() : '',
    };
}

export async function handleJson(req, res, agentIdOverride) {
    try {
        const result = await runCreativeAgent(readAgentInput(req, agentIdOverride));
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({
            error:      err.message,
            session_id: err.sessionId,
        });
    }
}

export async function handleStream(req, res, agentIdOverride) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Disable nginx output buffering if anything's in front of us. Without
    // this header, nginx will buffer the response and the stream looks
    // identical to a JSON response — defeating the point.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Single-write event emit. Combining `event:` + `data:` into one
    // res.write call keeps heartbeats from interleaving between the two
    // lines (which corrupts the SSE message).
    const send = (eventName, data) => {
        try {
            res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch { /* client disconnected mid-write */ }
    };

    // Initial probe so we know the client is genuinely alive before the
    // agent starts doing real work. Avoids the bug where the first event
    // we'd emit was buried inside runCreativeAgent's async path.
    send('connected', { ts: Date.now() });

    // 20-second heartbeats keep proxies from idling the connection between
    // tool calls. The comment line (`: ping`) is the standard SSE no-op.
    const heartbeat = setInterval(() => {
        try { res.write(`: ping\n\n`); }
        catch { /* dead connection — cleared on close below */ }
    }, 20000);

    // Track whether the response socket has actually closed before we
    // started writing. IncomingMessage's 'close' fires on socket close
    // (NOT on body-parser finishing the read), but we listen on `res`
    // since that's the response stream — closing of which is the
    // unambiguous "client gave up" signal.
    let clientGone = false;
    const onClose = () => { clientGone = true; clearInterval(heartbeat); };
    res.on('close', onClose);

    try {
        const result = await runCreativeAgent({
            ...readAgentInput(req, agentIdOverride),
            onEvent: (evt) => { if (!clientGone) send(evt.kind || 'trace', evt); },
        });
        if (!clientGone) send('done', result);
    } catch (err) {
        if (!clientGone) send('error', { error: err.message, session_id: err.sessionId });
    } finally {
        clearInterval(heartbeat);
        res.off('close', onClose);
        try { res.end(); } catch { /* already closed */ }
    }
}

// Convenience: dispatch to JSON or SSE based on request.
export function handle(req, res, agentIdOverride) {
    if (wantsStream(req)) return handleStream(req, res, agentIdOverride);
    return handleJson(req, res, agentIdOverride);
}
