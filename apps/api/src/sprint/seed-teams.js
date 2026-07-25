// Seed roster for the Sprint board: one dev-agent team per customer project,
// derived from an audit of each repo (state, integrations, gaps) on
// 2026-07-25. Every team's sprint 1 carries the same mandated P0: a test
// dashboard exercising the product's positive AND negative flows daily, with
// every critical external integration mocked.
//
// Seeding is idempotent by slug: existing teams are left untouched, so this
// file can grow new teams/items without duplicating old ones.

export const SEED_TEAMS = [
    {
        slug: 'tallyvisualizer',
        name: 'TallyVisualizer',
        project: '~/Projects/TallyVisualizer — tally.srv1562298.hstgr.cloud',
        mission: 'Profile SME Tally books, generate company-specific agent teams, and (next) migrate records into OpenProcure.',
        team: [
            { id: 'tv-arjun', agent_name: 'Arjun', name: 'Tech Lead', category: 'engineering', associated_tech_skills: 'Python, FastAPI, sprint planning, roadmap sequencing', why: 'Owns the Tally→analytics pipeline and reports sprint status to the CEO.', description: 'Runs sprint planning for TallyVisualizer, sequences the parked OpenProcure phase 4, and briefs the CEO on progress and risks.' },
            { id: 'tv-meera', agent_name: 'Meera', name: 'Data Pipeline Engineer', category: 'engineering', associated_tech_skills: 'Tally XML parsing, data profiling, GSTIN validation, canonical mapping', why: 'The product is the pipeline — she owns profile quality and the OpenProcure mapping.', description: 'Owns tally_profile.py and the future OpenProcure sync: canonical field mapping, GSTIN validation, dry-run reconciliation.' },
            { id: 'tv-kabir', agent_name: 'Kabir', name: 'QA & Test Dashboard Engineer', category: 'engineering', associated_tech_skills: 'pytest, FastAPI TestClient, fixture design, negative-path testing', why: 'Mandated daily test dashboard: upload→profile→dashboard must be provably green every morning.', description: 'Builds and maintains the daily test dashboard: happy paths (upload, profile, analytics, login) and negative paths (corrupt archive, empty Tally XML, bad login, oversized upload).' },
            { id: 'tv-devika', agent_name: 'Devika', name: 'Integration & Mocks Specialist', category: 'engineering', associated_tech_skills: 'API mocking, contract tests, OpenProcure API, kaushalstack registry', why: 'OpenProcure and the agent registry are external — tests must never depend on them being up.', description: 'Maintains mock servers/contract fixtures for the OpenProcure API and the kaushalstack agent registry so the daily suite runs fully offline.' },
        ],
        items: [
            { title: 'Credit notes inflate revenue instead of reducing it', type: 'bug', priority: 'P0', status: 'planned', detail: 'CONFIRMED by the test team (reproduced: sale 100000 + credit note 30000 reports revenue 130000, expected 70000). analytics.py lines 108-116 double-negate: sign=-1 is applied to a leg Tally already emits negative, so the credit note is added, and the dedicated reversal branch below is dead code. Headline revenue, customer shares, avg invoice and monthly series are all overstated by twice the credit-note value for any SME issuing rate-difference or return credit notes. Check the GST legs in the same change, then add a test asserting revenue nets DOWN.' },
            { title: 'Test dashboard: positive & negative flows, daily', type: 'test', priority: 'P0', status: 'in_progress', detail: 'Happy path SHIPPED in KaushalStackTestFramework/suites/tallyvisualizer (Tally XML → parse → analytics KPIs, concentration, monthly GST series, collections). Still to add: negative flows — corrupt/oversized archive, empty or malformed Tally XML, failed login, missing upload fallback. Mock OpenProcure API and kaushalstack registry.' },
            { title: 'OpenProcure sync (phase 4)', type: 'feature', priority: 'P1', status: 'backlog', detail: 'Canonical mapping Tally→OpenProcure, GSTIN validation, dry-run + reconciliation report before any write.' },
            { title: 'Multi-tenant session handling', type: 'feature', priority: 'P2', status: 'backlog', detail: 'Dashboard currently leans on a "latest upload" fallback — make uploads session/tenant scoped.' },
            { title: 'Compiled Tailwind for prod (drop CDN)', type: 'infra', priority: 'P2', status: 'backlog', detail: 'Replace Tailwind CDN with a compiled build for production.' },
            { title: 'Automate private-team push to kaushalstack registry', type: 'feature', priority: 'P2', status: 'backlog', detail: 'generate_private_team.py output should push to the private registry without manual steps.' },
        ],
        report: 'Phases 1–3 are live (profiler, upload flow, analytics dashboard behind login) with one real customer team generated. Sprint 1 focus: stand up the daily test dashboard with OpenProcure and the registry fully mocked, then un-park phase 4 (OpenProcure sync) starting with a dry-run reconciliation mode. Biggest risk we want to brainstorm: PII handling (GSTINs, bank accounts) as we go multi-tenant.',
    },
    {
        slug: 'j4e',
        name: 'J4E Community',
        project: '~/Projects/j4e — Just for Entrepreneurs, Pune',
        mission: 'Community platform: bucketed member directory, connections & chat, project broadcasts with bids, instrumented admin funnel.',
        team: [
            { id: 'j4e-rohan', agent_name: 'Rohan', name: 'Tech Lead', category: 'engineering', associated_tech_skills: 'Next.js App Router, Prisma, TypeScript, sprint planning', why: 'Owns the platform roadmap and CEO reporting for J4E.', description: 'Runs sprint planning for the J4E platform and sequences the Projects-feature unhide, notifications, and the scale path.' },
            { id: 'j4e-sana', agent_name: 'Sana', name: 'Full-stack Engineer', category: 'engineering', associated_tech_skills: 'Next.js, Prisma, JWT auth, Tailwind, websockets', why: 'Ships member-facing features: connections, chat, bids, gallery.', description: 'Owns member portal features end-to-end, including finishing the SHOW_PROJECTS-gated marketplace and the chat upgrade path from 3s polling to websockets.' },
            { id: 'j4e-vikram', agent_name: 'Vikram', name: 'QA & Test Dashboard Engineer', category: 'engineering', associated_tech_skills: 'Playwright, Prisma test fixtures, negative-path testing', why: 'J4E is the most self-contained product — its daily suite should be the reference implementation.', description: 'Builds the daily test dashboard: register→approve→connect→chat→bid happy paths and negative flows (bad login, duplicate bid, unauthorized admin access, unapproved member actions). Almost no mocking needed — local SQLite.' },
        ],
        items: [
            { title: 'Test dashboard: positive & negative flows, daily', type: 'test', priority: 'P0', status: 'planned', detail: 'Happy: register→admin approval→connection→chat→project broadcast→bid→award. Negative: bad login, duplicate bid, unauthorized admin route access, unapproved-member actions, SHOW_PROJECTS flag off. Self-contained (SQLite) — reference implementation for the other teams.' },
            { title: 'Finish and unhide Projects marketplace', type: 'feature', priority: 'P1', status: 'backlog', detail: 'SHOW_PROJECTS currently hides Projects from public nav — finish the flow and launch it.' },
            { title: 'Notification channel (email/WhatsApp)', type: 'feature', priority: 'P1', status: 'backlog', detail: 'Connection requests and approvals are in-app only; members miss them. Add email or WhatsApp notification.' },
            { title: 'Stale Prisma client ignores DATABASE_URL', type: 'bug', priority: 'P1', status: 'planned', detail: 'CONFIRMED by the test team. node_modules/.prisma/client was generated when schema.prisma hardcoded the sqlite path — its inlineDatasources carry fromEnvVar:null, value "file:./dev.db". The committed schema now says env("DATABASE_URL"), so locally any new PrismaClient() opens prisma/dev.db regardless of DATABASE_URL (a test aimed at a throwaway db found 35 real members). Docker masks it because the image runs prisma generate at build. Fix: run prisma generate, add a postinstall script, and consider passing datasourceUrl explicitly in src/lib/db.ts so a stale client fails loudly.' },
            { title: 'Scale path: Postgres + websockets', type: 'infra', priority: 'P2', status: 'backlog', detail: 'SQLite + 3s chat polling won’t scale past the current 34 members; plan the migration.' },
        ],
        report: 'Platform is substantially built: public site, member portal (connections, chat, bids), admin funnel, gallery and About just shipped. Sprint 1: daily test dashboard (we are the most self-contained product, so ours becomes the template), then finish the gated Projects marketplace. Brainstorm ask: notification strategy — email vs WhatsApp for a 34-member Pune community.',
    },
    {
        slug: 'mrnmr',
        name: 'MRNMR Studio',
        project: '~/Projects/mrnmr — misternmister.in',
        mission: 'Social campaign studio: OAuth publishing and scheduled posting to Facebook, Instagram and LinkedIn, powered by kaushalstack agents.',
        team: [
            { id: 'mr-zain', agent_name: 'Zain', name: 'Tech Lead', category: 'engineering', associated_tech_skills: 'Express 5, node:sqlite, sprint planning, OAuth architecture', why: 'The studio grew far past its landing-page origins — someone must own the platform it became.', description: 'Runs sprint planning for the MRNMR studio, owns the campaign→publish pipeline architecture and CEO reporting.' },
            { id: 'mr-alisha', agent_name: 'Alisha', name: 'Social Integrations Engineer', category: 'engineering', associated_tech_skills: 'Facebook Graph API, Instagram publishing, LinkedIn API, OAuth token lifecycle', why: 'Three OAuth providers with expiring tokens and versioned APIs is a full-time surface.', description: 'Owns FB/IG/LinkedIn integrations: token refresh, LINKEDIN_VERSION expiry guard, scheduled-post firing, co-author invites.' },
            { id: 'mr-farhan', agent_name: 'Farhan', name: 'QA & Mocks Engineer', category: 'engineering', associated_tech_skills: 'API mocking, nock/msw-style interception, scheduled-job testing', why: 'Every critical flow here crosses an external API — the daily suite lives or dies on mock quality.', description: 'Builds the daily test dashboard with all three social APIs and the kaushalstack partner API mocked: OAuth handshakes, scheduled publish firing, token-budget enforcement, and failure paths (expired token, aged API version, revoked grant).' },
        ],
        items: [
            { title: 'Test dashboard: positive & negative flows, daily', type: 'test', priority: 'P0', status: 'planned', detail: 'Happy: OAuth connect, campaign generation, scheduled post fires to FB/IG/LinkedIn, token metering. Negative: expired LinkedIn API version, revoked/expired OAuth token, budget cap hit, scheduler misfire. Mock Facebook Graph, Instagram, LinkedIn and kaushalstack partner APIs — no live calls.' },
            { title: 'LINKEDIN_VERSION expiry guard', type: 'bug', priority: 'P1', status: 'backlog', detail: 'The pinned LinkedIn API version aged out once already (commit da7f179). Add a startup/daily check that alerts before expiry.' },
            { title: 'Token/budget enforcement hardening', type: 'security', priority: 'P1', status: 'backlog', detail: 'Consistent budget enforcement across all three social APIs and the kaushalstack metering path.' },
            { title: 'README refresh', type: 'infra', priority: 'P3', status: 'backlog', detail: 'README still describes a static landing page; document the publishing platform it actually is.' },
        ],
        report: 'The studio now does real OAuth publishing and calendar-queued posting to three platforms. Sprint 1: daily test dashboard with every social API mocked — this team has the heaviest mocking burden, and the LinkedIn version expiry has already bitten us once, so the negative-path suite pays for itself immediately. Brainstorm ask: whether the studio should be productized for other kaushalstack partners.',
    },
    {
        slug: 'lakshyan',
        name: 'Lakshyan OpenProcure',
        project: '~/Projects/lakshyan-openprocure-demo',
        mission: 'End-to-end OpenProcure procurement lifecycle demo (RFQ→bids→award→PO→invoice→payment→QC) with a live signup portal for Lakshyan Academy of Sports.',
        team: [
            { id: 'lk-dhruv', agent_name: 'Dhruv', name: 'Tech Lead', category: 'engineering', associated_tech_skills: 'Node, zero-dependency tooling, procurement domain, sprint planning', why: 'The demo is becoming a portal — it needs an owner sequencing that evolution.', description: 'Runs sprint planning for the Lakshyan demo/portal and reports to the CEO; owns the path from one-shot script to resettable sandbox.' },
            { id: 'lk-ishita', agent_name: 'Ishita', name: 'Procurement Flow Engineer', category: 'engineering', associated_tech_skills: 'OpenProcure API, JWT auth, order state machines, seat management', why: 'The whole product is one long state machine against a drifting external API.', description: 'Owns the RFQ→payment lifecycle code, the signup portal seat management, and tracking OpenProcure spec drift.' },
            { id: 'lk-manav', agent_name: 'Manav', name: 'QA & Mocks Engineer', category: 'engineering', associated_tech_skills: 'Contract testing, API mocking, state-machine test design', why: 'The demo verified against production OpenProcure — daily tests must not.', description: 'Builds a mock OpenProcure server encoding the real API contract (including known drift) so the daily dashboard exercises the full lifecycle offline, plus negative paths: invalid state transitions, expired JWT, registration field drift.' },
        ],
        items: [
            { title: 'Test dashboard: positive & negative flows, daily', type: 'test', priority: 'P0', status: 'planned', detail: 'Full lifecycle RFQ→bids→award→PO→invoice→payment→QC→close against a mocked OpenProcure API. Negative: invalid order-state transition, expired JWT, spec-drift fields (company_name vs organization_name), duplicate seat signup. Never hit production OpenProcure from the daily run.' },
            { title: 'Harden against OpenProcure spec drift', type: 'bug', priority: 'P1', status: 'backlog', detail: 'Encode the documented drift (registration fields, stricter order state machine) behind one adapter so future drift is a one-file fix.' },
            { title: 'Seat/viewer lifecycle for the signup portal', type: 'feature', priority: 'P1', status: 'backlog', detail: 'Abuse cleanup and automatic reclaim — free-seats.mjs is currently a manual tool.' },
            { title: 'Resettable multi-org sandbox', type: 'feature', priority: 'P2', status: 'backlog', detail: 'Turn the one-shot demo into a repeatable sandbox that can be reset per prospect.' },
        ],
        report: 'The full procurement lifecycle runs verified against production (last full run completed and paid on 23 Jul). Sprint 1: build the mock OpenProcure server and move the daily dashboard onto it — testing against production is our biggest current risk. Then seat lifecycle for the public portal. Brainstorm ask: turning this into a reusable demo harness for other OpenProcure prospects.',
    },
    {
        slug: 'consciousconnections',
        name: 'ConsciousConnections',
        project: '~/Projects/ConsciousConnections — Coach Rachana',
        mission: 'Client portal: campaign round-table studio, Card Studio, and the Connection Health Index assessment tool.',
        team: [
            { id: 'cc-rachit', agent_name: 'Rachit', name: 'Tech Lead', category: 'engineering', associated_tech_skills: 'Express 5, SQLite, modular refactoring, sprint planning', why: 'A 186KB server.js needs an owner with a decomposition plan.', description: 'Runs sprint planning, owns the monolith split (portal / studio / assessment), and reports to the CEO.' },
            { id: 'cc-naina', agent_name: 'Naina', name: 'Assessment Engineer', category: 'product', associated_tech_skills: 'Assessment UX, state persistence, resumable flows, per-org accounts', why: 'The assessment is the feature under active build and the client’s differentiator.', description: 'Owns the Connection Health Index assessment: persistence across refresh/nav, resumable team generation, per-org visitor accounts.' },
            { id: 'cc-omar', agent_name: 'Omar', name: 'QA & Mocks Engineer', category: 'engineering', associated_tech_skills: 'API mocking, SMTP test harness, budget-cap testing', why: 'Round-table, email and metering all cross external services that must be mocked daily.', description: 'Builds the daily test dashboard with the kaushalstack partner API and SMTP mocked: assessment persistence, round-table→spec pipeline, PDF generation, budget-cap and missing-credential failure paths.' },
        ],
        items: [
            { title: 'Test dashboard: positive & negative flows, daily', type: 'test', priority: 'P0', status: 'planned', detail: 'Happy: assessment complete→persist→resume, round-table→spec→creative pipeline, PDF export, email send. Negative: missing KS credentials ("portal not configured"), budget cap breached, SMTP failure, assessment state loss on refresh. Mock kaushalstack partner API and SMTP.' },
            { title: 'Split the 186KB server.js monolith', type: 'infra', priority: 'P1', status: 'backlog', detail: 'Separate portal, studio and assessment modules; the assessment churn keeps colliding with everything else.' },
            { title: 'Consolidate assessment persistence', type: 'bug', priority: 'P1', status: 'backlog', detail: 'Many recent point-fixes for persistence/resume — consolidate into one tested state model.' },
            { title: 'Multi-visitor auth model', type: 'feature', priority: 'P2', status: 'backlog', detail: 'Move beyond single basic-auth admin to per-org visitor accounts.' },
        ],
        report: 'Assessment feature is mid-build with heavy recent churn on persistence — the daily dashboard will lock in what works before we refactor. Sprint 1: test dashboard (KS API + SMTP mocked), then the monolith split so assessment work stops risking the studio. Brainstorm ask: packaging the assessment as a standalone sellable tool for other coaches.',
    },
    {
        slug: 'vajrahasta',
        name: 'Vajrahasta',
        project: '~/Projects/vajrahasta — Yamaha dealer portal on KaushalStack Studio',
        mission: 'Partner portal + campaign workspace for a Yamaha two-wheeler business; Monsoon Care campaign shipped.',
        team: [
            { id: 'vj-yuvraj', agent_name: 'Yuvraj', name: 'Tech Lead', category: 'engineering', associated_tech_skills: 'Studio portal platform, Docker/Traefik, campaign ops, sprint planning', why: 'The repo is a deployment snapshot — someone must own its relationship to the canonical platform source.', description: 'Runs sprint planning, decides snapshot-vs-canonical source strategy, owns redeploy runbook and CEO reporting.' },
            { id: 'vj-kiran', agent_name: 'Kiran', name: 'QA & Portal Engineer', category: 'engineering', associated_tech_skills: 'Smoke testing, PocketBase mocking, uptime checks, campaign asset validation', why: 'A live customer portal with no tests is one silent failure from an embarrassing call.', description: 'Builds the daily test dashboard: portal login, campaign asset serving, environment health. Negative: partner record missing, environment down, stale container. Mocks PocketBase/KS platform APIs.' },
        ],
        items: [
            { title: 'Test dashboard: positive & negative flows, daily', type: 'test', priority: 'P0', status: 'planned', detail: 'Happy: portal login, campaign pages and assets serve, environment reports running. Negative: missing partner record, environment down, auth failure. Mock PocketBase and KS platform APIs; include a live uptime ping against the real portal as a separate non-blocking check.' },
            { title: 'Snapshot vs canonical source decision', type: 'infra', priority: 'P1', status: 'backlog', detail: 'Repo is a byte-for-byte container snapshot; decide whether it tracks kaushalstack canonical source or stays a frozen artifact archive.' },
            { title: 'Redeploy runbook without admin UI', type: 'infra', priority: 'P2', status: 'backlog', detail: 'Document/script redeploy so the portal can be restored without clicking through the kaushalstack admin.' },
            { title: 'Wire publishing/scheduling for campaigns', type: 'feature', priority: 'P2', status: 'backlog', detail: 'Campaign is a one-shot artifact; borrow MRNMR’s publish/schedule pipeline.' },
        ],
        report: 'Portal is live and provisioned with the Monsoon Care campaign shipped. Sprint 1: daily health/test dashboard (this is a live customer with zero tests today), then resolve the snapshot-vs-canonical question. Brainstorm ask: reusing MRNMR’s publishing pipeline here instead of building one.',
    },
    {
        slug: 'enrollengineer',
        name: 'Enroll Engineer',
        project: '~/Projects/enrollengineer — enrollengineer.com',
        mission: 'RAG knowledge base for the Marathi engineering-admissions podcast: transcribe→translate→index→cited Q&A chat.',
        team: [
            { id: 'ee-aditya', agent_name: 'Aditya', name: 'Tech Lead', category: 'engineering', associated_tech_skills: 'Express, RAG architecture, ingestion pipelines, sprint planning', why: 'The pipeline outgrew its README — it needs an owner to take it from script-driven to product.', description: 'Runs sprint planning, owns the upload→transcribe→index automation path and CEO reporting.' },
            { id: 'ee-bhakti', agent_name: 'Bhakti', name: 'RAG Engineer', category: 'engineering', associated_tech_skills: 'OpenAI embeddings, Sarvam STT/translation, chunking, citation quality', why: 'Answer quality with correct timestamps is the product.', description: 'Owns the index (flat JSON→vector store migration), chunking, citation accuracy, and the Sarvam-vs-OpenAI provider split.' },
            { id: 'ee-chinmay', agent_name: 'Chinmay', name: 'QA & Mocks Engineer', category: 'engineering', associated_tech_skills: 'API mocking, golden-answer test sets, audio fixture design', why: 'Sarvam and OpenAI are both external and metered — daily tests must run offline and free.', description: 'Builds the daily test dashboard with Sarvam and OpenAI mocked: ingest→index→cited answer happy path, FAQ generation, and negative paths (STT failure, >2h audio, empty index, missing API key).' },
        ],
        items: [
            { title: 'Test dashboard: positive & negative flows, daily', type: 'test', priority: 'P0', status: 'planned', detail: 'Happy: ingest fixture audio→transcribe→translate→index→ask→cited answer with timestamps; FAQ tabs. Negative: Sarvam STT failure, audio >2h limit, empty index query, missing/invalid API keys. Mock Sarvam and OpenAI entirely; keep a tiny golden-answer set for citation accuracy.' },
            { title: 'Automate upload→ffmpeg→transcribe front end', type: 'feature', priority: 'P1', status: 'backlog', detail: 'Pipeline is script-driven; wire the web upload through to transcription automatically.' },
            { title: 'Verify >2h audio splitting', type: 'bug', priority: 'P2', status: 'backlog', detail: 'Sarvam duration limits are mentioned in docs — verify splitting is actually implemented.' },
            { title: 'Vector store migration plan', type: 'infra', priority: 'P2', status: 'backlog', detail: 'Flat index.json won’t scale with episode count; plan the move to a real vector store.' },
        ],
        report: 'A working RAG Q&A site exists with one full episode indexed — further along than documented. Sprint 1: daily test dashboard with Sarvam/OpenAI mocked and a golden-answer citation check, then automate the upload→transcribe path so new episodes don’t need an engineer. Brainstorm ask: per-episode cost model (Sarvam + embeddings) before we scale the catalogue.',
    },
    {
        slug: 'refunction',
        name: 'ReFunction Rehab',
        project: '~/Projects/REFUNCTION_REHAB + refuncrehabmessagingchannel',
        mission: 'Physiotherapy clinic platform: public site, patient enrollment/payments, admin dashboard, plus the WhatsApp flyer bot.',
        team: [
            { id: 'rf-neel', agent_name: 'Neel', name: 'Tech Lead', category: 'engineering', associated_tech_skills: 'React/Vite, Express, Prisma, Postgres, sprint planning', why: 'Two repos, one clinic — someone must own unifying them and reporting to the CEO.', description: 'Runs sprint planning across both ReFunction repos, sequences the bot→Postgres unification, and briefs the CEO.' },
            { id: 'rf-diya', agent_name: 'Diya', name: 'Patient Systems Engineer', category: 'engineering', associated_tech_skills: 'Prisma, Postgres, Razorpay, auth hardening, PII protection', why: 'Patient PII and payments are the highest-stakes surface in the whole portfolio.', description: 'Owns enrollment, payments and the admin dashboard; first job is locking down the unauthenticated public /api/patients endpoints.' },
            { id: 'rf-sameer', agent_name: 'Sameer', name: 'WhatsApp Bot Engineer', category: 'engineering', associated_tech_skills: 'Twilio WhatsApp, Anthropic API, sharp image compositing, state persistence', why: 'The flyer bot is a real doctor-facing channel running on sandbox infrastructure.', description: 'Owns the WhatsApp bot: production sender migration off Twilio sandbox, persistent conversation state, non-empty whitelist enforcement.' },
            { id: 'rf-lata', agent_name: 'Lata', name: 'QA & Mocks Engineer', category: 'engineering', associated_tech_skills: 'Playwright, API mocking, Postgres test fixtures, security testing', why: 'Five external integrations and live patient data demand the strictest daily suite.', description: 'Builds the daily test dashboard with Razorpay, SMTP, Cloudinary, Twilio and Anthropic all mocked: enrollment→payment→admin flows, flyer-bot conversation, and negative paths including unauthenticated PII access attempts.' },
        ],
        items: [
            { title: 'Secure public /api/patients endpoints', type: 'security', priority: 'P0', status: 'planned', detail: 'CONFIRMED by the test team. server/src/routes/patients.js: PATCH /:id is guarded by requireAuth, but GET /:id (line 110) and GET /search (line 85) are NOT. An unauthenticated caller can pull a full patient record — DOB, mobile, email, address, emergency contact, conditions — from a guessable sequential id (RF-0001, RF-0002…), and GET /api/patients/search?q= with an empty q returns the 20 most recently enrolled patients with names and mobiles. Add requireAuth to both. Highest-priority item in the portfolio.' },
            { title: 'Test dashboard: positive & negative flows, daily', type: 'test', priority: 'P0', status: 'planned', detail: 'Happy: enrollment multi-step, payment capture, admin search/filter/CSV, WhatsApp flyer conversation→delivery. Negative: Razorpay failure/absent keys, unauthenticated PII access attempt (must 401), bad webhook signature, Twilio error, whitelist bypass attempt. Mock Razorpay, SMTP, Cloudinary, Twilio and Anthropic; Postgres via test fixtures.' },
            { title: 'Unify bot data with main Postgres', type: 'infra', priority: 'P1', status: 'backlog', detail: 'Bot runs on flat patients.json/doctor.json duplicating the main app’s Postgres — integrate the two repos.' },
            { title: 'Production WhatsApp sender', type: 'feature', priority: 'P1', status: 'backlog', detail: 'Move off the Twilio sandbox; includes persisting in-memory conversation state and enforcing a non-empty whitelist.' },
            { title: 'Verify graceful degradation of optional integrations', type: 'bug', priority: 'P2', status: 'backlog', detail: 'Razorpay/SMTP/Cloudinary are env-gated — confirm clean behavior when keys are absent and finish payment capture.' },
        ],
        report: 'The clinic platform is built and the growth-report pipeline already reads its live Postgres. Sprint 1 has two P0s: lock down the unauthenticated patient endpoints (PII risk found in audit), and the daily test dashboard with all five external services mocked. Brainstorm ask: folding the WhatsApp bot into the main app so Dr. Neha has one system, not two.',
    },
    {
        slug: 'kaushalstack-platform',
        name: 'KaushalStack Platform',
        project: '~/Projects/kaushalstack — kaushalstack.com',
        mission: 'The mothership: partner portals, agent round-tables, marketplace, usage metering — and now the Sprint board itself.',
        team: [
            { id: 'ks-advait', agent_name: 'Advait', name: 'Tech Lead', category: 'engineering', associated_tech_skills: 'Express, PocketBase, Vite/React monorepo, sprint planning', why: 'Every other team runs on this platform — its sprint discipline sets the ceiling for everyone.', description: 'Runs platform sprint planning, owns the Sprint board feature roadmap, and briefs the CEO on platform health and cost.' },
            { id: 'ks-ritu', agent_name: 'Ritu', name: 'Platform Engineer', category: 'engineering', associated_tech_skills: 'PocketBase collections, provider metering, roundtable pipeline, Docker deploy', why: 'Owns the round-table→spec→build pipeline and the metering choke point.', description: 'Owns partner budget caps, usage_events accuracy, roundtable pipeline reliability, and the daily test-run ingest endpoint.' },
            { id: 'ks-karan', agent_name: 'Karan', name: 'QA & Test Dashboard Engineer', category: 'engineering', associated_tech_skills: 'Supertest, PocketBase test instance, provider mocking', why: 'Platform regressions cascade to every customer portal at once.', description: 'Builds the platform daily suite: roundtable→spec pipeline, budget-cap 402 enforcement, marketplace subscription gating, sprint-board CRUD. Mocks LLM providers and runs against a throwaway PocketBase.' },
        ],
        items: [
            { title: 'Test dashboard: positive & negative flows, daily', type: 'test', priority: 'P0', status: 'planned', detail: 'Happy: roundtable→spec pipeline, partner CRUD, marketplace subscription gating by paid_until, sprint-board CRUD + seed idempotency. Negative: credit-cap 402, suspended partner, unpaid subscription hidden, unauthenticated admin routes. Mock all LLM providers; throwaway PocketBase instance.' },
            { title: 'Daily test-run scheduler + ingest', type: 'infra', priority: 'P1', status: 'planned', detail: 'Each team’s suite POSTs results to the sprint test-runs endpoint on a daily cron (pattern: growth-scheduler.js). Red teams surface on the Sprint tab by morning.' },
            { title: 'Sprint board phase 2: roundtable-powered planning', type: 'feature', priority: 'P2', status: 'backlog', detail: 'Wire each sprint team into the existing roundtable engine so the CEO can run interactive sprint-planning/brainstorm sessions per team from the admin.' },
            { title: 'Per-team cost attribution on Sprint tab', type: 'feature', priority: 'P2', status: 'backlog', detail: 'Surface usage_events cost per sprint team so each team’s briefing includes what it spent.' },
        ],
        report: 'Sprint board v1 ships this sprint: collections, admin API, Sprint tab, seeded teams. Next: the daily scheduler so every team’s test dashboard reports in each morning, then roundtable-powered sprint planning so the CEO can talk to each team directly from the admin. Brainstorm ask: gamification — streaks for consecutive green days, a portfolio health score at the top of the tab.',
    },
];
