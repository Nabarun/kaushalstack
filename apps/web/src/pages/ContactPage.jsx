import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Send, CheckCircle2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext.jsx';
import pb from '@/lib/pocketbaseClient';

const MAX_MESSAGE = 5000;

export default function ContactPage() {
  const { currentUser } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '', honeypot: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Pre-fill from the logged-in account
  useEffect(() => {
    if (!currentUser) return;
    setForm(f => ({
      ...f,
      name:  f.name  || currentUser.name || currentUser.username || '',
      email: f.email || currentUser.email || '',
    }));
  }, [currentUser?.id]);

  function set(k) {
    return e => setForm(f => ({ ...f, [k]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const token = pb.authStore.token;
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(form),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Server error (${r.status})`);
      setDone(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <Helmet><title>Message sent - kaushalstack</title></Helmet>
        <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-muted/10">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-md">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-3">Message sent</h1>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Thanks for the feedback. I'll read it personally and get back to you at <span className="font-mono">{form.email}</span> as soon as I can.
            </p>
            <div className="flex gap-3 justify-center">
              <Link to="/"><Button variant="outline">Back to home</Button></Link>
              <Button onClick={() => { setDone(false); setForm(f => ({ ...f, subject: '', message: '' })); }}>Send another</Button>
            </div>
          </motion.div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Contact us - kaushalstack</title>
        <meta name="description" content="Send feedback or report an issue. Goes straight to the maintainer." />
      </Helmet>

      <div className="min-h-screen py-12 bg-muted/10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-5">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Feedback &amp; support</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight">Contact us</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Found a bug, broken flow, or want to suggest a feature? Drop a note — it lands directly in the maintainer's inbox.
            </p>
          </div>

          <Card>
            <CardContent className="p-6 sm:p-8">
              <form onSubmit={submit} className="space-y-4">
                {/* Honeypot — invisible to humans, irresistible to spam bots */}
                <input
                  type="text"
                  name="honeypot"
                  value={form.honeypot}
                  onChange={set('honeypot')}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Your name</Label>
                    <Input id="name" value={form.name} onChange={set('name')} required maxLength={100}
                      className="text-gray-900 dark:text-gray-100" placeholder="Jane Doe" />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={form.email} onChange={set('email')} required maxLength={200}
                      className="text-gray-900 dark:text-gray-100" placeholder="you@example.com" />
                  </div>
                </div>

                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" value={form.subject} onChange={set('subject')} maxLength={200}
                    className="text-gray-900 dark:text-gray-100" placeholder="Quick summary (optional)" />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="message">Message</Label>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {form.message.length} / {MAX_MESSAGE}
                    </span>
                  </div>
                  <Textarea
                    id="message"
                    rows={8}
                    value={form.message}
                    onChange={set('message')}
                    required
                    minLength={5}
                    maxLength={MAX_MESSAGE}
                    className="text-gray-900 dark:text-gray-100 resize-y"
                    placeholder="Tell me what's broken, missing, or working well…"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    Sent securely · max 5 messages per hour
                  </div>
                  <Button type="submit" disabled={busy} className="gap-1.5">
                    <Send className="w-3.5 h-3.5" /> {busy ? 'Sending…' : 'Send message'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
