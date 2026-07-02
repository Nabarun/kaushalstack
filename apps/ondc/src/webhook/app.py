"""
Webhook receiver — BAP callback surface for the ONDC network.

Handles:
  - Inbound buyer /search intents (BPP-side lead capture)
  - BAP-side async callbacks: on_search, on_select, on_init, on_confirm,
    on_status, on_track, on_cancel, on_support
  - IGM callbacks: on_issue, on_issue_status
  - RSF callback: on_settlement
  - Registry onboarding challenge: on_subscribe
"""

import base64
import json
import os

from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey, X25519PublicKey)
from cryptography.hazmat.primitives.serialization import load_der_private_key
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from fastapi import FastAPI, Request

from src.leads.store import save_lead

app = FastAPI(title="KaushalStack ONDC Lead Webhook")

BUSINESS_GPS = os.getenv("BUSINESS_GPS", "12.9416,77.7400")
BUSINESS_KEYWORDS = [k.strip() for k in
                     os.getenv("BUSINESS_KEYWORDS", "physiotherapy,rehab").split(",")]

ACK = {"message": {"ack": {"status": "ACK"}}}

# ── BPP-side: inbound demand ──────────────────────────────────────────────────

@app.post("/search")
async def inbound_search(request: Request):
    """Gateway-multicast buyer intent → capture as a lead."""
    payload = await request.json()
    result = save_lead(direction="inbound_demand", payload=payload,
                       business_gps=BUSINESS_GPS, business_keywords=BUSINESS_KEYWORDS)
    print(f"[LEAD] inbound: {result}")
    return ACK


# ── BAP-side: discovery callbacks ─────────────────────────────────────────────

@app.post("/on_search")
async def on_search(request: Request):
    """Async catalog results from sellers discovered via /search."""
    payload = await request.json()
    save_lead(direction="outbound_discovery", payload=payload,
              business_gps=BUSINESS_GPS, business_keywords=BUSINESS_KEYWORDS)
    return ACK


# ── BAP-side: order flow callbacks ───────────────────────────────────────────

@app.post("/on_select")
async def on_select(request: Request):
    """BPP responds to /select with quote and availability."""
    payload = await request.json()
    _log("on_select", payload)
    return ACK


@app.post("/on_init")
async def on_init(request: Request):
    """BPP responds to /init with draft order and payment terms."""
    payload = await request.json()
    _log("on_init", payload)
    return ACK


@app.post("/on_confirm")
async def on_confirm(request: Request):
    """BPP responds to /confirm with confirmed order details."""
    payload = await request.json()
    _log("on_confirm", payload)
    return ACK


@app.post("/on_status")
async def on_status(request: Request):
    """BPP responds to /status with current order state."""
    payload = await request.json()
    _log("on_status", payload)
    return ACK


@app.post("/on_track")
async def on_track(request: Request):
    """BPP responds to /track with tracking URL or real-time location."""
    payload = await request.json()
    _log("on_track", payload)
    return ACK


@app.post("/on_cancel")
async def on_cancel(request: Request):
    """BPP responds to /cancel with cancellation confirmation."""
    payload = await request.json()
    _log("on_cancel", payload)
    return ACK


@app.post("/on_support")
async def on_support(request: Request):
    """BPP responds to /support with contact details."""
    payload = await request.json()
    _log("on_support", payload)
    return ACK


# ── IGM callbacks ─────────────────────────────────────────────────────────────

@app.post("/on_issue")
async def on_issue(request: Request):
    """IGM: BPP responds to a raised issue."""
    payload = await request.json()
    _log("on_issue", payload)
    return ACK


@app.post("/on_issue_status")
async def on_issue_status(request: Request):
    """IGM: BPP sends updated issue status."""
    payload = await request.json()
    _log("on_issue_status", payload)
    return ACK


# ── RSF callback ──────────────────────────────────────────────────────────────

@app.post("/on_settlement")
async def on_settlement(request: Request):
    """RSF: settlement details from the network."""
    payload = await request.json()
    _log("on_settlement", payload)
    return ACK


# ── Registry onboarding ───────────────────────────────────────────────────────

@app.post("/on_subscribe")
async def on_subscribe(request: Request):
    """Registry challenge: decrypt with X25519(enc_private, ondc_public) → AES-ECB."""
    body = await request.json()
    challenge_b64 = body.get("challenge", "")
    enc_priv_b64 = os.getenv("ONDC_ENC_PRIVATE_KEY", "")
    ondc_pub_b64 = os.getenv("ONDC_PUBLIC_KEY", "")
    if not (enc_priv_b64 and ondc_pub_b64):
        return {"answer": "", "error": "encryption keys not configured"}

    raw = base64.b64decode(enc_priv_b64)
    if len(raw) == 32:
        private_key = X25519PrivateKey.from_private_bytes(raw)
    else:
        private_key = load_der_private_key(raw, password=None)

    public_key = X25519PublicKey.from_public_bytes(
        base64.b64decode(ondc_pub_b64)[-32:])
    shared = private_key.exchange(public_key)
    decryptor = Cipher(algorithms.AES(shared), modes.ECB()).decryptor()
    padded = decryptor.update(base64.b64decode(challenge_b64)) + decryptor.finalize()
    answer = padded[:-padded[-1]] if padded else b""
    return {"answer": answer.decode()}


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "gps": BUSINESS_GPS, "keywords": BUSINESS_KEYWORDS}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _log(action: str, payload: dict):
    txn = payload.get("context", {}).get("transaction_id", "?")
    print(f"[{action.upper()}] txn={txn}")
