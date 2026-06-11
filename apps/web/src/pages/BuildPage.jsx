import React, { useState, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Send, Download, FileText, Wrench, CheckCircle2, AlertCircle, Eye } from 'lucide-react';

const EXAMPLES = [
  'A landing page for a Bangalore physiotherapy clinic',
  'A countdown timer for the IPL 2026 final',
  'A simple to-do list with localStorage',
  'A pricing page with 3 plans and a feature comparison',
];

const BuildPage = () => {
  const [query, setQuery]       = useState('');
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const inputRef = useRef(null);

  async function submit(prompt) {
    const text = (prompt || query).trim();
    if (!text || running) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'build failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>App Builder - kaushalstack</title>
      </Helmet>
      <div className="min-h-screen py-12 bg-muted/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Dev Engineer · Ananya</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-3 tracking-tight">
              Build a static app, downloadable in seconds
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Describe what you want. Ananya uses filesystem tools to write the files, and you download the result as a ZIP.
            </p>
          </div>

          {/* Prompt */}
          <div className="bg-card rounded-2xl border shadow-md px-4 py-3 focus-within:border-primary transition-colors mb-4">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={2}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="Build me a..."
                className="flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed placeholder:text-muted-foreground"
                disabled={running}
              />
              <button
                onClick={() => submit()}
                disabled={running || !query.trim()}
                className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Example chips */}
          {!result && !running && (
            <div className="flex flex-wrap gap-2 mb-8">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => { setQuery(ex); submit(ex); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          {/* Running */}
          {running && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Wrench className="w-5 h-5 text-primary animate-pulse" />
                </div>
                <div>
                  <div className="font-semibold">Ananya is building…</div>
                  <div className="text-xs text-muted-foreground">Calling filesystem tools, writing files. Usually 30–90 seconds.</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error */}
          {error && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-destructive">Build failed</div>
                  <div className="text-xs text-muted-foreground font-mono mt-1">{error}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4">
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold mb-1">App ready</div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.preview_url && (
                      <a href={`/api${result.preview_url.replace(/^\/api/, '')}`} target="_blank" rel="noopener noreferrer">
                        <Button size="lg" variant="default" className="gap-2">
                          <Eye className="w-4 h-4" /> Preview
                        </Button>
                      </a>
                    )}
                    <a href={`/api${result.download_url.replace(/^\/api/, '')}`} download>
                      <Button size="lg" variant="secondary" className="gap-2">
                        <Download className="w-4 h-4" /> Download ZIP
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* File manifest */}
              {result.files?.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Files written</span>
                      <Badge variant="secondary" className="text-xs">{result.files.length}</Badge>
                    </div>
                    <ul className="space-y-1 font-mono text-xs">
                      {result.files.map(f => (
                        <li key={f.path} className="flex justify-between text-muted-foreground">
                          <span className="text-foreground">{f.path}</span>
                          <span>{f.bytes.toLocaleString()} B</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Trace */}
              {result.trace?.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Wrench className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Agent trace</span>
                      <Badge variant="secondary" className="text-xs">{result.trace.length} steps</Badge>
                    </div>
                    <ul className="space-y-2">
                      {result.trace.map((t, i) => (
                        <li key={i} className="text-xs font-mono border-l-2 border-border pl-3 py-1">
                          {t.kind === 'tool' && (
                            <>
                              <div className="text-primary">{t.name}({Object.keys(t.args).map(k => `${k}=…`).join(', ')})</div>
                              {t.result_preview && <div className="text-muted-foreground truncate">→ {t.result_preview}</div>}
                            </>
                          )}
                          {t.kind === 'final' && <div className="text-muted-foreground">final response</div>}
                          {t.kind === 'truncated' && <div className="text-destructive">truncated — hit max turns</div>}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <div className="text-center pt-4">
                <Button variant="outline" onClick={() => { setResult(null); setError(null); setQuery(''); setTimeout(() => inputRef.current?.focus(), 50); }}>
                  Build another
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default BuildPage;
