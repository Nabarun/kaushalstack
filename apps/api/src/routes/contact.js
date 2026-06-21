import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { getUserIdFromAuth } from '../utils/auth.js';

const router = Router();

const RECIPIENT = process.env.CONTACT_RECIPIENT || 'sengupta.nabarun@gmail.com';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

// Build once, reuse the connection pool. nodemailer handles STARTTLS on 587.
let transporter = null;
function getTransporter() {
    if (transporter) return transporter;
    if (!SMTP_USER || !SMTP_PASS) {
        logger.warn('contact: SMTP credentials not configured — emails will fail');
        return null;
    }
    // 465 → implicit SSL/TLS (Hostinger default). 587 → STARTTLS (Gmail/etc.).
    const useImplicitTLS = SMTP_PORT === 465;
    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: useImplicitTLS,
        requireTLS: !useImplicitTLS,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    return transporter;
}

// Per-IP throttle: 5 messages per IP per hour.
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many messages from this IP. Try again later.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Light HTML escape so the message body in the email isn't a vector for injecting links/scripts.
function esc(s) {
    return (s || '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

router.post('/contact', limiter, async (req, res) => {
    const { name = '', email = '', subject = '', message = '', honeypot = '' } = req.body || {};

    // Honeypot — bots fill hidden fields; humans don't see them.
    if (honeypot) {
        logger.info('contact: honeypot tripped, silently dropping');
        return res.json({ ok: true });
    }

    const cleanName    = String(name).trim().slice(0, 100);
    const cleanEmail   = String(email).trim().toLowerCase().slice(0, 200);
    const cleanSubject = String(subject).trim().slice(0, 200) || 'kaushalstack contact form';
    const cleanMessage = String(message).trim().slice(0, 5000);

    if (!cleanName)              return res.status(400).json({ error: 'name is required' });
    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'a valid email is required' });
    if (cleanMessage.length < 5) return res.status(400).json({ error: 'message is too short' });

    // Enrich with logged-in account info if present — useful for me when triaging.
    const userId = await getUserIdFromAuth(req);
    let userMeta = null;
    if (userId) {
        try {
            const u = await pb.collection('users').getOne(userId);
            userMeta = { id: u.id, username: u.username, email: u.email };
        } catch { /* ignore — submitter may have been deleted */ }
    }

    const t = getTransporter();
    if (!t) return res.status(503).json({ error: 'Email service is not configured' });

    const html = `
<div style="font-family:Arial,sans-serif;color:#222;max-width:640px">
  <h2 style="margin:0 0 8px;color:#5b8dee">New contact form submission</h2>
  <p style="margin:0 0 16px;color:#666;font-size:13px">kaushalstack.com → /contact</p>

  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr><td style="padding:6px 10px;background:#f4f6fb;font-weight:600;width:120px">From</td><td style="padding:6px 10px;border-bottom:1px solid #eef0f5">${esc(cleanName)} &lt;${esc(cleanEmail)}&gt;</td></tr>
    <tr><td style="padding:6px 10px;background:#f4f6fb;font-weight:600">Subject</td><td style="padding:6px 10px;border-bottom:1px solid #eef0f5">${esc(cleanSubject)}</td></tr>
    ${userMeta ? `<tr><td style="padding:6px 10px;background:#f4f6fb;font-weight:600">Signed in as</td><td style="padding:6px 10px;border-bottom:1px solid #eef0f5">@${esc(userMeta.username)} (${esc(userMeta.email)})</td></tr>` : ''}
    <tr><td style="padding:6px 10px;background:#f4f6fb;font-weight:600">IP</td><td style="padding:6px 10px;border-bottom:1px solid #eef0f5">${esc(req.ip || '')}</td></tr>
  </table>

  <div style="margin-top:18px;padding:14px 18px;background:#f9fafc;border-left:3px solid #5b8dee;white-space:pre-wrap;font-size:14px;line-height:1.6">${esc(cleanMessage)}</div>

  <p style="margin-top:24px;color:#888;font-size:12px">Reply directly to this email to reach ${esc(cleanName)}.</p>
</div>`.trim();

    try {
        await t.sendMail({
            from: `"kaushalstack contact" <${SMTP_USER}>`,
            to: RECIPIENT,
            replyTo: `"${cleanName}" <${cleanEmail}>`,
            subject: `[kaushalstack] ${cleanSubject}`,
            text: `From: ${cleanName} <${cleanEmail}>\n${userMeta ? `Signed in as: @${userMeta.username} (${userMeta.email})\n` : ''}IP: ${req.ip}\n\nSubject: ${cleanSubject}\n\n${cleanMessage}`,
            html,
        });
        logger.info(`contact: sent message from ${cleanEmail}${userMeta ? ` (user @${userMeta.username})` : ''}`);
        res.json({ ok: true });
    } catch (err) {
        logger.error('contact send failed:', err.message);
        res.status(502).json({ error: 'Failed to send your message. Please try again in a few minutes.' });
    }
});

export default router;
