---
description: Run the full kaushalstack loop end-to-end from a single prompt — domain round table → spec → tech round table → spec v2.
argument-hint: <what you want to build>
---

Run the entire kaushalstack pipeline as one orchestrated session:

1. **Domain round table**
   - Call `recommend_agents` with `query: $ARGUMENTS, size: 6`.
   - Call `run_roundtable` with the returned `team`, `query: $ARGUMENTS`, `kind: "domain"`. Capture the returned `chat_id`.
   - Render the responses compactly (agent name + 1-sentence summary each, not full text).

2. **Spec v1**
   - Call `generate_spec` with the `chat_id`.
   - Render the full spec text.

3. **Tech round table**
   - Call `recommend_tech_agents` with `query: <the spec text>`, `size: 5`.
   - Call `run_roundtable` with that team, `query: "Review this spec and weigh in on architecture, stack, and risks: <spec text>"`, `chat_id: <from step 1>`, `kind: "tech"`.
   - Render the tech responses compactly.

4. **Spec v2**
   - Call `generate_spec` again with the same `chat_id`.
   - Render the regenerated spec — this version absorbs both transcripts.

At the end, summarize in 3 lines: how many domain specialists, how many tech specialists, and the key delta between v1 and v2 of the spec. Surface the final `chat_id` so the user can continue in the web UI if they want to design (Maya) / build (Ananya) / deploy (Hostinger) from it.

If at any step `byok_fell_back: true` appears, mention it as a one-line note.
