import { Router } from 'express';
import logger from '../../utils/logger.js';
import pb from '../../utils/pocketbaseClient.js';
import { ensureSprintCollections } from '../../sprint/collections.js';
import { SEED_TEAMS } from '../../sprint/seed-teams.js';
import { requireAdmin } from './auth.js';

const router = Router();

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

// Idempotent seed: teams are matched by slug; existing ones are skipped
// entirely (their items/reports may have diverged from the seed on purpose).
router.post('/admin/sprints/seed', requireAdmin, async (req, res) => {
    try {
        await ensureSprintCollections();
        const existing = await pb.collection('sprint_teams').getFullList({ fields: 'id,slug' });
        const have = new Set(existing.map(t => t.slug));
        let createdTeams = 0, createdItems = 0;

        for (const seed of SEED_TEAMS) {
            if (have.has(seed.slug)) continue;
            const team = await pb.collection('sprint_teams').create({
                name: seed.name,
                slug: seed.slug,
                project: seed.project || '',
                mission: seed.mission || '',
                status: 'active',
                team: seed.team || [],
            });
            createdTeams++;
            for (const item of seed.items || []) {
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
            }
            if (seed.report) {
                await pb.collection('sprint_reports').create({
                    team_id: team.id,
                    sprint: 'S1',
                    summary: seed.report,
                });
            }
        }

        logger.info(`admin: sprint seed created ${createdTeams} teams / ${createdItems} items`);
        res.json({ created_teams: createdTeams, created_items: createdItems, skipped: SEED_TEAMS.length - createdTeams });
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
        await pb.collection('sprint_teams').delete(id);
        logger.info(`admin: sprint team ${team.name} (${id}) removed by ${req.adminUserId}`);
        res.json({ ok: true });
    } catch (err) {
        logger.error('admin sprint team delete failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
