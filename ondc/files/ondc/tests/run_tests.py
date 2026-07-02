"""
Test suite — runs with stdlib + cryptography only.

  python tests/run_tests.py

Covers: Ed25519 sign/verify round-trip, tamper detection, Beckn context &
intent construction, mock-mode BAP search, lead persistence/scoring/pipeline,
and the lead_digest aggregation the growth agent consumes.
"""

import asyncio
import json
import os
import sys
import tempfile
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Isolate the DB per test run
import src.leads.store as store  # noqa: E402
from pathlib import Path  # noqa: E402
store.DB_PATH = Path(tempfile.mkdtemp()) / "test_leads.db"

from src.beckn import crypto  # noqa: E402
from src.beckn.client import BecknClient, build_context, build_search_intent  # noqa: E402

PASS, FAIL = 0, 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✔ {name}")
    else:
        FAIL += 1
        print(f"  ✘ {name}  {detail}")


def test_crypto():
    print("[1] Beckn signing (Ed25519 + BLAKE2b-512)")
    keys = crypto.generate_key_pairs()
    check("keygen returns 44-char base64 keys",
          len(keys["signing_private_key"]) == 44 and len(keys["signing_public_key"]) == 44)

    body = json.dumps({"context": {"action": "search"}, "message": {"intent": {}}})
    header = crypto.build_auth_header(body, "ondc.kaushalstack.com", "k1",
                                      keys["signing_private_key"])
    check("auth header has ONDC keyId format",
          'keyId="ondc.kaushalstack.com|k1|ed25519"' in header
          and 'algorithm="ed25519"' in header)
    check("signature verifies with public key",
          crypto.verify(body, header, keys["signing_public_key"]))
    check("tampered body is rejected",
          not crypto.verify(body.replace("search", "select"), header,
                            keys["signing_public_key"]))
    check("wrong key is rejected",
          not crypto.verify(body, header,
                            crypto.generate_key_pairs()["signing_public_key"]))


def test_context_and_intent():
    print("[2] Beckn context & search intent")
    ctx = build_context("search", domain="ONDC:SRV11", city="std:080",
                        bap_id="ondc.kaushalstack.com",
                        bap_uri="https://ondc.kaushalstack.com/bapl")
    check("context carries required fields",
          all(ctx.get(k) for k in ("transaction_id", "message_id",
                                   "timestamp", "core_version", "ttl")))
    check("city uses STD convention", ctx["city"] == "std:080")

    intent = build_search_intent(query="physiotherapy", gps="12.94,77.74",
                                 radius_km=5)["intent"]
    check("intent has item descriptor",
          intent["item"]["descriptor"]["name"] == "physiotherapy")
    check("intent has GPS-scoped fulfillment",
          intent["fulfillment"]["end"]["location"]["gps"] == "12.94,77.74")
    check("intent declares buyer finder fee",
          "@ondc/org/buyer_app_finder_fee_type" in intent["payment"])


def test_mock_search():
    print("[3] BAP mock search (agent tool path)")
    os.environ["ONDC_MOCK"] = "true"
    result = asyncio.run(BecknClient().search(
        domain="ONDC:SRV11", city="std:080",
        query="rehab equipment supplier", gps="12.9416,77.7400"))
    check("mock mode returns payload without network", result["mode"] == "mock")
    check("payload is a valid /search envelope",
          result["sent"]["context"]["action"] == "search"
          and "intent" in result["sent"]["message"])


def test_lead_store():
    print("[4] Lead store, scoring & pipeline")
    payload = json.load(open(os.path.join(os.path.dirname(__file__),
                                          "..", "mock", "sample_search_intent.json")))
    r = store.save_lead(direction="inbound_demand", payload=payload,
                        business_gps="12.9416,77.7400",
                        business_keywords=["physiotherapy", "rehab"])
    check("lead saved with id", r["lead_id"] >= 1)
    check("haversine distance ≈ 4.4 km", 4.0 < (r["distance_km"] or 0) < 5.0,
          f"got {r['distance_km']}")
    check("keyword+proximity score in 70–85 band", 70 <= r["score"] <= 85,
          f"got {r['score']}")

    # A far, irrelevant intent should score lower
    far = json.loads(json.dumps(payload))
    far["message"]["intent"]["item"]["descriptor"]["name"] = "cement wholesale"
    far["message"]["intent"]["fulfillment"]["end"]["location"]["gps"] = "13.20,77.40"
    r2 = store.save_lead(direction="inbound_demand", payload=far,
                         business_gps="12.9416,77.7400",
                         business_keywords=["physiotherapy", "rehab"])
    check("irrelevant distant lead scores lower", r2["score"] < r["score"],
          f"{r2['score']} !< {r['score']}")

    check("pipeline transition works",
          store.update_lead_status(r["lead_id"], "qualified"))
    top = store.list_leads(min_score=70)
    check("ranked listing filters by score",
          len(top) == 1 and top[0]["status"] == "qualified")


def test_digest():
    print("[5] lead_digest aggregation (growth-agent view)")
    leads = store.list_leads(limit=500)
    by_status = {}
    for l in leads:
        by_status[l["status"]] = by_status.get(l["status"], 0) + 1
    check("digest sees both leads", sum(by_status.values()) == 2, str(by_status))
    check("statuses aggregated", by_status.get("qualified") == 1
          and by_status.get("new") == 1, str(by_status))


if __name__ == "__main__":
    for t in (test_crypto, test_context_and_intent, test_mock_search,
              test_lead_store, test_digest):
        try:
            t()
        except Exception:
            traceback.print_exc()
            FAIL += 1
    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)
