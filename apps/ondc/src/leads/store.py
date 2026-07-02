"""Lead store: persists incoming Beckn search intents (BPP side) and
on_search results (BAP side) as leads, with naive scoring the Round Table
agents can refine."""

import json
import math
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[2] / "leads.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at REAL,
    direction TEXT,          -- 'inbound_demand' (BPP) | 'outbound_discovery' (BAP)
    domain TEXT,
    city TEXT,
    transaction_id TEXT,
    bap_id TEXT,             -- which buyer app the intent came from
    query TEXT,
    category TEXT,
    gps TEXT,
    distance_km REAL,
    score REAL,
    status TEXT DEFAULT 'new',   -- new | qualified | responded | won | lost
    raw JSON
);
"""


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(SCHEMA)
    return conn


def haversine_km(gps1: str, gps2: str) -> float | None:
    try:
        lat1, lon1 = map(float, gps1.split(","))
        lat2, lon2 = map(float, gps2.split(","))
    except (ValueError, AttributeError):
        return None
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def score_lead(*, distance_km: float | None, query: str | None,
               business_keywords: list[str]) -> float:
    """0–100. Proximity-weighted, keyword-boosted. Agents can re-score."""
    score = 40.0
    if distance_km is not None:
        score += max(0.0, 30.0 * (1 - min(distance_km, 15) / 15))
    if query:
        q = query.lower()
        hits = sum(1 for kw in business_keywords if kw.lower() in q)
        score += min(30.0, hits * 15.0)
    return round(min(score, 100.0), 1)


def save_lead(*, direction: str, payload: dict, business_gps: str | None,
              business_keywords: list[str]) -> dict:
    ctx = payload.get("context", {})
    intent = payload.get("message", {}).get("intent", {})
    query = (intent.get("item", {}) or {}).get("descriptor", {}).get("name")
    category = (intent.get("category", {}) or {}).get("id")
    gps = (((intent.get("fulfillment", {}) or {}).get("end", {}) or {})
           .get("location", {}) or {}).get("gps")
    dist = haversine_km(business_gps, gps) if business_gps and gps else None
    score = score_lead(distance_km=dist, query=query, business_keywords=business_keywords)

    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO leads (created_at, direction, domain, city, transaction_id,"
            " bap_id, query, category, gps, distance_km, score, raw)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (time.time(), direction, ctx.get("domain"), ctx.get("city"),
             ctx.get("transaction_id"), ctx.get("bap_id"), query, category,
             gps, dist, score, json.dumps(payload)))
        return {"lead_id": cur.lastrowid, "score": score, "distance_km": dist}


def list_leads(status: str | None = None, min_score: float = 0, limit: int = 25) -> list[dict]:
    q = "SELECT id, created_at, direction, domain, city, bap_id, query, category," \
        " gps, distance_km, score, status FROM leads WHERE score >= ?"
    params: list = [min_score]
    if status:
        q += " AND status = ?"
        params.append(status)
    q += " ORDER BY score DESC, created_at DESC LIMIT ?"
    params.append(limit)
    with _conn() as conn:
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def update_lead_status(lead_id: int, status: str) -> bool:
    with _conn() as conn:
        cur = conn.execute("UPDATE leads SET status=? WHERE id=?", (status, lead_id))
        return cur.rowcount > 0
