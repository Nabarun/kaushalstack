import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';

// Notification kinds — keep in sync with the PB select field.
export const NotificationKind = Object.freeze({
    EDIT_VOTED:        'edit_voted',
    EDIT_MERGED:       'edit_merged',
    EDIT_DISCARDED:    'edit_discarded',
    EDIT_AI_REVIEWED:  'edit_ai_reviewed',
    COMMENT_ON_SKILL:  'comment_on_skill',
});

// Email is only sent for the high-emotion kinds. Other events still write a
// row (visible in the bell), they just don't push to inbox.
const EMAIL_KINDS = new Set([
    NotificationKind.EDIT_MERGED,
    NotificationKind.EDIT_DISCARDED,
    NotificationKind.COMMENT_ON_SKILL,
]);

const SITE_URL = process.env.SITE_URL || 'https://kaushalstack.com';

// Lazy-built nodemailer transporter (shared with the contact route).
let transporter = null;
function getTransporter() {
    if (transporter) return transporter;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) { logger.warn('notifications: SMTP not configured — emails skipped'); return null; }
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        requireTLS: true,
        auth: { user, pass },
    });
    return transporter;
}

function esc(s) {
    return (s || '').toString().replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Build a (subject, html, text) tuple for each kind. Data shape is documented
// next to each case.
function renderEmail(kind, data) {
    const skillUrl = data.skill_id ? `${SITE_URL}/skills` : SITE_URL; // skill detail isn't a direct URL; deep-link to listing for now
    const settingsLink = `<p style="font-size:12px;color:#888;margin-top:24px">You can turn these off from your <a href="${SITE_URL}/profile">profile</a>.</p>`;

    switch (kind) {
        case NotificationKind.EDIT_MERGED: {
            // data: { skill_name, version, approvals_count }
            const subject = `Your edit on "${data.skill_name}" was merged 🎉`;
            const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;color:#222">
  <h2 style="color:hsl(25,95%,53%)">Your edit was merged</h2>
  <p>Hey — your proposed edit on <strong>${esc(data.skill_name)}</strong> just collected its 3rd approval and is now live as version <strong>${esc(data.version)}</strong>.</p>
  <p style="background:#fff4e8;border-left:3px solid hsl(25,95%,53%);padding:12px 16px;border-radius:8px;margin:18px 0">
    +5 points have been added to your contribution score.
  </p>
  <p><a href="${SITE_URL}/skills" style="display:inline-block;background:hsl(25,95%,53%);color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">View the skill</a></p>
  ${settingsLink}
</div>`;
            const text = `Your edit on "${data.skill_name}" was merged. Now at version ${data.version}. +5 points awarded. ${SITE_URL}/skills`;
            return { subject, html, text };
        }
        case NotificationKind.EDIT_DISCARDED: {
            // data: { skill_name, rejections_count }
            const subject = `Your edit on "${data.skill_name}" was not merged`;
            const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;color:#222">
  <h2>Your edit didn't make it through</h2>
  <p>Your proposed edit on <strong>${esc(data.skill_name)}</strong> collected ${esc(data.rejections_count || 6)} rejections from reviewers and has been discarded.</p>
  <p>Not the end — try a tighter, more specific version. Reviewers tend to approve focused, small edits faster than sweeping rewrites.</p>
  <p><a href="${SITE_URL}/skills" style="display:inline-block;background:hsl(25,95%,53%);color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Propose another</a></p>
  ${settingsLink}
</div>`;
            const text = `Your edit on "${data.skill_name}" was discarded after ${data.rejections_count || 6} rejections. ${SITE_URL}/skills`;
            return { subject, html, text };
        }
        case NotificationKind.COMMENT_ON_SKILL: {
            // data: { skill_name, comment_excerpt, author_username }
            const subject = `New comment on "${data.skill_name}"`;
            const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;color:#222">
  <h2>${esc(data.author_username || 'Someone')} commented on your skill</h2>
  <p><strong>${esc(data.skill_name)}</strong></p>
  <blockquote style="border-left:3px solid hsl(25,95%,53%);padding:10px 14px;background:#fff4e8;border-radius:6px;margin:14px 0;font-size:14px">${esc(data.comment_excerpt || '')}</blockquote>
  <p><a href="${SITE_URL}/skills" style="display:inline-block;background:hsl(25,95%,53%);color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Read the comment</a></p>
  ${settingsLink}
</div>`;
            const text = `${data.author_username || 'Someone'} commented on "${data.skill_name}": ${data.comment_excerpt || ''}`;
            return { subject, html, text };
        }
        default:
            return null;
    }
}

/**
 * Fire a notification for a user. Writes a row, then conditionally emails.
 * Self-events (userId === actorId) are dropped so you don't notify yourself.
 *
 * Never throws — notification failures must not break the action that
 * triggered them. Logged at warn.
 */
export async function notify({ userId, kind, actor_id = null, subject_id = null, data = {} }) {
    if (!userId)                       return;
    if (actor_id && actor_id === userId) return;

    // 1. Write the row (always — appears in the bell)
    let row = null;
    try {
        row = await pb.collection('notifications').create({
            user_id: userId, kind, actor_id: actor_id || '', subject_id: subject_id || '', data,
        });
    } catch (err) {
        logger.warn('notify: write failed', kind, err.message);
        return;
    }

    // 2. Email (only for high-emotion kinds + opt-in)
    if (!EMAIL_KINDS.has(kind)) return row;

    try {
        const user = await pb.collection('users').getOne(userId).catch(() => null);
        if (!user || !user.email) return row;
        if (user.notify_email_disabled) return row;

        const t = getTransporter();
        if (!t) return row;

        const email = renderEmail(kind, data);
        if (!email) return row;

        await t.sendMail({
            from: `"kaushalstack" <${process.env.SMTP_USER}>`,
            to: user.email,
            subject: email.subject,
            text: email.text,
            html: email.html,
        });
        logger.info(`notify-email: ${kind} → ${user.email}`);
    } catch (err) {
        logger.warn('notify: email failed', kind, err.message);
    }

    return row;
}
