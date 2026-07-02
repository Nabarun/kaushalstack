# KaushalStack Lead Scout — MCP × Beckn/ONDC

An MCP server + webhook pair that turns the ONDC network into a lead engine
for a local business, designed to sit behind a Round Table agent team.

## How leads flow

```
                    ┌──────────────── ONDC Network ────────────────┐
Buyer app ──/search──▶ Gateway ──multicast──▶ [webhook/app.py /search]
                                                     │
                                              save + score lead
                                                     ▼
                                               leads.db (SQLite)
                                                     ▲
Round Table agent ──MCP tools──▶ [src/mcp_server.py]─┘
        │                              │
        └── discover_nearby_demand ────▶ Gateway /search (BAP side)
                                        results → /on_search → leads.db
```

Two directions, one store:
- **inbound_demand (BPP side)** — every buyer search in your city/radius that
  the gateway multicasts to you is a live intent. This is the high-value lead.
- **outbound_discovery (BAP side)** — the agent proactively searches ONDC for
  suppliers/partners/complementary businesses nearby.

## MCP tools exposed

| Tool | Purpose |
|---|---|
| `discover_nearby_demand` | Fire a signed, location-scoped Beckn `/search` |
| `get_leads` | Ranked leads (score = proximity + keyword match) |
| `qualify_lead` | Pipeline transitions: new → qualified → responded → won/lost |
| `lead_digest` | Funnel snapshot for the growth agent's daily standup |
| `generate_onboarding_keys` | One-time Ed25519 keygen for registry onboarding |

## Quick setup (one command)

```bash
./setup.sh                 # venv + deps + tests + registers the MCP server
./setup.sh --scope project # share the MCP config with your team via .mcp.json
```
It verifies Python 3.10+, installs into a `.venv`, runs the 20 tests, creates
`.env`, and registers `lead-scout` with Claude Code (or prints the Claude
Desktop config if the `claude` CLI isn't found).

## Run manually (mock mode — works today, no registration needed)

```bash
pip install -r requirements.txt
cp .env.example .env                      # ONDC_MOCK=true by default

# Terminal 1 — webhook (lead capture)
uvicorn src.webhook.app:app --port 8080

# Simulate an inbound buyer intent hitting your BPP endpoint:
curl -X POST localhost:8080/search -H 'Content-Type: application/json' \
     -d @mock/sample_search_intent.json

# Terminal 2 — MCP server (stdio)
python -m src.mcp_server
```

## Test

```bash
python tests/run_tests.py            # 20 tests: crypto, context, store, scoring
python -m src.webhook.stdlib_server  # zero-dependency webhook for constrained envs
```


Claude Desktop / Claude Code config:
```json
{ "mcpServers": { "lead-scout": {
    "command": "python", "args": ["-m", "src.mcp_server"],
    "cwd": "/path/to/ondc" } } }
```

## Requirements to go live on ONDC (the real checklist)

1. **Registered legal entity** — PAN, GSTIN, business address are mandatory
   fields in the Network Participant profile. An unregistered venture cannot
   sign the Network Participant Agreement. (Registering as a *TSP serving
   clients* still requires the entity.)
2. **FQDN + SSL** — your subscriber_id is a domain (e.g.
   `ondc.kaushalstack.com`) with a valid CA-issued cert (OCSP-checked).
3. **Key pairs** — Ed25519 signing pair + X25519 encryption pair. Private
   keys in a secrets manager; leaked keys = you own every action taken.
4. **Whitelisting** — sign up on the ONDC Network Participant Portal,
   complete profile, raise environment access requests for
   Staging → Pre-Prod → Production (each is gated).
5. **Registry subscription** — host `ondc-site-verification.html` (signed
   request_id) at your domain root, POST `/subscribe` to the registry,
   answer the `/on_subscribe` encryption challenge (implemented in
   `webhook/app.py`).
6. **Protocol compliance + certification** — implement the full API set for
   your role (BPP: search→on_search, select, init, confirm, status, cancel,
   support…), pass log validation and the certification flow per domain.
7. **Domain/category fit** — pick the right taxonomy: ONDC:RET1x for retail,
   ONDC:SRV11 for services (relevant for ReFunction Rehab), etc. Each
   role×domain×version combo is a separate certification journey.
8. **Operational duties** — order fulfillment, issue & grievance management
   (IGM), settlement (RSP), buyer-app finder fees. A "lead listener" that
   never responds with catalogs/orders will fail compliance — you must be a
   functioning seller node, and the leads are a byproduct.

### Practical shortcut for KaushalStack
Full NP onboarding is a months-long journey. Two faster paths:
- **Partner with a certified TSP/Seller App** and consume their APIs for
  client businesses, while KaushalStack focuses on the agent layer.
- Keep the **BAP-lite discovery** direction plus non-ONDC lead sources
  (Google Business Profile, Justdial, IndiaMART, WhatsApp inbound) behind
  the same MCP tool interface — the agents don't care where leads originate.

## Files

```
src/beckn/crypto.py    Ed25519 signing, Authorization header, verification
src/beckn/client.py    context builder, search intents, gateway client
src/webhook/app.py     /search (inbound leads), /on_search, /on_subscribe
src/leads/store.py     SQLite lead store, haversine proximity scoring
src/mcp_server.py      FastMCP server — the agent-facing surface
mock/                  sample payloads for local simulation
```
