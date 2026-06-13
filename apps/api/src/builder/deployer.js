// VPS deployer for Ananya's "Deploy to Hostinger" button.
//
// Takes a finished build session workspace and pushes the static site to the
// VPS over SSH (rsync), serving it from a dedicated nginx static site on a
// side port. Returns the private IP + path the site is reachable at.
//
// Auth model: the user must have stored a Hostinger API token ("Login to
// Hostinger") to unlock deploys. The token also lets us look up their VPS's
// private IP from the Hostinger API when available; otherwise we report the
// configured VPS address. The actual file push uses the VPS SSH credentials
// configured below (same VPS the platform itself runs on — see the deployment
// skill), kept in env with documented defaults for local dev.

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import logger from '../utils/logger.js';
import { sessionDir } from './workspace.js';

const VPS_HOST     = process.env.DEPLOY_VPS_HOST     || '187.127.147.87';
const VPS_USER     = process.env.DEPLOY_VPS_USER     || 'root';
const VPS_PASSWORD = process.env.DEPLOY_VPS_PASSWORD || 'R@jeshshukl@123';
const REMOTE_ROOT  = process.env.DEPLOY_REMOTE_ROOT  || '/var/www/kaushal-deploys';
const HTTP_PORT    = process.env.DEPLOY_HTTP_PORT    || '8088';

const SSH_OPTS = [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'PreferredAuthentications=password',
    '-o', 'KbdInteractiveAuthentication=no',
    '-o', 'ConnectTimeout=20',
];

function isPrivateIpv4(ip) {
    return /^10\./.test(ip)
        || /^192\.168\./.test(ip)
        || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip);
}

// Run a local command, passing the SSH password via the SSHPASS env var (so it
// never appears in the process argv). Resolves with stdout, rejects on non-zero
// exit with stderr in the message.
function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            env: { ...process.env, SSHPASS: VPS_PASSWORD },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });
        child.on('error', err => reject(err));
        child.on('close', code => {
            if (code === 0) resolve(stdout);
            else reject(new Error(`${cmd} exited ${code}: ${(stderr || stdout).slice(0, 500).trim()}`));
        });
    });
}

const sshExec  = (remoteCmd) => run('sshpass', ['-e', 'ssh', ...SSH_OPTS, `${VPS_USER}@${VPS_HOST}`, remoteCmd]);
const rsyncDir = (localDir, remoteDir) => run('sshpass', [
    '-e', 'rsync', '-az', '--delete',
    '-e', `ssh ${SSH_OPTS.join(' ')}`,
    `${localDir.replace(/\/?$/, '/')}`,            // trailing slash → copy contents
    `${VPS_USER}@${VPS_HOST}:${remoteDir.replace(/\/?$/, '/')}`,
]);

// Best-effort: ask the Hostinger API for the user's VPS so we can report its
// real private IP. Never throws — a demo/invalid token just yields null.
async function lookupHostingerPrivateIp(token) {
    if (!token) return null;
    try {
        const ctrl = AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
        const r = await fetch('https://developers.hostinger.com/api/vps/v1/virtual-machines', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: ctrl,
        });
        if (!r.ok) {
            logger.warn(`deploy: Hostinger API lookup returned ${r.status}`);
            return null;
        }
        const data = await r.json();
        const vms = Array.isArray(data) ? data : (data?.data || data?.virtual_machines || []);
        for (const vm of vms) {
            const addrs = []
                .concat(vm?.ipv4 || [], vm?.ip_addresses || [], vm?.networks || [])
                .map(a => (typeof a === 'string' ? a : (a?.address || a?.ip || a?.private_ip)))
                .filter(Boolean);
            const priv = addrs.find(isPrivateIpv4);
            if (priv) return priv;
        }
        return null;
    } catch (err) {
        logger.warn(`deploy: Hostinger API lookup failed: ${err.message}`);
        return null;
    }
}

// nginx static site that serves every deployed session under REMOTE_ROOT. Re-
// written (idempotently) on each deploy; isolated in its own file so it can't
// affect the main kaushalstack.com vhost. Only reloads if `nginx -t` passes.
function nginxSetupCommand() {
    const conf = [
        `server {`,
        `    listen ${HTTP_PORT} default_server;`,
        `    listen [::]:${HTTP_PORT} default_server;`,
        `    server_name _;`,
        `    root ${REMOTE_ROOT};`,
        `    autoindex on;`,
        `    location / { try_files $uri $uri/ $uri/index.html =404; }`,
        `}`,
    ].join('\n');
    return [
        `mkdir -p ${REMOTE_ROOT}`,
        `cat > /etc/nginx/sites-available/kaushal-deploys <<'NGINXCONF'\n${conf}\nNGINXCONF`,
        `ln -sf /etc/nginx/sites-available/kaushal-deploys /etc/nginx/sites-enabled/kaushal-deploys`,
        `nginx -t && systemctl reload nginx`,
        `(ufw allow ${HTTP_PORT}/tcp || true)`,
    ].join(' && ');
}

// Deploy a build session's workspace to the VPS. onEvent streams progress so
// the route can forward it over SSE (mirrors the build/mockup agent loops).
export async function deploySession({ sessionId, hostingerToken, onEvent }) {
    const emit = (kind, extra = {}) => { if (onEvent) onEvent({ kind, ...extra }); };

    if (!/^[a-f0-9]{16}$/.test(sessionId || '')) {
        const e = new Error('invalid session id'); e.status = 400; throw e;
    }

    const localDir = await sessionDir(sessionId);
    // Require an index.html so we don't publish an empty/broken directory.
    try {
        await fs.stat(path.join(localDir, 'index.html'));
    } catch {
        const e = new Error('this build has no index.html to deploy'); e.status = 400; throw e;
    }

    const remoteDir = `${REMOTE_ROOT}/${sessionId}`;

    emit('deploy_step', { step: 'connect', message: `Connecting to the VPS (${VPS_HOST})…` });
    // Fail fast with a clear message if SSH/sshpass isn't usable.
    await sshExec(`mkdir -p ${remoteDir}`).catch(err => {
        const e = new Error(`could not reach the deploy VPS: ${err.message}`); e.status = 502; throw e;
    });

    emit('deploy_step', { step: 'upload', message: 'Uploading the built site…' });
    await rsyncDir(localDir, remoteDir);

    emit('deploy_step', { step: 'configure', message: 'Configuring the web server…' });
    await sshExec(nginxSetupCommand()).catch(err => {
        // The files are already up — surface the nginx issue but don't lose the upload.
        logger.warn(`deploy: nginx setup warning for ${sessionId}: ${err.message}`);
    });

    emit('deploy_step', { step: 'finalize', message: 'Resolving the private address…' });
    const privateIp = (await lookupHostingerPrivateIp(hostingerToken)) || VPS_HOST;

    const result = {
        session_id:  sessionId,
        host:        VPS_HOST,
        private_ip:  privateIp,
        port:        Number(HTTP_PORT),
        path:        `/${sessionId}/`,
        url:         `http://${VPS_HOST}:${HTTP_PORT}/${sessionId}/`,
        private_url: `http://${privateIp}:${HTTP_PORT}/${sessionId}/`,
        deployed_at: new Date().toISOString(),
    };
    logger.info(`deploy: session=${sessionId} → ${result.private_url}`);
    return result;
}
