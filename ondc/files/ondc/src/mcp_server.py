"""
KaushalStack Lead Scout — MCP server over Beckn/ONDC.

Exposes tools a Round Table agent (or Claude / any MCP client) can call:

  discover_nearby_demand   BAP-side: fire a location-scoped /search on ONDC
  get_leads                Read scored leads (inbound demand + discoveries)
  qualify_lead             Move a lead through the pipeline
  lead_digest              Summarized funnel snapshot for the growth agent
  generate_onboarding_keys One-time Ed25519 keygen for registry onboarding

Transport is controlled by MCP_TRANSPORT env var:
  stdio (default) — local Claude Code / Claude Desktop
  sse             — deployed service; agents connect via HTTP SSE
                    endpoint: https://<host>/mcp/sse

Run locally:  python -m src.mcp_server
Run on VPS:   MCP_TRANSPORT=sse python -m src.mcp_server
"""

import asyncio
import json
import os
import time

from dotenv import load_dotenv
load_dotenv()

from mcp.server.fastmcp import FastMCP

from src.beckn.client import BecknClient
from src.beckn.crypto import generate_key_pairs
from src.leads import store

_transport = os.getenv("MCP_TRANSPORT", "stdio")
_prefix    = "/mcp" if _transport == "sse" else ""

mcp = FastMCP(
    "kaushalstack-lead-scout",
    host=os.getenv("MCP_HOST", "127.0.0.1"),
    port=int(os.getenv("MCP_PORT", "8000")),
    sse_path=f"{_prefix}/sse",
    message_path=f"{_prefix}/messages/",
)
client = BecknClient()


@mcp.tool()
async def discover_nearby_demand(query: str, city_code: str = "std:080",
                                 domain: str = "ONDC:SRV11",
                                 gps: str = "12.9416,77.7400",
                                 radius_km: float = 5.0) -> str:
    """Fire a Beckn /search on the ONDC gateway to discover sellers, suppliers
    or complementary businesses near a location. Results arrive async at the
    /on_search webhook and land in the lead store as 'outbound_discovery'.

    Args:
        query: free-text intent, e.g. 'physiotherapy equipment supplier'
        city_code: ONDC STD city code (Bengaluru = std:080)
        domain: ONDC domain taxonomy code (services = ONDC:SRV11, retail grocery = ONDC:RET10)
        gps: 'lat,lng' center of the search
        radius_km: search radius
    """
    result = await client.search(domain=domain, city=city_code, query=query,
                                 gps=gps, radius_km=radius_km)
    return json.dumps(result, indent=2)


@mcp.tool()
def get_leads(status: str = "", min_score: float = 0, limit: int = 25) -> str:
    """List captured leads sorted by score. Inbound demand leads are live
    buyer search intents that hit our /search webhook via the ONDC gateway.

    Args:
        status: filter — new | qualified | responded | won | lost (empty = all)
        min_score: only leads scoring at or above this (0–100)
        limit: max rows
    """
    leads = store.list_leads(status or None, min_score, limit)
    return json.dumps(leads, indent=2, default=str)


@mcp.tool()
def qualify_lead(lead_id: int, status: str, note: str = "") -> str:
    """Advance a lead in the pipeline: new → qualified → responded → won/lost.

    Args:
        lead_id: id from get_leads
        status: qualified | responded | won | lost
        note: optional agent reasoning (logged)
    """
    ok = store.update_lead_status(lead_id, status)
    return json.dumps({"lead_id": lead_id, "status": status,
                       "updated": ok, "note": note})


@mcp.tool()
def lead_digest(hours: int = 24) -> str:
    """Funnel snapshot for the growth agent: counts by status, top queries,
    average score — the raw material for a daily 'growth standup'."""
    leads = store.list_leads(limit=500)
    cutoff = time.time() - hours * 3600
    recent = [l for l in leads if l["created_at"] >= cutoff]
    by_status: dict[str, int] = {}
    queries: dict[str, int] = {}
    for l in recent:
        by_status[l["status"]] = by_status.get(l["status"], 0) + 1
        if l["query"]:
            queries[l["query"]] = queries.get(l["query"], 0) + 1
    top_queries = sorted(queries.items(), key=lambda x: -x[1])[:10]
    avg = round(sum(l["score"] for l in recent) / len(recent), 1) if recent else 0
    return json.dumps({"window_hours": hours, "total": len(recent),
                       "by_status": by_status, "avg_score": avg,
                       "top_queries": top_queries}, indent=2)


@mcp.tool()
def generate_onboarding_keys() -> str:
    """One-time: generate the Ed25519 signing key pair for ONDC registry
    onboarding. Store the private key in a secrets manager — never in git.
    (X25519 encryption keys must also be generated; see README.)"""
    return json.dumps(generate_key_pairs(), indent=2)


if __name__ == "__main__":
    if _transport == "sse":
        mcp.run(transport="sse")
    else:
        mcp.run()
