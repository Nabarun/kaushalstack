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

    // Required pins — Ananya for build-shaped execution, Maya for design-shaped
    // ideation OR execution. We first try the phase-filtered scored list (so
    // we keep _score if available); otherwise fall back to getSkillById, which
    // ignores phase and ensures cross-phase pins still work.
    const pins = [];
    if (phase === 'execution' && isBuildQuery(query)) {
        const ananya = scored.find(s => s.id === ANANYA_SKILL_ID) || getSkillById(ANANYA_SKILL_ID);
        if (ananya) pins.push(ananya);
    }
    // Maya pins on either explicit design language OR any web/app-y build query.
    // Rationale: every "build a landing page / app / site" intrinsically has a
    // UX layer — palette, typography, layout. Showing mockups alongside the
    // build is almost always useful, never harmful.
    if ((phase === 'ideation' || phase === 'execution') && (isDesignQuery(query) || isBuildQuery(query))) {
        const maya = scored.find(s => s.id === MAYA_SKILL_ID) || getSkillById(MAYA_SKILL_ID);
        if (maya) pins.push(maya);
    }
    // Kavya pins for marketing-phase email-shaped queries — she's the
    // tool-using designer that renders an actual HTML email + preview, the
    // way Maya does for app UI. Any marketing prompt that names email /
    // newsletter / inbox / drip / launch email triggers the pin.
    if (phase === 'marketing' && isEmailCampaignQuery(query)) {
        const kavya = scored.find(s => s.id === KAVYA_SKILL_ID) || getSkillById(KAVYA_SKILL_ID);
        if (kavya) pins.push(kavya);
    }
    // Tara pins for marketing-phase social-media queries — Instagram, Facebook,
    // LinkedIn post/thread, Twitter/X thread, reels, stories, carousels. She
    // renders the post inside the platform's own UI chrome the way Maya does
    // for apps and Kavya does for inboxes.
    if (phase === 'marketing' && isSocialMediaQuery(query)) {
        const tara = scored.find(s => s.id === TARA_SKILL_ID) || getSkillById(TARA_SKILL_ID);
        if (tara) pins.push(tara);
    }
    // Hostinger pins for execution-phase deploy/hosting-shaped queries —
    // "deploy my site", "put this online", "connect my domain", "hostinger".
    if (phase === 'execution' && isDeployQuery(query)) {
        const hostinger = scored.find(s => s.id === HOSTINGER_SKILL_ID) || getSkillById(HOSTINGER_SKILL_ID);
        if (hostinger) pins.push(hostinger);
    }
    // Zach pins for ideation-phase B2B-SaaS-founder queries. The career
    // category only has one slot per recommendation team, and Fabrice (D2C)
    // wins most natural-cosine matches; this pin guarantees Zach surfaces on
    // prompts that are clearly B2B-founder shaped, displacing Fabrice for
    // that one slot.
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

    // Ananya ↔ Maya travel together. If one is in the team via any path
    // (pin, natural cosine, or Tech force-include), the other comes along
    // — a build needs a designer, and a design without a builder usually
    // wants one too. Symmetric so users always see both halves of the
    // build/design pair, regardless of which keyword tripped first.
    const ensurePartner = (presentId, partnerId) => {
        if (!team.some(s => s.id === presentId)) return;
        if (team.some(s => s.id === partnerId)) return;
        const partner = scored.find(s => s.id === partnerId) || getSkillById(partnerId);
        if (!partner) return;
        if (team.length < size) {
            team.push(partner);
            pinnedIds.add(partnerId);
            return;
        }
        // Replace the weakest non-pinned, non-`presentId` slot.
        for (let i = team.length - 1; i >= 0; i--) {
            if (team[i].id !== presentId && !pinnedIds.has(team[i].id)) {
                team[i] = partner;
                pinnedIds.add(partnerId);
                break;
            }
        }
    };
    ensurePartner(ANANYA_SKILL_ID, MAYA_SKILL_ID);
    ensurePartner(MAYA_SKILL_ID, ANANYA_SKILL_ID);
    // Hostinger rides along whenever Ananya is on the team — anything Ananya
    // builds will eventually need hosting, and she consults Hostinger for the
    // deployment guide during the build. One-directional: a pure hosting
    // question shouldn't drag the whole build pair in.
    ensurePartner(ANANYA_SKILL_ID, HOSTINGER_SKILL_ID);

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

        const vector    = await embedQuery(cleaned);
        const topSkills = search(vector, 500, phase);
        let team        = pickTeam(topSkills, size, { query, phase });

        const techPick = team.find(s => s.category === 'Tech');
        logger.info(`recommend: "${query}" phase=${phase || 'all'} size=${size} → ${team.length} skills, top score ${team[0]?._score?.toFixed(3) || 'n/a'}, tech score ${techPick?._score?.toFixed(3) || 'omitted'}`);

        // Strip the _score before sending to the client — internal detail
        res.json({ skills: team.slice(0, size).map(({ _score, ...s }) => s) });
    } catch (err) {
        logger.error('recommend error:', err.message);
        res.status(500).json({ error: 'recommendation failed', skills: [] });
    }
});

export default router;
