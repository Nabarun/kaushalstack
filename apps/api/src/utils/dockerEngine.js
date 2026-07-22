// Minimal Docker Engine API client over the unix socket. Used by the partner
// environment provisioner — the api container has /var/run/docker.sock
// mounted in prod so it can create sibling portal containers without SSH.

import http from 'node:http';

const SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const API_VERSION = 'v1.43';

export function dockerAvailable() {
    return new Promise((resolve) => {
        const req = http.request(
            { socketPath: SOCKET, path: `/${API_VERSION}/_ping`, method: 'GET', timeout: 2000 },
            (res) => { res.resume(); resolve(res.statusCode === 200); },
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
    });
}

export function dockerRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request({
            socketPath: SOCKET,
            path: `/${API_VERSION}${path}`,
            method,
            timeout: 60000,
            headers: payload ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            } : {},
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                let parsed = null;
                try { parsed = data ? JSON.parse(data) : null; } catch { parsed = { raw: data }; }
                if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed);
                const err = new Error(parsed?.message || `docker ${method} ${path} → ${res.statusCode}`);
                err.statusCode = res.statusCode;
                reject(err);
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('docker socket timeout')); });
        if (payload) req.write(payload);
        req.end();
    });
}
