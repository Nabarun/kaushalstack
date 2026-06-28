// Runs the private skills attached to a business as additional analysis layers
// on top of the competitor scan inside growth-report.js.
//
// Each attached skill is a single-shot LLM call where:
//   - system prompt = the skill's full markdown body (uploaded SKILL.md content)
//   - user prompt  = business context (name, website, description, recent
//                    competitor-scan summary) so the AI has something to work on
//
// Output: array of { skill_id, skill_name, output_text } stacked into the
// final report. Failures on individual skills are logged + skipped (the
// pipeline never hard-fails on a bad skill).

import logger from '../utils/logger.js';
import pb from '../utils/pocketbaseClient.js';
import { chatComplete } from '../providers/index.js';

const PER_SKILL_TIMEOUT_MS = 90_000;     // 90s — generous; LLM + analysis
const PER_SKILL_MAX_OUTPUT  = 4_000;     // chars; trim runaway outputs

function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        promise.then(v => { clearTimeout(t); resolve(v); },
                     e => { clearTimeout(t); reject(e); });
    });
}

// Strip YAML frontmatter off the skill body so it doesn't pollute the system
// prompt. The frontmatter is meta (name/description/metadata) intended for the
// upload form, not for the LLM.
function stripFrontmatter(md) {
    if (!md) return '';
    const m = md.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    return (m ? m[1] : md).trim();
}

// Build the user prompt: business context + recent competitor scan summary
// (if available) so the attached skill has real material to analyse.
function buildUserPrompt(business, recentScan) {
    const parts = [
        `BUSINESS NAME: ${business.name}`,
        business.website_url ? `WEBSITE: ${business.website_url}` : '',
        business.description ? `DESCRIPTION:\n${business.description}` : '',
    ].filter(Boolean);
    if (recentScan) {
        parts.push(`RECENT COMPETITOR SCAN SUMMARY (last 7 days):\n${recentScan.slice(0, 4000)}`);
    }
    parts.push(`Now follow your instructions above and produce your analysis as concise markdown. ~200-500 words. Specific, actionable, evidence-led. No filler.`);
    return parts.join('\n\n');
}

// List all private skills attached to this business (admin-uploaded). Uses
// the superuser-authed pocketbase client so the private-skill access rule
// doesn't block us.
async function listAttachedSkills(businessId) {
    try {
        const r = await pb.collection('skills').getList(1, 50, {
            filter: `business_id = "${businessId}" && private = true`,
            sort: '-created',
            fields: 'id,name,agent_name,description,competitor_website,created',
        });
        return r.items;
    } catch (err) {
        logger.warn(`business-skills-runner: list failed for ${businessId}: ${err.message}`);
        return [];
    }
}

// Run a single skill — one LLM call, return its text output (or null on error).
async function runOneSkill(skill, business, recentScan, llmConfig) {
    const system = stripFrontmatter(skill.description || '');
    if (!system) {
        logger.warn(`business-skills-runner: skill ${skill.id} (${skill.name}) has empty body — skipping`);
        return null;
    }
    const user = buildUserPrompt(business, recentScan);
    try {
        const raw = await withTimeout(
            chatComplete(llmConfig.provider, {
                key:          llmConfig.key,
                model:        llmConfig.model,
                userPrompt:   user,
                cachedPrefix: system,
                jsonMode:     false,
            }),
            PER_SKILL_TIMEOUT_MS,
            `attached skill "${skill.name}"`,
        );
        return String(raw || '').slice(0, PER_SKILL_MAX_OUTPUT).trim();
    } catch (err) {
        logger.warn(`business-skills-runner: skill ${skill.id} (${skill.name}) failed: ${err.message}`);
        return null;
    }
}

// Run all attached skills for a business and return their outputs. recentScan
// is an optional summary string from the competitor analysis. llmConfig is
// { provider, key, model } passed in from growth-report (same key path used
// for the main competitor LLM call).
export async function runAttachedSkills(business, recentScan, llmConfig) {
    if (!business?.id || !llmConfig?.key) return [];
    const skills = await listAttachedSkills(business.id);
    if (skills.length === 0) return [];

    logger.info(`business-skills-runner: running ${skills.length} attached skill(s) for ${business.name}`);
    const results = [];
    for (const skill of skills) {
        const output = await runOneSkill(skill, business, recentScan, llmConfig);
        if (output) {
            results.push({ skill_id: skill.id, skill_name: skill.name, output_text: output });
        }
    }
    logger.info(`business-skills-runner: ${results.length}/${skills.length} attached skills produced output`);
    return results;
}

// Render attached-skill outputs as stacked markdown sections, ready to append
// to the consolidated growth report's recommendations text.
export function renderAttachedSkillSections(skillResults) {
    if (!skillResults || skillResults.length === 0) return '';
    const sections = skillResults.map(r => `## ${r.skill_name}\n\n${r.output_text}`);
    return `\n\n---\n\n# Custom skill analysis\n\n${sections.join('\n\n---\n\n')}`;
}
