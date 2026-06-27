import { Router } from 'express';
import logger from '../utils/logger.js';
import { ensureCache, search, cacheSize, getSkillById } from '../embeddings/cache.js';

const router = Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBED_MODEL    = 'text-embedding-3-small';

const STOPWORDS = new Set([
    'help','with','team','for','the','and','that','this','can','you','want',
    'need','make','build','create','using','use','get','have','from','what',
    'how','who','will','our','your','their','about','into','some','more',
    'like','just','also','than','then','when','where','which','please','want',
]);

async function embedQuery(text) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    });
    if (!res.ok) throw new Error(`OpenAI embed failed: ${res.status}`);
    const data = await res.json();
    return data.data[0].embedding;
}

// Tech is only force-included when the best Tech candidate is semantically
// relevant. With text-embedding-3-small, scores around 0.25–0.27 are loose
// surface matches (e.g. shared "Monitor" token); above ~0.30 the match is
// actually adjacent to the query (Python Analyzer for cricket-analytics
// queries lands at ~0.35, while Linux Monitor for telemedicine lands at ~0.26).
const TECH_MIN_SCORE = 0.30;

// Ananya is the tool-using App Builder. For execution-phase queries that are
// clearly "build me a {page/app/site}", her presence in the team is required —
// regardless of cosine score. The embedding match gets dominated by the noun
// (e.g. "physiotherapy clinic") and she falls off the top-5 even though she's
// the right agent for the verb.
const ANANYA_SKILL_ID = '0v9syxxawznp95v';
const BUILD_VERBS = /\b(build|create|make|develop|generate|scaffold|construct|design)\b/i;
const BUILD_NOUNS = /\b(landing\s+page|website|webpage|web\s+app|web\s+page|web\s+site|microsite|portfolio|prototype|app|site|page|html|web|timer|generator|tracker|calculator|quiz|tool|utility|game|dashboard|form|viewer|picker|finder|converter|filter|widget|countdown|to-?do)\b/i;

function isBuildQuery(q) {
    return BUILD_VERBS.test(q) && BUILD_NOUNS.test(q);
}

// Maya is the UX Mockup Designer. Pinned for design/mockup-shaped queries in
// either ideation OR execution phase (you might want mockups before deciding
// what to build, or alongside building it).
const MAYA_SKILL_ID = 'uepji0o2teuf29b';
const DESIGN_EXPLICIT = /\b(mockup|mockups|wireframe|wireframes|prototype|prototypes|sketch|ui[\s-]design|ux[\s-]design)\b/i;
const DESIGN_VERB_OBJECT = /\b(design|visualize|mock\s+up)\b[^.!?]{0,80}?\b(app|website|webpage|web\s+app|screens?|ui|ux|interface|landing\s+page|page|site|mobile)\b/i;

function isDesignQuery(q) {
    return DESIGN_EXPLICIT.test(q) || DESIGN_VERB_OBJECT.test(q);
}

// Kavya is the Email Campaign Designer — Maya's marketing-phase counterpart.
// Pinned for marketing-phase queries that mention email-shaped artifacts.
// Bare "email" is enough; we also accept newsletter / inbox / drip / mailing
// list and explicit pairs like "email campaign" / "launch email".
const KAVYA_SKILL_ID = 'ip1bvcutzgsy28p';
const EMAIL_CAMPAIGN_KEYWORDS = /\b(email|newsletter|inbox|preheader|subject\s+line|mailing\s+list|drip\s+sequence|onboarding\s+email|launch\s+email|announcement\s+email|email\s+campaign|email\s+blast|email\s+sequence)\b/i;

function isEmailCampaignQuery(q) {
    return EMAIL_CAMPAIGN_KEYWORDS.test(q);
}

// Tara is the Social Media Campaign Designer — Kavya's social counterpart.
// Pinned for marketing-phase queries that mention a social platform or
// platform-native content shape (story, reel, carousel, thread, etc.).
// Bare "instagram" or "facebook + content noun" is enough; bare "linkedin"
// requires a content noun so we don't blanket-claim every LinkedIn-related
// prompt away from existing LinkedIn-specific coaches.
const TARA_SKILL_ID = 'eu6cweasi3d4xt8';
const SOCIAL_MEDIA_KEYWORDS = /\b(instagram|insta\b|ig\s+(?:post|story|reel|carousel)|facebook\s+(?:post|page|ad|ads|campaign|reel|story|content)|linkedin\s+(?:post|thread|carousel|article|update|content)|twitter\s+thread|tweet\s+thread|x\s+thread|social\s+(?:media|post|campaign|content)|reels?|carousel\s+(?:post|slide)|insta\s+story)\b/i;

function isSocialMediaQuery(q) {
    return SOCIAL_MEDIA_KEYWORDS.test(q);
}

// Hostinger is the Deployment Specialist — the hosting half of the
// Maya (design) → Ananya (build) → Hostinger (deploy) pipeline. Pinned for
// execution-phase queries that are clearly about getting a site live, and
// also travels with Ananya (see ensurePartner below) so every build team
// includes the agent who can answer "how do I put this online?".
// The record id is fixed at creation time (scripts/extract-topic-skills.js
// --record-id hostingerdeploy) so it's identical across local and prod.
const HOSTINGER_SKILL_ID = 'hostingerdeploy';
const DEPLOY_KEYWORDS = /\b(deploy|deployment|hosting|host\s+(?:my|the|a|this|it)|publish|go\s+live|put\s+(?:my|the|it|this)[^.!?]{0,30}\bonline|hostinger|domain|dns|nameserver|ssl\s+certificate|public_html|ftp)\b/i;

function isDeployQuery(q) {
    return DEPLOY_KEYWORDS.test(q);
}

// Zach is the Tech-to-B2B Founder Strategist — for senior tech operators
// (Salesforce / Stripe / Shopify / Atlassian alumni) thinking about leaving
// to start a B2B SaaS. He competes for the single career-ideation slot with
// Fabrice (D2C / consumer-brand pivots), so we pin him only on prompts that
// are clearly B2B-SaaS-founder shaped — bare "Salesforce" alone is too
// ambiguous (could be Salesforce admin learning), so we require it paired
// with founder/alum/leave/build language.
const ZACH_SKILL_ID = 'guysr11w0w3xqa0';
const B2B_FOUNDER_KEYWORDS = /\b(b2b\s+saas|saas\s+founder|founder[-\s]market\s+fit|services[-\s]first|tech[-\s]to[-\s]founder|build\s+what\s+you\s+know|slack\s+community|b2b\s+community\s+platform|bootstrapped\s+b2b|big[-\s]co\s+to\s+founder|big\s+company\s+to\s+founder|salesforce\s+(?:alum|alumni|veteran|ecosystem)|(?:salesforce|stripe|shopify|atlassian|twilio)\s+(?:pm|engineer|director).*founder|validate\s+b2b|b2b\s+demand|b2b\s+icp)\b/i;

function isB2BFounderQuery(q) {
    return B2B_FOUNDER_KEYWORDS.test(q);
}

function pickTeam(scored, size = 6, { query = '', phase = null } = {}) {
    // One per category, in order of score, until we hit `size`.
    const seenCats = new Set();
    const team = [];
    for (const s of scored) {
        if (!seenCats.has(s.category)) {
            seenCats.add(s.category);
            team.push(s);
        }
        if (team.length === size) break;
    }

    // If Tech isn't already in the team, try to add the best-scoring Tech
    // candidate from the wider results — but only if it clears the relevance
    // floor. We'd rather return 4 strong picks than pad with an irrelevant one.
    const hasTech = team.some(s => s.category === 'Tech');
    if (!hasTech) {
        const bestTech = scored.find(s => s.category === 'Tech');
        if (bestTech && (bestTech._score ?? 0) >= TECH_MIN_SCORE) {
            if (team.length >= size) team[team.length - 1] = bestTech;
            else team.push(bestTech);
        }
    }

    // Required pins — Maya / Ananya / Hostinger are intentionally NOT pinned
    // here anymore. They're executors, not deliberators: the round table is
    // for domain specialists to discuss WHAT to build, and Aisha's spec
    // determines WHICH executor stages then run downstream (the pipeline row
    // below the chat). Kavya (email) and Tara (social) remain pinnable
    // because they still benefit from round-table input on tone/audience.
    const pins = [];
    // Kavya / Tara pins fire when the marketing phase tile is selected OR no
    // tile is selected (phase == null). If the user has explicitly picked a
    // non-marketing phase (ideation / execution), respect that and don't pin
    // — they probably don't want a marketing specialist crashing the team.
    const phaseAllowsMarketingPins = (phase === 'marketing' || phase == null);

    // Kavya pins for email-shaped queries.
    if (phaseAllowsMarketingPins && isEmailCampaignQuery(query)) {
        const kavya = scored.find(s => s.id === KAVYA_SKILL_ID) || getSkillById(KAVYA_SKILL_ID);
        if (kavya) pins.push(kavya);
    }
    // Tara pins for social-media queries (Instagram / LinkedIn / Facebook / etc.).
    if (phaseAllowsMarketingPins && isSocialMediaQuery(query)) {
        const tara = scored.find(s => s.id === TARA_SKILL_ID) || getSkillById(TARA_SKILL_ID);
        if (tara) pins.push(tara);
    }
    // Zach pins for ideation-phase B2B-SaaS-founder queries.
    if (phase === 'ideation' && isB2BFounderQuery(query)) {
        const zach = scored.find(s => s.id === ZACH_SKILL_ID) || getSkillById(ZACH_SKILL_ID);
        if (zach) pins.push(zach);
    }
    const pinnedIds = new Set(pins.map(p => p.id));
    for (const pin of pins) {
        if (team.some(s => s.id === pin.id)) continue;
        if (team.length < size) {
            team.push(pin);
        } else {
            // Replace the weakest non-pinned slot (last position by score).
            for (let i = team.length - 1; i >= 0; i--) {
                if (!pinnedIds.has(team[i].id)) {
                    team[i] = pin;
                    break;
                }
            }
        }
    }

    // Maya/Ananya/Hostinger used to travel together in the team via
    // ensurePartner pairs; that's gone now since they're system-pipeline
    // executors, not round-table contributors. The pipeline strip below
    // the chat handles their orchestration off the spec instead.

    return team.slice(0, size);
}

const VALID_PHASES = new Set(['ideation', 'execution', 'marketing']);
// Team size bounds. 6 is the default round-table head count (the hex viz on
// the frontend is sized for 6); 10 is the upper cap to keep round-table LLM
// cost bounded and the layout legible. Anything outside this gets clamped.
const MIN_TEAM_SIZE = 6;
const MAX_TEAM_SIZE = 10;

router.post('/recommend', async (req, res) => {
    const { query, phase: rawPhase, size: rawSize } = req.body || {};
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query is required' });
    }
    const phase = typeof rawPhase === 'string' && VALID_PHASES.has(rawPhase) ? rawPhase : null;
    const parsedSize = Number.isFinite(+rawSize) ? Math.floor(+rawSize) : MIN_TEAM_SIZE;
    const size = Math.max(MIN_TEAM_SIZE, Math.min(MAX_TEAM_SIZE, parsedSize));

    // Clean query for embedding — remove stopwords for a tighter semantic signal
    const cleaned = query
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 1 && !STOPWORDS.has(w))
        .join(' ') || query;

    try {
        if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

        await ensureCache();

        if (cacheSize() === 0) {
            logger.warn('Embedding cache empty, returning empty team');
            return res.json({ skills: [] });
        }

        const vector       = await embedQuery(cleaned);
        const rawTopSkills = search(vector, 500, phase);
        // Two filters in series:
        //   1. PIPELINE_SYSTEM_IDS — Maya/Ananya/Hostinger never deliberate
        //   2. Tech-category — those go to the separate tech round table
        //      that fires after Aisha's first spec, not the domain round
        //      table that runs on the user's raw prompt.
        const PIPELINE_SYSTEM_IDS = new Set([MAYA_SKILL_ID, ANANYA_SKILL_ID, HOSTINGER_SKILL_ID]);
        const topSkills    = rawTopSkills.filter(s =>
            !PIPELINE_SYSTEM_IDS.has(s.id) && s.category !== 'Tech'
        );
        let team           = pickTeam(topSkills, size, { query, phase });

        const techPick = team.find(s => s.category === 'Tech');
        logger.info(`recommend: "${query}" phase=${phase || 'all'} size=${size} → ${team.length} skills, top score ${team[0]?._score?.toFixed(3) || 'n/a'}, tech score ${techPick?._score?.toFixed(3) || 'omitted'}`);

        // Strip the _score before sending to the client — internal detail
        res.json({ skills: team.slice(0, size).map(({ _score, ...s }) => s) });
    } catch (err) {
        logger.error('recommend error:', err.message);
        res.status(500).json({ error: 'recommendation failed', skills: [] });
    }
});

// Tech round table specialists — same embedding search as /recommend but
// restricted to category=Tech. Returns 4-6 skills by default (smaller team
// than the domain RT because tech opinions converge faster). Used by the
// "Convene tech team" flow: the spec text is the query so the embedding
// surfaces Node.js / React / Postgres / Docker specialists matched to the
// actual technical surface area of the build, not the user's raw prompt.
const TECH_TEAM_MIN = 4;
const TECH_TEAM_MAX = 8;
router.post('/recommend/tech', async (req, res) => {
    const { query, size: rawSize } = req.body || {};
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query is required' });
    }
    const parsedSize = Number.isFinite(+rawSize) ? Math.floor(+rawSize) : TECH_TEAM_MIN;
    const size = Math.max(TECH_TEAM_MIN, Math.min(TECH_TEAM_MAX, parsedSize));

    const cleaned = query
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 1 && !STOPWORDS.has(w))
        .join(' ') || query;

    try {
        if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
        await ensureCache();
        if (cacheSize() === 0) return res.json({ skills: [] });

        const vector = await embedQuery(cleaned);
        const rawTopSkills = search(vector, 500, null);
        // Tech category only, drop the system pipeline IDs explicitly even
        // though Maya/Hostinger live outside Tech — Ananya does too in the
        // schema, so the SKILL_ID filter protects against that.
        const PIPELINE_SYSTEM_IDS = new Set([MAYA_SKILL_ID, ANANYA_SKILL_ID, HOSTINGER_SKILL_ID]);
        const techSkills = rawTopSkills.filter(s =>
            s.category === 'Tech' && !PIPELINE_SYSTEM_IDS.has(s.id)
        );

        // One per agent_name so we don't return 3 Vikrams. Pick the highest-
        // scoring slot per name, then truncate to `size`.
        const seenAgentNames = new Set();
        const team = [];
        for (const s of techSkills) {
            if (seenAgentNames.has(s.agent_name)) continue;
            seenAgentNames.add(s.agent_name);
            team.push(s);
            if (team.length === size) break;
        }

        logger.info(`recommend/tech: "${query.slice(0, 60)}" size=${size} → ${team.length} skills, top ${team[0]?._score?.toFixed(3) || 'n/a'}`);
        res.json({ skills: team.map(({ _score, ...s }) => s) });
    } catch (err) {
        logger.error('recommend/tech error:', err.message);
        res.status(500).json({ error: 'tech recommendation failed', skills: [] });
    }
});

export default router;
