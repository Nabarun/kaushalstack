"""
Beckn context + BAP-side client.

The `context` envelope travels with every Beckn message. City codes use the
STD-code convention (Bengaluru = std:080). Domains follow ONDC taxonomy,
e.g. ONDC:RET10 (grocery), ONDC:RET13 (BPC), ONDC:SRV11 (services),
ONDC:TRV10 (mobility) — pick per business vertical.
"""

import json
import os
import uuid
from datetime import datetime, timezone

from .crypto import build_auth_header

GATEWAY_URLS = {
    "staging": "https://staging.gateway.proteantech.in",  # example staging BG
    "preprod": "https://preprod.gateway.ondc.org",
    "prod": "https://prod.gateway.ondc.org",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def build_context(action: str, *, domain: str, city: str, bap_id: str, bap_uri: str,
                  transaction_id: str | None = None, country: str = "IND") -> dict:
    return {
        "domain": domain,
        "action": action,
        "country": country,
        "city": city,                      # e.g. "std:080" for Bengaluru
        "core_version": "1.2.0",
        "bap_id": bap_id,
        "bap_uri": bap_uri,
        "transaction_id": transaction_id or str(uuid.uuid4()),
        "message_id": str(uuid.uuid4()),
        "timestamp": now_iso(),
        "ttl": "PT30S",
    }


def build_search_intent(*, query: str | None = None, category: str | None = None,
                        gps: str | None = None, radius_km: float = 5.0) -> dict:
    """Location-aware discovery intent. gps = 'lat,lng'."""
    intent: dict = {}
    if query:
        intent["item"] = {"descriptor": {"name": query}}
    if category:
        intent["category"] = {"id": category}
    if gps:
        intent["fulfillment"] = {
            "type": "Delivery",
            "end": {"location": {"gps": gps, "radius": {"unit": "km", "value": str(radius_km)}}},
        }
    intent["payment"] = {"@ondc/org/buyer_app_finder_fee_type": "percent",
                         "@ondc/org/buyer_app_finder_fee_amount": "3"}
    return {"intent": intent}


class BecknClient:
    """BAP-side client: signs and fires /search at the ONDC gateway.
    Responses arrive asynchronously at your /on_search callback URL."""

    def __init__(self):
        self.env = os.getenv("ONDC_ENV", "staging")
        self.subscriber_id = os.getenv("ONDC_SUBSCRIBER_ID", "")
        self.subscriber_uri = os.getenv("ONDC_SUBSCRIBER_URI", "")
        self.unique_key_id = os.getenv("ONDC_UNIQUE_KEY_ID", "")
        self.signing_private_key = os.getenv("ONDC_SIGNING_PRIVATE_KEY", "")
        self.mock = os.getenv("ONDC_MOCK", "true").lower() == "true"

    async def search(self, *, domain: str, city: str, query: str | None = None,
                     category: str | None = None, gps: str | None = None,
                     radius_km: float = 5.0) -> dict:
        context = build_context("search", domain=domain, city=city,
                                bap_id=self.subscriber_id, bap_uri=self.subscriber_uri)
        payload = {"context": context, "message": build_search_intent(
            query=query, category=category, gps=gps, radius_km=radius_km)}

        if self.mock:
            return {"mode": "mock", "sent": payload,
                    "note": "ONDC_MOCK=true — no network call. Register on the "
                            "staging registry and set credentials to go live."}

        body = json.dumps(payload)
        auth = build_auth_header(body, self.subscriber_id,
                                 self.unique_key_id, self.signing_private_key)
        import httpx  # lazy: only needed for live network calls
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{GATEWAY_URLS[self.env]}/search",
                                     content=body,
                                     headers={"Authorization": auth,
                                              "Content-Type": "application/json"})
        return {"mode": "live", "status_code": resp.status_code,
                "ack": resp.json(), "transaction_id": context["transaction_id"]}
