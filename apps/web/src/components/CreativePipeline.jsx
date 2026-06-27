import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Palette, Hammer, Rocket, Server, Globe, LogIn, ExternalLink,
  Download, Eye, CheckCircle2, AlertCircle, Lock, Sparkles, Paperclip, Megaphone, Mail,
} from 'lucide-react';
import { avatarUrl } from '@/lib/avatar';

// The design → build → deploy pipeline, rendered as a row of agent avatars
// below the round-table responses. Clicking an avatar opens that agent's
// section. Each downstream agent waits for the previous one:
//   Maya (design) → Ananya (build) → Hostinger (deploy)
// Hostinger owns the deploy button, which ships Ananya's build to the VPS.

const apiHref = (url) => `/api${(url || '').replace(/^\/api/, '')}`;

// Small status pill used inside section headers.
function Tag({ color, icon: Icon, children }) {
  return (
    <div style={{ fontSize: 11, color, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      {Icon && <Icon style={{ width: 13, height: 13 }} />}{children}
    </div>
  );
}

function FileList({ files, maxHeight }) {
  if (!files?.length) return null;
  return (
    <div style={{ marginBottom: 14, padding: '8px 12px', background: '#0a0c12', borderRadius: 6, border: '1px solid #1e2130', maxHeight, overflow: maxHeight ? 'auto' : undefined }}>
      {files.map(f => (
        <div key={f.path} style={{ fontSize: 11, color: '#8a91a8', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
          <span>{f.path}</span>
          <span style={{ color: '#4a4f60' }}>{f.bytes.toLocaleString()} B</span>
        </div>
      ))}
    </div>
  );
}

function ErrorBlock({ title, message, accent, onRetry, pendingSessionId, onRecover, recoveryNote }) {
  return (
    <div className="flex items-start gap-3">
      <AlertCircle style={{ width: 18, height: 18, color: '#f06b6b', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: '#f06b6b', fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11, color: '#8a91a8', fontFamily: 'monospace', marginTop: 4 }}>{message}</div>
        {pendingSessionId && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#0a0c12', border: '1px solid #2a3550', borderRadius: 6, fontSize: 11, color: '#a8b1c8', lineHeight: 1.55 }}>
            The stream dropped but the run may have finished on the server.
            <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {onRecover && (
                <button onClick={onRecover} style={{ color: accent, background: 'none', border: `1px solid ${accent}44`, borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>
                  Check if it finished
                </button>
              )}
              {recoveryNote && <span style={{ fontSize: 11, color: '#8a91a8', fontStyle: 'italic' }}>{recoveryNote}</span>}
            </div>
          </div>
        )}
        {onRetry && (
          <button onClick={onRetry} style={{ marginTop: 10, color: accent, background: 'none', border: `1px solid ${accent}44`, borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export default function CreativePipeline({
  members,              // [{ key, name, role, accent, theme, parallelWith? }] present in the team, in pipeline order
  phase,                // 'ideation' | 'execution' | 'marketing' | null — marketing hides Ananya + Hostinger
  spec, mockup, build, deploy, hostinger, social, email,
  generateSpec, setSpec, saveSpecEdits, sendSpecToMaya,
  uploadedSpec, sendUploadedToMaya,
  tech, conveneTechTeam,
  triggerMockup, triggerBuild, triggerDeploy, triggerSocial, triggerEmail,
  recoverMockup, recoverBuild, recoverSocial, recoverEmail,
  saveHostingerToken, showHostingerLogin, setShowHostingerLogin,
  hostingerToken, setHostingerToken, setHostinger,
  describeProgress, buildWillInheritDesign,
}) {
  // For marketing-phase chats, the pipeline ends at Maya — there's no website
  // to build or deploy. Drop Ananya + Hostinger before any downstream logic
  // (gating, default-selected step, avatar row, etc.) reads `members`.
  const visibleMembers = phase === 'marketing'
    ? members.filter(m => m.key !== 'ananya' && m.key !== 'hostinger')
    : members;
  const has = key => visibleMembers.some(m => m.key === key);

  // Auto-dim stages whose work the spec doesn't call for. Aisha is always
  // lit (she IS the spec). Maya dims if no design/UI keywords; Ananya dims
  // if no build/code keywords; Hostinger dims if no deploy/launch keywords.
  // Stages stay clickable (override) and the gating logic still applies —
  // dim is a hint, not a lock.
  const specText = (spec?.result?.text || '').toLowerCase();
  const DESIGN_RX = /\b(design|ui|ux|mockup|screen|page|layout|wireframe|interface|prototype|figma|font|palette|landing|app|website|web app|frontend|visual|brand)\b/;
  const BUILD_RX  = /\b(build|implement|code|develop|html|css|javascript|react|api|backend|frontend|database|deploy|ship|app|website|widget|tool|form|component)\b/;
  const DEPLOY_RX = /\b(deploy|deployment|host|hosting|hostinger|publish|launch|go[- ]live|production|domain|dns|ssl|vps|server|cloudflare|netlify|vercel)\b/;
  const SOCIAL_RX = /\b(social|instagram|insta|facebook|linkedin|twitter|tweet|x\b|post|reel|story|carousel|campaign|hashtag)\b/;
  const EMAIL_RX  = /\b(email|newsletter|inbox|preheader|subject\s+line|mailing\s+list|drip|onboarding|launch\s+email|announcement\s+email|email\s+campaign|email\s+blast)\b/;
  const stageRelevant = specText ? {
    aisha:     true,
    maya:      DESIGN_RX.test(specText),
    tara:      SOCIAL_RX.test(specText),
    kavya:     EMAIL_RX.test(specText),
    ananya:    BUILD_RX.test(specText),
    hostinger: DEPLOY_RX.test(specText),
  } : {
    aisha: true, maya: true, tara: true, kavya: true, ananya: true, hostinger: true,  // before spec exists, show all bright
  };

  // Gating — each downstream agent waits for the previous one to finish.
  // Aisha (Spec Engineer) is always unlocked because the round table itself
  // is her input — by the time the pipeline shows, the responses are in.
  // Maya is gated behind Aisha ONLY when Aisha is in the pipeline (legacy
  // builds without specs still let users jump straight to Maya).
  const lockedFor = {
    aisha:     false,
    maya:      has('aisha') && spec?.status !== 'done',
    tara:      has('aisha') && spec?.status !== 'done',  // parallel to Maya — same gating
    kavya:     has('aisha') && spec?.status !== 'done',  // parallel to Maya — same gating
    ananya:    has('maya') && mockup.status !== 'done',
    hostinger: build.status !== 'done',
  };
  const statusFor = {
    aisha:     spec?.status || 'idle',
    maya:      mockup.status,
    tara:      social?.status || 'idle',
    kavya:     email?.status || 'idle',
    ananya:    build.status,
    hostinger: deploy.status,
  };

  // Default selection: the furthest unlocked stage that still has work to do,
  // else the last completed stage, else the first avatar. A manual click wins.
  const firstActionable = visibleMembers.find(m => !lockedFor[m.key] && statusFor[m.key] !== 'done');
  const lastDone = [...visibleMembers].reverse().find(m => statusFor[m.key] === 'done');
  const computedDefault = (firstActionable || lastDone || visibleMembers[0])?.key;

  const [selected, setSelected] = useState(null);
  const effective = selected && visibleMembers.some(m => m.key === selected) ? selected : computedDefault;

  // Per-avatar visual status badge.
  const badgeFor = (m) => {
    if (lockedFor[m.key])              return { kind: 'locked' };
    if (statusFor[m.key] === 'running') return { kind: 'running' };
    if (statusFor[m.key] === 'done')    return { kind: 'done' };
    if (statusFor[m.key] === 'error')   return { kind: 'error' };
    return { kind: 'ready' };
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      style={{ marginTop: 16, padding: 20, background: '#0e1018', border: '1px solid #1e2130', borderRadius: 12 }}
    >
      {/* ── Avatar row ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
        {visibleMembers.map((m, i) => {
          const badge = badgeFor(m);
          const isSel = effective === m.key;
          const dim   = badge.kind === 'locked';
          // Visual hint: spec didn't mention this stage's work. Still clickable
          // so the user can override and run anyway.
          const notNeeded = !stageRelevant[m.key];
          const visualOpacity = dim ? 0.4 : notNeeded ? 0.55 : 1;
          return (
            <React.Fragment key={m.key}>
              {i > 0 && (() => {
                // Members tagged with `parallelWith: <prevKey>` render with a
                // `+` connector instead of `→` to signal they run in parallel
                // with the previous stage (e.g. Tara + Maya both branch off Aisha).
                const prev = visibleMembers[i - 1];
                const isParallel = m.parallelWith && m.parallelWith === prev?.key;
                return (
                  <div style={{ alignSelf: 'center', color: isParallel ? '#5a607a' : '#2a2e3f', fontSize: 18, margin: '0 -2px', marginBottom: 20, fontWeight: isParallel ? 600 : 400 }}>
                    {isParallel ? '+' : '→'}
                  </div>
                );
              })()}
              <button
                onClick={() => setSelected(m.key)}
                title={dim ? `Waiting for ${visibleMembers[i - 1]?.name || 'the previous step'}` : notNeeded ? `${m.role} — the spec doesn't call for this stage. Click to run anyway.` : m.role}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 92,
                  opacity: visualOpacity, transition: 'opacity 0.2s',
                }}
              >
                <div style={{ position: 'relative' }}>
                  <motion.img
                    src={avatarUrl(m.name, { theme: m.theme })}
                    alt={m.name}
                    animate={badge.kind === 'running' ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                    transition={badge.kind === 'running' ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
                    style={{
                      width: 54, height: 54, borderRadius: '50%', objectFit: 'cover',
                      border: `2px solid ${isSel ? m.accent : '#1e2130'}`,
                      boxShadow: isSel ? `0 0 0 4px ${m.accent}22` : 'none',
                      opacity: dim ? 0.4 : 1, transition: 'all 0.2s',
                    }}
                  />
                  {/* status badge */}
                  <div style={{
                    position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%',
                    background: '#0e1018', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {badge.kind === 'locked' && <Lock style={{ width: 11, height: 11, color: '#5a607a' }} />}
                    {badge.kind === 'done'   && <CheckCircle2 style={{ width: 14, height: 14, color: '#5cc28a' }} />}
                    {badge.kind === 'error'  && <AlertCircle style={{ width: 14, height: 14, color: '#f06b6b' }} />}
                    {badge.kind === 'running' && (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        style={{ width: 11, height: 11, borderRadius: '50%', border: `2px solid ${m.accent}`, borderTopColor: 'transparent' }} />
                    )}
                    {badge.kind === 'ready' && <div style={{ width: 9, height: 9, borderRadius: '50%', background: m.accent }} />}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isSel ? m.accent : '#c8ccd8' }}>{m.name}</div>
                  <div style={{ fontSize: 9, color: '#5a607a', fontFamily: 'monospace' }}>{m.role}</div>
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Selected section ─────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #1e2130', paddingTop: 16 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={effective}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            {effective === 'aisha'     && <AishaSection {...{ spec, setSpec, generateSpec, saveSpecEdits, sendSpecToMaya, uploadedSpec, sendUploadedToMaya, mockup, hasMaya: has('maya'), tech, conveneTechTeam }} />}
            {effective === 'maya'      && <MayaSection {...{ mockup, triggerMockup, recoverMockup, describeProgress, locked: lockedFor.maya }} />}
            {effective === 'tara'      && <TaraSection {...{ social, triggerSocial, recoverSocial, describeProgress, locked: lockedFor.tara }} />}
            {effective === 'kavya'     && <KavyaSection {...{ email, triggerEmail, recoverEmail, describeProgress, locked: lockedFor.kavya }} />}
            {effective === 'ananya'    && <AnanyaSection {...{ build, triggerBuild, recoverBuild, describeProgress, locked: lockedFor.ananya, buildWillInheritDesign }} />}
            {effective === 'hostinger' && (
              <HostingerSection {...{
                build, deploy, hostinger, triggerDeploy, locked: lockedFor.hostinger,
                saveHostingerToken, showHostingerLogin, setShowHostingerLogin,
                hostingerToken, setHostingerToken, setHostinger,
              }} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Maya — design mockups ───────────────────────────────────────────
// ── Aisha — Spec Engineer ───────────────────────────────────────────
// Synthesizes the round-table transcript into an editable spec doc and
// hands it off to Maya as her design brief. First step in the pipeline.
function AishaSection({ spec, setSpec, generateSpec, saveSpecEdits, sendSpecToMaya, uploadedSpec, sendUploadedToMaya, mockup, hasMaya, tech, conveneTechTeam }) {
  const accent = '#9b6cf0';
  if (spec.status === 'running') {
    return (
      <div className="flex items-center gap-3">
        <motion.div animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
          <Sparkles style={{ width: 22, height: 22, color: accent }} />
        </motion.div>
        <div>
          <div style={{ fontSize: 13, color: '#c8ccd8', fontWeight: 600 }}>Aisha is drafting the spec…</div>
          <div style={{ fontSize: 11, color: '#5a607a', marginTop: 2 }}>
            Synthesizing every agent's contribution into one structured doc. ~10s.
          </div>
        </div>
      </div>
    );
  }
  if (spec.status === 'done' && spec.result) {
    return (
      <>
        <div className="flex items-center gap-2" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
          <Tag color="#5cc28a" icon={CheckCircle2}>Spec ready</Tag>
          {spec.result.authors?.length > 0 && (
            <span style={{ fontSize: 10, color: '#5a607a', fontFamily: 'monospace', marginLeft: 4 }}>
              · authors: {spec.result.authors.join(', ')}
            </span>
          )}
          {spec.dirty && (
            <span style={{ fontSize: 10, color: '#f0a04b', fontFamily: 'monospace', marginLeft: 'auto' }}>● unsaved edits</span>
          )}
        </div>
        <textarea
          value={spec.editing}
          onChange={e => setSpec(s => ({ ...s, editing: e.target.value, dirty: e.target.value !== s.result?.text }))}
          spellCheck={false}
          style={{
            width: '100%', minHeight: 320,
            background: '#0a0c12', color: '#c8ccd8',
            border: '1px solid #1e2130', borderRadius: 8,
            padding: 12, fontSize: 12, lineHeight: 1.55,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            resize: 'vertical', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={saveSpecEdits} disabled={!spec.dirty} style={btn(spec.dirty ? '#5cc28a' : '#1e2130', spec.dirty ? '#0a0c12' : '#5a607a')}>
            <CheckCircle2 style={{ width: 12, height: 12 }} /> Save edits
          </button>
          {hasMaya && (
            <button onClick={sendSpecToMaya} disabled={mockup.status === 'running'} style={btn('#b07ef8')}>
              <Palette style={{ width: 12, height: 12 }} /> Send to Maya
            </button>
          )}
          {uploadedSpec && hasMaya && (
            <button onClick={sendUploadedToMaya} disabled={mockup.status === 'running'} title="Send your original uploaded spec to Maya, ignoring this combined draft" style={{ background: 'none', color: '#8a91a8', border: '1px solid #1e2130', borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Paperclip style={{ width: 12, height: 12 }} /> Send uploaded as-is
            </button>
          )}
          <button onClick={generateSpec} style={{ background: 'none', color: '#5a607a', border: '1px solid #1e2130', borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}>
            {uploadedSpec ? 'Re-combine' : 'Regenerate'}
          </button>
        </div>

        {/* ── Tech round table ──────────────────────────────────
            After v1 spec is ready, Aisha can convene a tech round
            table to review the spec from an engineering angle.
            Their perspectives get folded into a v2 spec automatically. */}
        {tech && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px dashed #1e2130' }}>
            {tech.status === 'idle' && (
              <>
                <div style={{ fontSize: 10, color: '#5a8dee', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Optional · convene tech team
                </div>
                <div style={{ fontSize: 12, color: '#8a91a8', marginBottom: 10, lineHeight: 1.6 }}>
                  Hand the spec to a fresh round table of tech specialists — they'll weigh in on architecture, stack choices, and engineering risks. Aisha will then update the spec with their input.
                </div>
                <button onClick={conveneTechTeam} disabled={spec.dirty} style={btn('#5b8dee')} title={spec.dirty ? 'Save your edits first' : 'Recommend a tech team and run a tech round table'}>
                  <Sparkles style={{ width: 12, height: 12 }} /> Convene tech team
                </button>
              </>
            )}
            {tech.status === 'recommending' && (
              <div style={{ fontSize: 12, color: '#8a91a8', fontFamily: 'monospace' }}>
                Picking tech specialists from the spec…
              </div>
            )}
            {tech.status === 'running' && (
              <div className="flex items-center gap-3">
                <motion.div animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
                  <Sparkles style={{ width: 18, height: 18, color: '#5b8dee' }} />
                </motion.div>
                <div>
                  <div style={{ fontSize: 12, color: '#c8ccd8', fontWeight: 600 }}>Tech round table in session…</div>
                  <div style={{ fontSize: 11, color: '#5a607a', marginTop: 2 }}>
                    {tech.team?.length || 0} specialists weighing in: {(tech.team || []).map(s => s.agent_name).join(', ')}
                  </div>
                </div>
              </div>
            )}
            {tech.status === 'done' && tech.responses?.length > 0 && (
              <>
                <Tag color="#5cc28a" icon={CheckCircle2}>Tech round table done</Tag>
                <div style={{ fontSize: 11, color: '#5a607a', fontFamily: 'monospace', marginBottom: 10 }}>
                  {tech.responses.length} response{tech.responses.length === 1 ? '' : 's'} folded into the spec above. Authors: {tech.responses.map(r => r.name).join(', ')}
                </div>
                <details style={{ marginBottom: 8 }}>
                  <summary style={{ fontSize: 11, color: '#5b8dee', fontFamily: 'monospace', cursor: 'pointer' }}>View tech responses ↓</summary>
                  <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: '2px solid #1e2130' }}>
                    {tech.responses.map((r, i) => (
                      <div key={i} style={{ marginBottom: 10, fontSize: 12, color: '#8a91a8', lineHeight: 1.55 }}>
                        <div style={{ fontWeight: 700, color: '#5b8dee', marginBottom: 2 }}>{r.name}</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{r.text}</div>
                      </div>
                    ))}
                  </div>
                </details>
                <button onClick={conveneTechTeam} style={{ background: 'none', color: '#5a607a', border: '1px solid #1e2130', borderRadius: 8, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }}>
                  Re-convene a fresh tech team
                </button>
              </>
            )}
            {tech.status === 'error' && (
              <div className="flex items-start gap-3">
                <AlertCircle style={{ width: 16, height: 16, color: '#f06b6b', flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#f06b6b', fontWeight: 600 }}>Tech round table failed</div>
                  <div style={{ fontSize: 11, color: '#8a91a8', fontFamily: 'monospace', marginTop: 4 }}>{tech.error}</div>
                  <button onClick={conveneTechTeam} style={{ marginTop: 8, color: '#5b8dee', background: 'none', border: '1px solid #5b8dee44', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>Try again</button>
                </div>
              </div>
            )}
          </div>
        )}
      </>
    );
  }
  if (spec.status === 'error') {
    return <ErrorBlock title="Spec generation failed" message={spec.error} accent={accent} onRetry={generateSpec} />;
  }
  // idle
  return (
    <>
      <Tag color={accent} icon={Sparkles}>{uploadedSpec ? 'Aisha can combine this' : 'Aisha can synthesize this'}</Tag>
      {uploadedSpec && (
        <div style={{ fontSize: 11, color: '#b07ef8', marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Paperclip style={{ width: 12, height: 12 }} /> From your uploaded spec · {uploadedSpec.filename}
        </div>
      )}
      <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 14, lineHeight: 1.65 }}>
        {uploadedSpec
          ? <>Merge your uploaded draft with everything the round table added — gaps filled, requirements tightened. Or skip Aisha and send your spec to Maya unchanged.</>
          : <>Turn the round table into a one-page spec — Problem, Goals, Requirements, Proposed approach, Rollout. Edit before {hasMaya ? 'sending to Maya' : 'using downstream'}.</>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={generateSpec} style={btn(accent)}>
          <Sparkles style={{ width: 14, height: 14 }} /> {uploadedSpec ? 'Generate combined spec' : 'Generate Spec'}
        </button>
        {uploadedSpec && hasMaya && (
          <button onClick={sendUploadedToMaya} disabled={mockup.status === 'running'} style={{ background: 'none', color: '#b07ef8', border: '1px solid #b07ef844', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Palette style={{ width: 14, height: 14 }} /> Use uploaded spec as-is → Maya
          </button>
        )}
      </div>
    </>
  );
}

function MayaSection({ mockup, triggerMockup, recoverMockup, describeProgress, locked }) {
  const accent = '#b07ef8';
  if (locked && mockup.status !== 'done') {
    return (
      <>
        <Tag color="#5a607a" icon={Lock}>Waiting for Aisha</Tag>
        <div style={{ fontSize: 13, color: '#8a91a8', lineHeight: 1.65 }}>
          Maya designs from the spec. Generate (or accept) Aisha's spec first, then come back here.
        </div>
      </>
    );
  }
  if (mockup.status === 'running') {
    const live = describeProgress(mockup.progress);
    return (
      <div className="flex items-center gap-3">
        <motion.div animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
          <Palette style={{ width: 22, height: 22, color: accent }} />
        </motion.div>
        <div>
          <div style={{ fontSize: 13, color: '#c8ccd8', fontWeight: 600 }}>Maya is sketching…</div>
          <div style={{ fontSize: 11, color: live ? accent : '#5a607a', marginTop: 2 }}>
            {live || 'Picking a palette, fetching photos, drawing 5 screens. 1–2 minutes.'}
          </div>
        </div>
      </div>
    );
  }
  if (mockup.status === 'done' && mockup.result) {
    return (
      <>
        <Tag color="#5cc28a" icon={CheckCircle2}>Mockups ready</Tag>
        <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 12, lineHeight: 1.65 }}>{mockup.result.summary}</div>
        <FileList files={mockup.result.files} maxHeight={180} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {mockup.result.preview_url && (
            <a href={apiHref(mockup.result.preview_url)} target="_blank" rel="noopener noreferrer" style={btn(accent)}>
              <Eye style={{ width: 14, height: 14 }} /> Preview
            </a>
          )}
          <a href={apiHref(mockup.result.download_url)} download style={btn('#5cc28a', '#0a0c12')}>
            <Download style={{ width: 14, height: 14 }} /> Download ZIP
          </a>
        </div>
      </>
    );
  }
  if (mockup.status === 'error') {
    return <ErrorBlock title="Mockup generation failed" message={mockup.error} accent={accent} onRetry={triggerMockup} pendingSessionId={mockup.pendingSessionId} onRecover={recoverMockup} recoveryNote={mockup.recoveryNote} />;
  }
  // idle
  return (
    <>
      <Tag color={accent}>Maya can design this</Tag>
      <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 14, lineHeight: 1.65 }}>
        Generate one polished landing page in a desktop browser frame — full conversion-page anatomy (hero, social proof, features, CTAs) — so you can see the page before anything ships.
      </div>
      <button onClick={triggerMockup} style={btn(accent)}>
        <Palette style={{ width: 14, height: 14 }} /> Design Landing Page
      </button>
    </>
  );
}

// ── Tara — design social posts (parallel to Maya) ───────────────────
// Same shape as MayaSection (locked / running / done / error / idle states)
// but reads from `social` state and renders the 4-platform campaign output.
function TaraSection({ social, triggerSocial, recoverSocial, describeProgress, locked }) {
  const accent = '#e070c2';
  if (locked && social?.status !== 'done') {
    return (
      <>
        <Tag color="#5a607a" icon={Lock}>Waiting for Aisha</Tag>
        <div style={{ fontSize: 13, color: '#8a91a8', lineHeight: 1.65 }}>
          Tara works from the same spec as Maya. Generate (or accept) Aisha's spec first, then come back here.
        </div>
      </>
    );
  }
  if (social?.status === 'running') {
    const live = describeProgress(social.progress);
    return (
      <div className="flex items-center gap-3">
        <motion.div animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
          <Megaphone style={{ width: 22, height: 22, color: accent }} />
        </motion.div>
        <div>
          <div style={{ fontSize: 13, color: '#c8ccd8', fontWeight: 600 }}>Tara is composing across 4 platforms…</div>
          <div style={{ fontSize: 11, color: live ? accent : '#5a607a', marginTop: 2 }}>
            {live || 'Drafting captions for IG, FB, LinkedIn, and X in parallel; fetching shared hero photos; rendering per-platform chrome. 2–3 minutes.'}
          </div>
        </div>
      </div>
    );
  }
  if (social?.status === 'done' && social.result) {
    return (
      <>
        <Tag color="#5cc28a" icon={CheckCircle2}>Posts ready</Tag>
        <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 12, lineHeight: 1.65 }}>{social.result.summary}</div>
        <FileList files={social.result.files} maxHeight={180} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {social.result.preview_url && (
            <a href={apiHref(social.result.preview_url)} target="_blank" rel="noopener noreferrer" style={btn(accent)}>
              <Eye style={{ width: 14, height: 14 }} /> Preview
            </a>
          )}
          <a href={apiHref(social.result.download_url)} download style={btn('#5cc28a', '#0a0c12')}>
            <Download style={{ width: 14, height: 14 }} /> Download ZIP
          </a>
        </div>
      </>
    );
  }
  if (social?.status === 'error') {
    return <ErrorBlock title="Social campaign generation failed" message={social.error} accent={accent} onRetry={triggerSocial} pendingSessionId={social.pendingSessionId} onRecover={recoverSocial} recoveryNote={social.recoveryNote} />;
  }
  // idle
  return (
    <>
      <Tag color={accent}>Tara can post this</Tag>
      <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 14, lineHeight: 1.65 }}>
        Generate all four platforms in parallel — Instagram, Facebook, LinkedIn, and X — each rendered inside its own platform UI chrome with captions, hashtags, and asset specs.
      </div>
      <button onClick={triggerSocial} style={btn(accent)}>
        <Megaphone style={{ width: 14, height: 14 }} /> Design 4-platform campaign
      </button>
    </>
  );
}

// ── Kavya — email campaign (parallel to Maya / Tara) ────────────────
// Same state machine as MayaSection / TaraSection; reads from `email` state.
function KavyaSection({ email, triggerEmail, recoverEmail, describeProgress, locked }) {
  const accent = '#f0a04b';
  if (locked && email?.status !== 'done') {
    return (
      <>
        <Tag color="#5a607a" icon={Lock}>Waiting for Aisha</Tag>
        <div style={{ fontSize: 13, color: '#8a91a8', lineHeight: 1.65 }}>
          Kavya works from the same spec as Maya and Tara. Generate (or accept) Aisha's spec first, then come back here.
        </div>
      </>
    );
  }
  if (email?.status === 'running') {
    const live = describeProgress(email.progress);
    return (
      <div className="flex items-center gap-3">
        <motion.div animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
          <Mail style={{ width: 22, height: 22, color: accent }} />
        </motion.div>
        <div>
          <div style={{ fontSize: 13, color: '#c8ccd8', fontWeight: 600 }}>Kavya is drafting…</div>
          <div style={{ fontSize: 11, color: live ? accent : '#5a607a', marginTop: 2 }}>
            {live || 'Choosing a frame, writing copy, inlining CSS, fetching a hero photo. 1–2 minutes.'}
          </div>
        </div>
      </div>
    );
  }
  if (email?.status === 'done' && email.result) {
    return (
      <>
        <Tag color="#5cc28a" icon={CheckCircle2}>Email ready</Tag>
        <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 12, lineHeight: 1.65 }}>{email.result.summary}</div>
        <FileList files={email.result.files} maxHeight={180} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {email.result.preview_url && (
            <a href={apiHref(email.result.preview_url)} target="_blank" rel="noopener noreferrer" style={btn(accent)}>
              <Eye style={{ width: 14, height: 14 }} /> Preview
            </a>
          )}
          <a href={apiHref(email.result.download_url)} download style={btn('#5cc28a', '#0a0c12')}>
            <Download style={{ width: 14, height: 14 }} /> Download ZIP
          </a>
        </div>
      </>
    );
  }
  if (email?.status === 'error') {
    return <ErrorBlock title="Email generation failed" message={email.error} accent={accent} onRetry={triggerEmail} pendingSessionId={email.pendingSessionId} onRecover={recoverEmail} recoveryNote={email.recoveryNote} />;
  }
  // idle
  return (
    <>
      <Tag color={accent}>Kavya can draft this</Tag>
      <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 14, lineHeight: 1.65 }}>
        Generate a send-ready HTML email — subject-line variants, preheader, plain-text fallback, all inside a Gmail-frame preview.
      </div>
      <button onClick={triggerEmail} style={btn(accent)}>
        <Mail style={{ width: 14, height: 14 }} /> Design Email Campaign
      </button>
    </>
  );
}

// ── Ananya — build the production site ──────────────────────────────
function AnanyaSection({ build, triggerBuild, recoverBuild, describeProgress, locked, buildWillInheritDesign }) {
  const accent = '#5b8dee';
  if (locked && build.status !== 'done') {
    return (
      <>
        <Tag color="#5a607a" icon={Lock}>Waiting for Maya</Tag>
        <div style={{ fontSize: 13, color: '#8a91a8', lineHeight: 1.65 }}>
          Ananya builds the production website from <span style={{ color: '#b07ef8', fontWeight: 600 }}>Maya's palette, typography, and layout</span>. Generate the mockups first.
        </div>
      </>
    );
  }
  if (build.status === 'running') {
    const live = describeProgress(build.progress);
    return (
      <div className="flex items-center gap-3">
        <motion.div animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
          <Hammer style={{ width: 22, height: 22, color: accent }} />
        </motion.div>
        <div>
          <div style={{ fontSize: 13, color: '#c8ccd8', fontWeight: 600 }}>Ananya is building…</div>
          <div style={{ fontSize: 11, color: live ? accent : '#5a607a', marginTop: 2 }}>
            {live || 'Reading the brief, calling tools, writing files. 30–90 seconds.'}
          </div>
        </div>
      </div>
    );
  }
  if (build.status === 'done' && build.result) {
    return (
      <>
        <Tag color="#5cc28a" icon={CheckCircle2}>App ready</Tag>
        {build.result.design_applied === true && (
          <div style={{ fontSize: 11, color: '#b07ef8', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Sparkles style={{ width: 12, height: 12 }} /> Built from Maya's design — palette, type & layout inherited.
          </div>
        )}
        {build.result.design_applied === false && buildWillInheritDesign && (
          <div style={{ fontSize: 11, color: '#f0a04b', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle style={{ width: 12, height: 12 }} /> Maya's design couldn't be loaded — built from the round-table brief only.
          </div>
        )}
        <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 12, lineHeight: 1.65 }}>{build.result.summary}</div>
        <FileList files={build.result.files} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {build.result.preview_url && (
            <a href={apiHref(build.result.preview_url)} target="_blank" rel="noopener noreferrer" style={btn(accent)}>
              <Eye style={{ width: 14, height: 14 }} /> Preview
            </a>
          )}
          <a href={apiHref(build.result.download_url)} download style={btn('#5cc28a', '#0a0c12')}>
            <Download style={{ width: 14, height: 14 }} /> Download ZIP
          </a>
        </div>
        <div style={{ fontSize: 11, color: '#5a607a', marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Rocket style={{ width: 12, height: 12 }} /> Open the <span style={{ color: '#9b6cf0', fontWeight: 600 }}>Hostinger</span> avatar to deploy this live.
        </div>
      </>
    );
  }
  if (build.status === 'error') {
    return <ErrorBlock title="Build failed" message={build.error} accent={accent} onRetry={triggerBuild} pendingSessionId={build.pendingSessionId} onRecover={recoverBuild} recoveryNote={build.recoveryNote} />;
  }
  // idle (unlocked)
  return (
    <>
      <Tag color={accent} icon={buildWillInheritDesign ? Sparkles : undefined}>
        {buildWillInheritDesign ? "Ananya will build from Maya's design" : 'Ananya can build this'}
      </Tag>
      <div style={{ fontSize: 13, color: '#c8ccd8', marginBottom: 14, lineHeight: 1.65 }}>
        {buildWillInheritDesign
          ? <>Ananya inherits Maya's <span style={{ color: '#b07ef8', fontWeight: 600 }}>palette, typography, and layout</span>, then ships the production website.</>
          : <>The team's input becomes Ananya's brief. She'll write the files, you download the ZIP.</>}
      </div>
      <button onClick={triggerBuild} style={btn(accent)}>
        <Hammer style={{ width: 14, height: 14 }} /> {buildWillInheritDesign ? "Build from Maya's design" : 'Build & Download'}
      </button>
    </>
  );
}

// ── Hostinger — deploy Ananya's build to the VPS ────────────────────
function HostingerSection({
  build, deploy, hostinger, triggerDeploy, locked,
  saveHostingerToken, showHostingerLogin, setShowHostingerLogin,
  hostingerToken, setHostingerToken, setHostinger,
}) {
  const accent = '#9b6cf0';

  if (locked) {
    return (
      <>
        <Tag color="#5a607a" icon={Lock}>Waiting for Ananya</Tag>
        <div style={{ fontSize: 13, color: '#8a91a8', lineHeight: 1.65 }}>
          Hostinger deploys the site Ananya builds. Run the build first, then come back here to go live.
        </div>
      </>
    );
  }

  if (deploy.status === 'done' && deploy.result) {
    return (
      <>
        <Tag color="#5cc28a" icon={CheckCircle2}>Deployed to VPS</Tag>
        <div style={{ padding: '12px 14px', background: '#0a0c12', borderRadius: 8, border: '1px solid #5cc28a44' }}>
          <div style={{ fontSize: 12, color: '#c8ccd8', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Server style={{ width: 13, height: 13, color: accent, flexShrink: 0 }} />
            <span>Private IP:&nbsp;</span>
            <span style={{ color: '#fff', fontWeight: 700, wordBreak: 'break-all' }}>
              {deploy.result.private_ip}{deploy.result.port ? `:${deploy.result.port}` : ''}{deploy.result.path}
            </span>
          </div>
          <a href={deploy.result.url} target="_blank" rel="noopener noreferrer" style={{ ...btn(accent), marginTop: 10, padding: '8px 14px', fontSize: 12 }}>
            <Globe style={{ width: 13, height: 13 }} /> Open live site <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
        </div>
      </>
    );
  }

  if (deploy.status === 'running') {
    return (
      <>
        <Tag color={accent} icon={Rocket}>Deploying</Tag>
        <div className="flex items-center gap-3">
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
            <Rocket style={{ width: 20, height: 20, color: accent }} />
          </motion.div>
          <div style={{ fontSize: 12, color: deploy.progress?.message ? accent : '#8a91a8' }}>
            {deploy.progress?.message || 'Deploying to the VPS…'}
          </div>
        </div>
      </>
    );
  }

  // Not deployed yet — connect or deploy.
  return (
    <>
      <Tag color={accent} icon={Rocket}>Go live on Hostinger</Tag>
      {!hostinger.connected ? (
        showHostingerLogin ? (
          <div>
            <div style={{ fontSize: 12, color: '#8a91a8', marginBottom: 8, lineHeight: 1.6 }}>
              Paste your Hostinger hPanel API token to connect. It's encrypted and never shown again.
            </div>
            <input
              type="password"
              value={hostingerToken}
              onChange={e => setHostingerToken(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveHostingerToken(); }}
              placeholder="hPanel API token"
              style={{ width: '100%', padding: '9px 12px', fontSize: 12, fontFamily: 'monospace', background: '#0a0c12', color: '#fff', border: '1px solid #1e2130', borderRadius: 8, marginBottom: 8 }}
            />
            {hostinger.error && <div style={{ fontSize: 11, color: '#f06b6b', marginBottom: 8 }}>{hostinger.error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveHostingerToken} disabled={hostinger.saving || !hostingerToken.trim()}
                style={{ ...btn(accent), opacity: hostinger.saving || !hostingerToken.trim() ? 0.6 : 1, cursor: hostinger.saving || !hostingerToken.trim() ? 'not-allowed' : 'pointer' }}>
                {hostinger.saving ? 'Connecting…' : 'Connect Hostinger'}
              </button>
              <button onClick={() => { setShowHostingerLogin(false); setHostinger(h => ({ ...h, error: null })); }}
                style={{ background: 'none', color: '#8a91a8', border: '1px solid #1e2130', borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: '#8a91a8', marginBottom: 10, lineHeight: 1.6 }}>
              Connect your Hostinger account to deploy Ananya's build to your VPS in one click.
            </div>
            <button onClick={() => setShowHostingerLogin(true)} style={btn(accent)}>
              <LogIn style={{ width: 14, height: 14 }} /> Login to Hostinger
            </button>
          </div>
        )
      ) : (
        <div>
          <div style={{ fontSize: 12, color: '#8a91a8', marginBottom: 10, lineHeight: 1.6 }}>
            Connected to Hostinger{hostinger.last4 ? ` ·••••${hostinger.last4}` : ''}. Push Ananya's build to your VPS now.
          </div>
          <button onClick={triggerDeploy} disabled={!build.result?.session_id}
            style={{ ...btn(accent), opacity: build.result?.session_id ? 1 : 0.6, cursor: build.result?.session_id ? 'pointer' : 'not-allowed' }}>
            <Rocket style={{ width: 14, height: 14 }} /> Deploy to Hostinger
          </button>
        </div>
      )}
      {deploy.status === 'error' && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#f06b6b', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
          <span>{deploy.error}</span>
        </div>
      )}
    </>
  );
}

// Shared button style.
function btn(bg, fg = '#fff') {
  return {
    background: bg, color: fg, border: 'none', borderRadius: 8,
    padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
  };
}
