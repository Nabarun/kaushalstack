"""
Beckn context + BAP-side client.

Covers the full BAP transaction flow:
  discovery : /search  → /on_search
  ordering  : /select → /on_select → /init → /on_init → /confirm → /on_confirm
  post-order: /status, /track, /cancel, /support
  IGM       : /issue, /issue_status
"""

import json
import os
import uuid
from datetime import datetime, timezone

from .crypto import build_auth_header

GATEWAY_URLS = {
    "staging": "https://staging.gateway.proteantech.in",
    "preprod": "https://preprod.gateway.ondc.org",
    "prod":    "https://prod.gateway.ondc.org",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def build_context(action: str, *, domain: str, city: str, bap_id: str, bap_uri: str,
                  bpp_id: str = "", bpp_uri: str = "",
                  transaction_id: str | None = None, country: str = "IND") -> dict:
    ctx = {
        "domain": domain,
        "action": action,
        "country": country,
        "city": city,
        "core_version": "1.2.0",
        "bap_id": bap_id,
        "bap_uri": bap_uri,
        "transaction_id": transaction_id or str(uuid.uuid4()),
        "message_id": str(uuid.uuid4()),
        "timestamp": now_iso(),
        "ttl": "PT30S",
    }
    if bpp_id:
        ctx["bpp_id"] = bpp_id
    if bpp_uri:
        ctx["bpp_uri"] = bpp_uri
    return ctx


def build_search_intent(*, query: str | None = None, category: str | None = None,
                        gps: str | None = None, radius_km: float = 5.0) -> dict:
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
    """BAP-side client: signs and fires Beckn calls to the ONDC network."""

    def __init__(self):
        self.env = os.getenv("ONDC_ENV", "staging")
        self.subscriber_id = os.getenv("ONDC_SUBSCRIBER_ID", "")
        self.subscriber_uri = os.getenv("ONDC_SUBSCRIBER_URI", "")
        self.unique_key_id = os.getenv("ONDC_UNIQUE_KEY_ID", "")
        self.signing_private_key = os.getenv("ONDC_SIGNING_PRIVATE_KEY", "")
        self._mock_override = None  # set externally in tests; None = read env each call

    # ── Discovery ──────────────────────────────────────────────────────────────

    @property
    def mock(self) -> bool:
        if self._mock_override is not None:
            return self._mock_override
        return os.getenv("ONDC_MOCK", "true").lower() == "true"

    async def search(self, *, domain: str, city: str, query: str | None = None,
                     category: str | None = None, gps: str | None = None,
                     radius_km: float = 5.0) -> dict:
        context = build_context("search", domain=domain, city=city,
                                bap_id=self.subscriber_id, bap_uri=self.subscriber_uri)
        payload = {"context": context,
                   "message": build_search_intent(query=query, category=category,
                                                  gps=gps, radius_km=radius_km)}
        if self.mock:
            return {"mode": "mock", "sent": payload,
                    "note": "ONDC_MOCK=true — no network call. Register on the "
                            "staging registry and set credentials to go live."}
        return await self._post(GATEWAY_URLS[self.env] + "/search", payload)

    # ── Order flow ─────────────────────────────────────────────────────────────

    async def select(self, *, bpp_uri: str, bpp_id: str, domain: str, city: str,
                     transaction_id: str, order: dict) -> dict:
        context = build_context("select", domain=domain, city=city,
                                bap_id=self.subscriber_id, bap_uri=self.subscriber_uri,
                                bpp_id=bpp_id, bpp_uri=bpp_uri,
                                transaction_id=transaction_id)
        return await self._post(bpp_uri + "/select", {"context": context, "message": {"order": order}})

    async def init(self, *, bpp_uri: str, bpp_id: str, domain: str, city: str,
                   transaction_id: str, order: dict) -> dict:
        context = build_context("init", domain=domain, city=city,
                                bap_id=self.subscriber_id, bap_uri=self.subscriber_uri,
                                bpp_id=bpp_id, bpp_uri=bpp_uri,
                                transaction_id=transaction_id)
        return await self._post(bpp_uri + "/init", {"context": context, "message": {"order": order}})

    async def confirm(self, *, bpp_uri: str, bpp_id: str, domain: str, city: str,
                      transaction_id: str, order: dict) -> dict:
        context = build_context("confirm", domain=domain, city=city,
                                bap_id=self.subscriber_id, bap_uri=self.subscriber_uri,
                                bpp_id=bpp_id, bpp_uri=bpp_uri,
                                transaction_id=transaction_id)
        return await self._post(bpp_uri + "/confirm", {"context": context, "message": {"order": order}})

    async def status(self, *, bpp_uri: str, bpp_id: str, domain: str, city: str,
                     transaction_id: str, order_id: str) -> dict:
        context = build_context("status", domain=domain, city=city,
                                bap_id=self.subscriber_id, bap_uri=self.subscriber_uri,
                                bpp_id=bpp_id, bpp_uri=bpp_uri,
                                transaction_id=transaction_id)
        return await self._post(bpp_uri + "/status",
                                {"context": context, "message": {"order_id": order_id}})

    async def track(self, *, bpp_uri: str, bpp_id: str, domain: str, city: str,
                    transaction_id: str, order_id: str) -> dict:
        context = build_context("track", domain=domain, city=city,
                                bap_id=self.subscriber_id, bap_uri=self.subscriber_uri,
                                bpp_id=bpp_id, bpp_uri=bpp_uri,
                                transaction_id=transaction_id)
        return await self._post(bpp_uri + "/track",
                                {"context": context, "message": {"order_id": order_id}})

    async def cancel(self, *, bpp_uri: str, bpp_id: str, domain: str, city: str,
                     transaction_id: str, order_id: str, cancellation_reason_id: str = "001") -> dict:
        context = build_context("cancel", domain=domain, city=city,
                                bap_id=self.subscriber_id, bap_uri=self.subscriber_uri,
                                bpp_id=bpp_id, bpp_uri=bpp_uri,
                                transaction_id=transaction_id)
        return await self._post(bpp_uri + "/cancel",
                                {"context": context,
                                 "message": {"order_id": order_id,
                                             "cancellation_reason_id": cancellation_reason_id}})

    async def support(self, *, bpp_uri: str, bpp_id: str, domain: str, city: str,
                      transaction_id: str, ref_id: str) -> dict:
        context = build_context("support", domain=domain, city=city,
                                bap_id=self.subscriber_id, bap_uri=self.subscriber_uri,
                                bpp_id=bpp_id, bpp_uri=bpp_uri,
                                transaction_id=transaction_id)
        return await self._post(bpp_uri + "/support",
                                {"context": context, "message": {"ref_id": ref_id}})

    # ── IGM ────────────────────────────────────────────────────────────────────

    async def issue(self, *, bpp_uri: str, bpp_id: str, domain: str, city: str,
                    transaction_id: str, issue: dict) -> dict:
        context = build_context("issue", domain=domain, city=city,
                                bap_id=self.subscriber_id, bap_uri=self.subscriber_uri,
                                bpp_id=bpp_id, bpp_uri=bpp_uri,
                                transaction_id=transaction_id)
        return await self._post(bpp_uri + "/issue",
                                {"context": context, "message": {"issue": issue}})

    async def issue_status(self, *, bpp_uri: str, bpp_id: str, domain: str, city: str,
                           transaction_id: str, issue_id: str) -> dict:
        context = build_context("issue_status", domain=domain, city=city,
                                bap_id=self.subscriber_id, bap_uri=self.subscriber_uri,
                                bpp_id=bpp_id, bpp_uri=bpp_uri,
                                transaction_id=transaction_id)
        return await self._post(bpp_uri + "/issue_status",
                                {"context": context, "message": {"issue_id": issue_id}})

    # ── Internal ───────────────────────────────────────────────────────────────

    async def _post(self, url: str, payload: dict) -> dict:
        if self.mock:
            return {"mode": "mock", "url": url, "sent": payload}
        body = json.dumps(payload)
        auth = build_auth_header(body, self.subscriber_id,
                                 self.unique_key_id, self.signing_private_key)
        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, content=body,
                                     headers={"Authorization": auth,
                                              "Content-Type": "application/json"})
        return {"mode": "live", "status_code": resp.status_code,
                "response": resp.json(),
                "transaction_id": payload["context"]["transaction_id"]}
