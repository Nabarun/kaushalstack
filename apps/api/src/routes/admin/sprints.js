import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { chatComplete } from '../../providers/index.js';
import { ensureSprintCollections } from '../../sprint/collections.js';
import { SEED_TEAMS } from '../../sprint/seed-teams.js';
import { requireAdmin } from './auth.js';

const router = Router();

const CHAT_PROVIDER = 'openai';
const CHAT_MODEL = 'gpt-4o-mini';

// Standing context every team shares. Lives here rather than in each team's
// seeded briefing so already-seeded boards learn it too, without a migration.
const HOUSE_FACTS = `# How we work (applies to every team)

There is one shared test framework for the whole portfolio, at
~/Projects/KaushalStackTestFramework. Each team owns a suite under
suites/<project>/. The rules:

- Test code NEVER lives inside a customer's own repository. A suite reaches into
  its project by absolute path, and the project must be byte-identical before
  and after a run. If a test cannot run without changing the project's source,
  that change is raised as a work item — never made quietly.
- Every external service is mocked or starved of credentials: OpenProcure,
  Facebook/Instagram/LinkedIn, the kaushalstack partner API, Sarvam, OpenAI,
  Anthropic, Twilio, Razorpay, SMTP, Cloudinary. A suite must pass offline.
- Runners are 'node --test' (zero dependencies) or pytest for Python projects.
- './run_all.sh' runs everything; 'run_daily.sh' is the scheduled daily job. It
  posts results to the admin Test dashboard (/admin/tests), which is where the
  green/red state on your sprint card comes from.

As of 26 Jul 2026 every team except Royal Interiors (which joined the board
later that day) has ONE happy-path test passing — 11 tests across 9 suites, all
green. The agreed next step is negative-path coverage — the failure modes named
in your mandated P0 work item — and for Royal Interiors, its first suite.
Writing the first happy tests already surfaced three confirmed bugs
(ReFunction's unauthenticated patient endpoints, TallyVisualizer's credit-note
revenue inflation, J4E's stale Prisma client), so treat this as bug-finding
work, not paperwork.`;

const esc = (s) => String(s || '').replace(/"/g, '\\"');

function normalizeTeam(raw) {
    if (!raw) return [];
    let team = raw;
    if (typeof team === 'string') {
        try { team = JSON.parse(team); } catch { return []; }
    }
    if (!Array.isArray(team)) return [];
    return team.map((m) => ({
        id: m.id || null,
        agent_name: m.agent_name || m.name || '—',
        role: m.name || m.role || '',
        category: m.category || '',
        description: m.description || '',
        associated_tech_skills: m.associated_tech_skills || '',
        why: m.why || '',
        bench: m.bench || '',
    }));
}

function itemRow(i) {
    return {
        id: i.id,
        team_id: i.team_id,
        title: i.title,
        detail: i.detail || '',
        type: i.type || 'feature',
        status: i.status || 'backlog',
        priority: i.priority || 'P2',
        sprint: i.sprint || 'S1',
        created: i.created,
        updated: i.updated,
    };
}

// Full board: every team with its work items, latest CEO briefing and
// latest test run — one call renders the whole Sprint tab.
router.get('/admin/sprints', requireAdmin, async (req, res) => {
    try {
        await ensureSprintCollections();
        const [teams, items, reports, runs] = await Promise.all([
            pb.collection('sprint_teams').getFullList({ sort: 'name' }),
            pb.collection('sprint_work_items').getFullList({ sort: '-updated' }).catch(() => []),
            pb.collection('sprint_reports').getFullList({ sort: '-created' }).catch(() => []),
            pb.collection('sprint_test_runs').getFullList({ sort: '-created' }).catch(() => []),
        ]);

        const itemsByTeam = {};
        for (const i of items) (itemsByTeam[i.team_id] ||= []).push(itemRow(i));
        // Rows are sorted newest-first, so the first hit per team is latest.
        const latestReport = {};
        for (const r of reports) latestReport[r.team_id] ||= {
            id: r.id, sprint: r.sprint || 'S1', summary: r.summary, created: r.created,
        };
        const latestRun = {};
        for (const t of runs) latestRun[t.team_id] ||= {
            id: t.id, status: t.status || 'partial', total: t.total || 0,
            passed: t.passed || 0, failed: t.failed || 0,
            report_url: t.report_url || '', notes: t.notes || '', created: t.created,
        };

        res.json({
            items: teams.map((t) => ({
                id: t.id,
                name: t.name,
                slug: t.slug,
                project: t.project || '',
                mission: t.mission || '',
                status: t.status || 'active',
                team: normalizeTeam(t.team),
                work_items: itemsByTeam[t.id] || [],
                latest_report: latestReport[t.id] || null,
                latest_test_run: latestRun[t.id] || null,
                created: t.created,
                updated: t.updated,
            })),
        });
    } catch (err) {
        logger.error('admin sprints list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Sync the board with the seed roster. Teams are matched by slug.
//
// Additive only, never destructive: a team that already exists keeps its rows,
// and only work items whose title isn't on the board yet get added. That
// matters because the CEO re-prioritizes and re-statuses items directly in the
// admin — re-running this must never stomp that. It also means new findings
// (a confirmed bug written into the seed) reach a board that was seeded weeks
// earlier, which a create-only seed could never do.
//
// The agent roster and mission ARE refreshed on existing teams: those are
// authored in the seed file, not edited in the UI, so the seed is the source
// of truth for them.
router.post('/admin/sprints/seed', requireAdmin, async (req, res) => {
    try {
        await ensureSprintCollections();
        const existing = await pb.collection('sprint_teams').getFullList();
        const bySlug = Object.fromEntries(existing.map(t => [t.slug, t]));
        let createdTeams = 0, createdItems = 0, refreshedTeams = 0, updatedItems = 0;
        const added = [];

        for (const seed of SEED_TEAMS) {
            let team = bySlug[seed.slug];

            if (!team) {
                team = await pb.collection('sprint_teams').create({
                    name: seed.name,
                    slug: seed.slug,
                    project: seed.project || '',
                    mission: seed.mission || '',
                    status: 'active',
                    team: seed.team || [],
                });
                createdTeams++;
                if (seed.report) {
                    await pb.collection('sprint_reports').create({
                        team_id: team.id, sprint: 'S1', summary: seed.report,
                    });
                }
            } else if (
                team.mission !== (seed.mission || '')
                || team.project !== (seed.project || '')
                || JSON.stringify(team.team || []) !== JSON.stringify(seed.team || [])
            ) {
                await pb.collection('sprint_teams').update(team.id, {
                    name: seed.name,
                    project: seed.project || '',
                    mission: seed.mission || '',
                    team: seed.team || [],
                });
                refreshedTeams++;
            }

            // Split of ownership: the seed owns an item's description (it's
            // authored documentation — e.g. a bug write-up gaining a confirmed
            // reproduction), the CEO owns where it sits in the pipeline. So an
            // existing item gets its detail refreshed but keeps whatever
            // status and priority the board has it at.
            let onBoard = [];
            try {
                onBoard = await pb.collection('sprint_work_items').getFullList({
                    filter: `team_id = "${esc(team.id)}"`,
                    fields: 'id,title,detail',
                });
            } catch { /* none yet */ }
            const byTitle = Object.fromEntries(onBoard.map(i => [i.title, i]));

            for (const item of seed.items || []) {
                const current = byTitle[item.title];
                if (current) {
                    if ((current.detail || '') !== (item.detail || '')) {
                        await pb.collection('sprint_work_items').update(current.id, {
                            detail: item.detail || '',
                        });
                        updatedItems++;
                    }
                    continue;
                }
                await pb.collection('sprint_work_items').create({
                    team_id: team.id,
                    title: item.title,
                    detail: item.detail || '',
                    type: item.type || 'feature',
                    status: item.status || 'backlog',
                    priority: item.priority || 'P2',
                    sprint: item.sprint || 'S1',
                });
                createdItems++;
                added.push(`${seed.name}: ${item.title}`);
            }
        }

        logger.info(`admin: sprint sync — ${createdTeams} new team(s), ${refreshedTeams} refreshed, ${createdItems} new item(s), ${updatedItems} detail update(s)`);
        res.json({
            created_teams: createdTeams,
            refreshed_teams: refreshedTeams,
            created_items: createdItems,
            updated_items: updatedItems,
            added,
        });
    } catch (err) {
        logger.error('admin sprint seed failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/sprints/:teamId/items', requireAdmin, async (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 300);
    if (!title) return res.status(400).json({ error: 'title is required' });
    try {
        await ensureSprintCollections();
        const team = await pb.collection('sprint_teams').getOne(req.params.teamId).catch(() => null);
        if (!team) return res.status(404).json({ error: 'team not found' });
        const item = await pb.collection('sprint_work_items').create({
            team_id: team.id,
            title,
            detail: String(req.body?.detail || '').slice(0, 4000),
            type: req.body?.type || 'feature',
            status: req.body?.status || 'backlog',
            priority: req.body?.priority || 'P2',
            sprint: String(req.body?.sprint || 'S1').slice(0, 40),
        });
        res.json({ item: itemRow(item) });
    } catch (err) {
        logger.error('admin sprint item create failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.patch('/admin/sprints/items/:id', requireAdmin, async (req, res) => {
    try {
        const patch = {};
        for (const key of ['title', 'detail', 'type', 'status', 'priority', 'sprint']) {
            if (req.body?.[key] !== undefined) patch[key] = req.body[key];
        }
        if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing to update' });
        const item = await pb.collection('sprint_work_items').update(req.params.id, patch);
        res.json({ item: itemRow(item) });
    } catch (err) {
        logger.error('admin sprint item update failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/admin/sprints/items/:id', requireAdmin, async (req, res) => {
    try {
        await pb.collection('sprint_work_items').delete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        logger.error('admin sprint item delete failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/sprints/:teamId/reports', requireAdmin, async (req, res) => {
    const summary = String(req.body?.summary || '').trim().slice(0, 8000);
    if (!summary) return res.status(400).json({ error: 'summary is required' });
    try {
        await ensureSprintCollections();
        const report = await pb.collection('sprint_reports').create({
            team_id: req.params.teamId,
            sprint: String(req.body?.sprint || 'S1').slice(0, 40),
            summary,
        });
        res.json({ report: { id: report.id, sprint: report.sprint, summary: report.summary, created: report.created } });
    } catch (err) {
        logger.error('admin sprint report create failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Daily test-dashboard runs land here — called by each project's scheduled
// suite (with an admin token) or recorded manually from the UI.
router.post('/admin/sprints/:teamId/test-runs', requireAdmin, async (req, res) => {
    const passed = Math.max(0, Math.round(Number(req.body?.passed) || 0));
    const failed = Math.max(0, Math.round(Number(req.body?.failed) || 0));
    const total = Math.max(passed + failed, Math.round(Number(req.body?.total) || 0));
    const status = failed === 0 ? 'pass' : (passed === 0 ? 'fail' : 'partial');
    try {
        await ensureSprintCollections();
        const run = await pb.collection('sprint_test_runs').create({
            team_id: req.params.teamId,
            status,
            total,
            passed,
            failed,
            report_url: String(req.body?.report_url || '').slice(0, 500),
            notes: String(req.body?.notes || '').slice(0, 2000),
        });
        res.json({ run: { id: run.id, status: run.status, total: run.total, passed: run.passed, failed: run.failed, created: run.created } });
    } catch (err) {
        logger.error('admin sprint test-run create failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── CEO chat ─────────────────────────────────────────────────────────────────
// The CEO talks to one team (audience = team id) or runs a stand-up with all
// of them (audience = 'all'). Replies are generated with each team's full
// context — agents, work items, latest briefing and latest test run — so the
// teams answer about their real backlog, not generically.

function teamContext(team, items, report, run) {
    const agents = (team.teamNorm || []).map(m =>
        `  - ${m.agent_name} (${m.role}): ${m.why}`).join('\n');
    const workItems = items.map(i =>
        `  - [${i.priority}/${i.status}] ${i.title}${i.detail ? ` — ${i.detail}` : ''}`).join('\n');
    const testLine = run
        ? `${run.status.toUpperCase()} ${run.passed}/${run.total} (${run.created})${run.notes ? ` — ${run.notes}` : ''}`
        : 'no test runs recorded yet';
    return [
        `## Team: ${team.name}`,
        `Project: ${team.project || '—'}`,
        `Mission: ${team.mission || '—'}`,
        `Agents:\n${agents || '  (none)'}`,
        `Work items:\n${workItems || '  (none)'}`,
        `Latest test-dashboard run: ${testLine}`,
        report ? `Latest briefing to the CEO: ${report.summary}` : 'No briefing recorded yet.',
    ].join('\n');
}

async function loadTeamBundles(teamFilterId = null) {
    const [teams, items, reports, runs] = await Promise.all([
        pb.collection('sprint_teams').getFullList({ sort: 'name' }),
        pb.collection('sprint_work_items').getFullList({ sort: '-updated' }).catch(() => []),
        pb.collection('sprint_reports').getFullList({ sort: '-created' }).catch(() => []),
        pb.collection('sprint_test_runs').getFullList({ sort: '-created' }).catch(() => []),
    ]);
    const wanted = teamFilterId ? teams.filter(t => t.id === teamFilterId) : teams;
    return wanted.map(t => {
        const team = { ...t, teamNorm: normalizeTeam(t.team) };
        const teamItems = items.filter(i => i.team_id === t.id).map(itemRow);
        const report = reports.find(r => r.team_id === t.id) || null;
        const run = runs.find(r => r.team_id === t.id) || null;
        return { team, items: teamItems, report, run };
    });
}

function chatRow(m) {
    return {
        id: m.id,
        audience: m.audience,
        role: m.role,
        agent_name: m.agent_name || '',
        content: m.content,
        created: m.created,
    };
}

router.get('/admin/sprints/chat', requireAdmin, async (req, res) => {
    const audience = String(req.query.audience || 'all').slice(0, 40);
    try {
        await ensureSprintCollections();
        const rows = await pb.collection('sprint_chat_messages').getFullList({
            filter: `audience = "${esc(audience)}"`,
            sort: 'created',
        }).catch(() => []);
        res.json({ items: rows.slice(-60).map(chatRow) });
    } catch (err) {
        logger.error('admin sprint chat list failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/sprints/chat', requireAdmin, async (req, res) => {
    const audience = String(req.body?.audience || 'all').slice(0, 40);
    const message = String(req.body?.message || '').trim().slice(0, 4000);
    if (!message) return res.status(400).json({ error: 'message is required' });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OpenAI not configured on the server' });

    try {
        await ensureSprintCollections();
        const bundles = await loadTeamBundles(audience === 'all' ? null : audience);
        if (bundles.length === 0) return res.status(404).json({ error: 'team not found' });

        const userMsg = await pb.collection('sprint_chat_messages').create({
            audience, role: 'user', agent_name: 'CEO', content: message,
        });

        // Last few turns of this thread for continuity (excluding the message
        // just saved — it goes in as the live question).
        const history = await pb.collection('sprint_chat_messages').getFullList({
            filter: `audience = "${esc(audience)}"`,
            sort: '-created',
        }).catch(() => []);
        const transcript = history
            .filter(m => m.id !== userMsg.id)
            .slice(0, 10)
            .reverse()
            .map(m => `${m.role === 'user' ? 'CEO' : (m.agent_name || 'Team')}: ${m.content}`)
            .join('\n');

        const single = audience !== 'all';
        const systemPrompt = [
            single
                ? `You are the "${bundles[0].team.name}" dev-agent team on the KaushalStack sprint board, in a chat with your CEO.`
                : `You are the ${bundles.length} dev-agent teams on the KaushalStack sprint board, gathered for a stand-up with your CEO.`,
            `Answer the CEO's question concretely using ONLY the team context below — real work items, priorities, test status, briefings. Never invent features or status that are not in the context; if you don't know, say what you'd need to find out.`,
            single
                ? `Have the right agent(s) answer, each turn prefixed like "**${bundles[0].team.teamNorm[0]?.agent_name || 'Lead'} (${bundles[0].team.teamNorm[0]?.role || 'Tech Lead'}):**". Use only agents listed in the context. Keep it under ~250 words total.`
                : `Answer as a moderated stand-up: only the teams relevant to the question speak, each as one short paragraph prefixed like "**<Lead name> — <Team>:**" using that team's lead agent. If the question applies to everyone, keep each team to 1-2 sentences.`,
            `Be direct with trade-offs and honest about risks — the CEO wants signal, not cheerleading.`,
            '',
            HOUSE_FACTS,
            '',
            '# Team context',
            ...bundles.map(b => teamContext(b.team, b.items, b.report, b.run)),
        ].join('\n\n');

        const userPrompt = transcript
            ? `Recent conversation:\n${transcript}\n\nCEO: ${message}`
            : `CEO: ${message}`;

        const reply = await chatComplete(CHAT_PROVIDER, {
            key: process.env.OPENAI_API_KEY,
            model: CHAT_MODEL,
            systemPrompt,
            userPrompt,
            meter: { user_id: req.adminUserId || '', agent: 'sprint-chat', context: 'sprint-chat' },
        });

        const assistantMsg = await pb.collection('sprint_chat_messages').create({
            audience,
            role: 'assistant',
            agent_name: single ? bundles[0].team.name : 'All teams',
            content: String(reply || '').slice(0, 12000),
        });

        res.json({ items: [chatRow(userMsg), chatRow(assistantMsg)] });
    } catch (err) {
        logger.error('admin sprint chat failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/admin/sprints/chat', requireAdmin, async (req, res) => {
    const audience = String(req.query.audience || '').slice(0, 40);
    if (!audience) return res.status(400).json({ error: 'audience is required' });
    try {
        const rows = await pb.collection('sprint_chat_messages').getFullList({
            filter: `audience = "${esc(audience)}"`,
            fields: 'id',
        }).catch(() => []);
        for (const r of rows) await pb.collection('sprint_chat_messages').delete(r.id).catch(() => {});
        res.json({ ok: true, deleted: rows.length });
    } catch (err) {
        logger.error('admin sprint chat clear failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Test dashboard ───────────────────────────────────────────────────────────
// The portfolio test framework (~/Projects/KaushalStackTestFramework) posts one
// results.json here per daily run; the server fans it out into a test-run row
// per team so the Sprint badges and the Tests dashboard stay in sync from a
// single call.

// Suite directory name → sprint team slug. Explicit so renaming a suite fails
// loudly here instead of silently dropping a project off the dashboard.
const SUITE_TO_TEAM = {
    tallyvisualizer: 'tallyvisualizer',
    j4e: 'j4e',
    mrnmr: 'mrnmr',
    lakshyan: 'lakshyan',
    consciousconnections: 'consciousconnections',
    vajrahasta: 'vajrahasta',
    enrollengineer: 'enrollengineer',
    refunction: 'refunction',
    royalinteriors: 'royalinteriors',
    kaushalstack: 'kaushalstack-platform',
};

router.post('/admin/sprints/test-report', requireAdmin, async (req, res) => {
    const rows = Array.isArray(req.body?.tests) ? req.body.tests : null;
    if (!rows) return res.status(400).json({ error: 'tests[] is required' });

    try {
        await ensureSprintCollections();
        const teams = await pb.collection('sprint_teams').getFullList({ fields: 'id,slug' });
        const idBySlug = Object.fromEntries(teams.map(t => [t.slug, t.id]));

        const bySuite = {};
        for (const t of rows) {
            const suite = String(t.suite || 'unknown');
            (bySuite[suite] ||= []).push({
                name: String(t.name || 'unnamed').slice(0, 300),
                status: t.status === 'pass' ? 'pass' : 'fail',
                error: t.error ? String(t.error).slice(0, 1000) : null,
                duration_ms: Number(t.duration_ms) || 0,
                runner: String(t.runner || '').slice(0, 60),
            });
        }

        const recorded = [];
        const skipped = [];
        for (const [suite, tests] of Object.entries(bySuite)) {
            const teamId = idBySlug[SUITE_TO_TEAM[suite]];
            if (!teamId) { skipped.push(suite); continue; }

            const passed = tests.filter(t => t.status === 'pass').length;
            const failed = tests.length - passed;
            const failing = tests.filter(t => t.status === 'fail').map(t => t.name);

            await pb.collection('sprint_test_runs').create({
                team_id: teamId,
                status: failed === 0 ? 'pass' : (passed === 0 ? 'fail' : 'partial'),
                total: tests.length,
                passed,
                failed,
                tests,
                runner: tests[0]?.runner || '',
                duration_ms: Math.round(tests.reduce((s, t) => s + t.duration_ms, 0)),
                notes: failed === 0
                    ? 'Daily portfolio run — all green.'
                    : `Failing: ${failing.slice(0, 5).join(', ')}`,
            });
            recorded.push({ suite, passed, failed });
        }

        logger.info(`admin: test report ingested — ${recorded.length} suite(s), ${rows.length} tests`);
        res.json({ recorded, skipped });
    } catch (err) {
        logger.error('admin sprint test-report failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Everything the Tests dashboard renders: latest run per team with its
// individual tests, plus a short history for the trend strip.
router.get('/admin/sprints/test-dashboard', requireAdmin, async (req, res) => {
    try {
        await ensureSprintCollections();
        const [teams, runs] = await Promise.all([
            pb.collection('sprint_teams').getFullList({ sort: 'name' }),
            pb.collection('sprint_test_runs').getFullList({ sort: '-created' }).catch(() => []),
        ]);

        const runsByTeam = {};
        for (const r of runs) (runsByTeam[r.team_id] ||= []).push(r);

        const items = teams.map((t) => {
            const history = runsByTeam[t.id] || [];
            const latest = history[0] || null;
            return {
                team_id: t.id,
                name: t.name,
                slug: t.slug,
                project: t.project || '',
                latest: latest ? {
                    id: latest.id,
                    status: latest.status || 'partial',
                    total: latest.total || 0,
                    passed: latest.passed || 0,
                    failed: latest.failed || 0,
                    runner: latest.runner || '',
                    duration_ms: latest.duration_ms || 0,
                    notes: latest.notes || '',
                    created: latest.created,
                    tests: Array.isArray(latest.tests) ? latest.tests : [],
                } : null,
                history: history.slice(0, 14).map(r => ({
                    status: r.status || 'partial',
                    passed: r.passed || 0,
                    failed: r.failed || 0,
                    created: r.created,
                })).reverse(),
            };
        });

        const covered = items.filter(i => i.latest);
        res.json({
            generated_at: new Date().toISOString(),
            totals: {
                teams: items.length,
                reporting: covered.length,
                green: covered.filter(i => i.latest.status === 'pass').length,
                red: covered.filter(i => i.latest.status !== 'pass').length,
                tests: covered.reduce((s, i) => s + i.latest.total, 0),
                passed: covered.reduce((s, i) => s + i.latest.passed, 0),
                failed: covered.reduce((s, i) => s + i.latest.failed, 0),
            },
            items,
        });
    } catch (err) {
        logger.error('admin sprint test-dashboard failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Remove a team and its child rows (items, reports, test runs).
router.delete('/admin/sprints/:teamId', requireAdmin, async (req, res) => {
    const id = req.params.teamId;
    try {
        const team = await pb.collection('sprint_teams').getOne(id).catch(() => null);
        if (!team) return res.status(404).json({ error: 'team not found' });
        for (const col of ['sprint_work_items', 'sprint_reports', 'sprint_test_runs']) {
            try {
                const rows = await pb.collection(col).getFullList({
                    filter: `team_id = "${esc(id)}"`,
                    fields: 'id',
                });
                for (const r of rows) await pb.collection(col).delete(r.id).catch(() => {});
            } catch { /* collection may not exist yet */ }
        }
        try {
            const chats = await pb.collection('sprint_chat_messages').getFullList({
                filter: `audience = "${esc(id)}"`,
                fields: 'id',
            });
            for (const r of chats) await pb.collection('sprint_chat_messages').delete(r.id).catch(() => {});
        } catch { /* collection may not exist yet */ }
        await pb.collection('sprint_teams').delete(id);
        logger.info(`admin: sprint team ${team.name} (${id}) removed by ${req.adminUserId}`);
        res.json({ ok: true });
    } catch (err) {
        logger.error('admin sprint team delete failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
