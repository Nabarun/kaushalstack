import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, GitMerge, ThumbsUp, ThumbsDown, MessageCircle, Bot, GitPullRequest } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import pb from '@/lib/pocketbaseClient';

const POLL_INTERVAL_MS = 60 * 1000;

function relativeTime(iso) {
  if (!iso) return '';
  const ms   = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Render a single notification: icon, headline, secondary text, link target
function describe(n) {
  const skill = n.data?.skill_name || 'a skill';
  const actor = n.actor?.username  || 'A reviewer';

  switch (n.kind) {
    case 'edit_merged':
      return {
        icon: <GitMerge className="w-4 h-4 text-green-600" />,
        title: `Your edit on "${skill}" was merged`,
        body: `Now at v${n.data?.version || 2} · +5 points`,
        link: '/skills',
      };
    case 'edit_discarded':
      return {
        icon: <ThumbsDown className="w-4 h-4 text-red-500" />,
        title: `Your edit on "${skill}" was discarded`,
        body: `${n.data?.rejections_count || 6} rejections reached`,
        link: '/skills',
      };
    case 'edit_voted':
      return {
        icon: n.data?.vote === 'approve'
          ? <ThumbsUp className="w-4 h-4 text-green-600" />
          : <ThumbsDown className="w-4 h-4 text-amber-500" />,
        title: `${actor} ${n.data?.vote === 'approve' ? 'approved' : 'rejected'} your edit on "${skill}"`,
        body: n.data?.vote === 'approve'
          ? `${n.data?.approvals_count || 0} of ${n.data?.threshold || 3} approvals`
          : `${n.data?.rejections_count || 0} of ${n.data?.threshold || 6} rejections`,
        link: '/review',
      };
    case 'edit_ai_reviewed':
      return {
        icon: <Bot className="w-4 h-4 text-purple-600" />,
        title: `AI ${n.data?.decision === 'approve' ? 'approved' : 'rejected'} your edit on "${skill}"`,
        body: n.data?.reason || '',
        link: '/review',
      };
    case 'comment_on_skill':
      return {
        icon: <MessageCircle className="w-4 h-4 text-blue-500" />,
        title: `${actor} commented on "${skill}"`,
        body: n.data?.comment_excerpt || '',
        link: '/skills',
      };
    default:
      return { icon: <Bell className="w-4 h-4" />, title: 'New activity', body: '', link: '/' };
  }
}

function authedFetch(path, opts = {}) {
  const token = pb.authStore.token;
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
}

export default function NotificationBell() {
  const [open, setOpen]             = useState(false);
  const [items, setItems]           = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading]       = useState(false);
  const dropdownRef = useRef(null);

  async function refreshCount() {
    try {
      const r = await authedFetch('/api/me/notifications/unread-count');
      if (!r.ok) return;
      const d = await r.json();
      setUnreadCount(d.count || 0);
    } catch {}
  }

  async function refreshList() {
    setLoading(true);
    try {
      const r = await authedFetch('/api/me/notifications');
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.items || []);
    } catch {} finally { setLoading(false); }
  }

  // Initial count + poll
  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  // Open dropdown → refresh list
  useEffect(() => {
    if (open) refreshList();
  }, [open]);

  // Click outside → close
  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleClickItem(n) {
    if (!n.read_at) {
      // optimistic
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      setUnreadCount(c => Math.max(0, c - 1));
      authedFetch(`/api/me/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    }
    setOpen(false);
  }

  async function markAllRead() {
    setItems(prev => prev.map(x => x.read_at ? x : { ...x, read_at: new Date().toISOString() }));
    setUnreadCount(0);
    try { await authedFetch('/api/me/notifications/read-all', { method: 'POST' }); }
    catch {}
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border bg-popover shadow-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Notifications</span>
                {unreadCount > 0 && <span className="text-xs text-muted-foreground">{unreadCount} unread</span>}
              </div>
              {items.some(i => !i.read_at) && (
                <button
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>

            {/* Body */}
            <div className="max-h-[420px] overflow-y-auto">
              {loading ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-medium">You're all caught up</p>
                  <p className="text-xs text-muted-foreground mt-1">Activity on your skills and edits will show up here.</p>
                </div>
              ) : (
                items.map(n => {
                  const d = describe(n);
                  const unread = !n.read_at;
                  return (
                    <Link
                      key={n.id}
                      to={d.link}
                      onClick={() => handleClickItem(n)}
                      className={`flex items-start gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${unread ? 'bg-primary/5' : ''}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        {d.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm leading-snug">
                          <span className={unread ? 'font-semibold' : 'font-medium'}>{d.title}</span>
                        </div>
                        {d.body && (
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{d.body}</div>
                        )}
                        <div className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                          {relativeTime(n.created)}
                        </div>
                      </div>
                      {unread && (
                        <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                      )}
                    </Link>
                  );
                })
              )}
            </div>

            <div className="border-t px-4 py-2 text-center">
              <Link
                to="/profile"
                onClick={() => setOpen(false)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Manage email preferences
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
