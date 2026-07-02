"""
Webhook receiver — the BPP-facing surface where leads actually arrive.

The ONDC gateway multicasts every buyer /search scoped to your city/GPS to
all registered seller apps in that domain. Each one is a live demand signal.
We ACK, persist it as a lead, and (optionally) reply with an /on_search
catalog so the buyer sees the business.

Also implements /on_subscribe (registry challenge during onboarding) and
/on_search (BAP-side results when we discover suppliers/partners).
"""

import base64
import json
import os

from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PublicKey
from cryptography.hazmat.primitives.serialization import load_der_private_key
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from fastapi import FastAPI, Request

from src.leads.store import save_lead

app = FastAPI(title="KaushalStack ONDC Lead Webhook")

BUSINESS_GPS = os.getenv("BUSINESS_GPS", "12.9416,77.7400")  # Panathur default
BUSINESS_KEYWORDS = [k.strip() for k in
                     os.getenv("BUSINESS_KEYWORDS", "physiotherapy,rehab").split(",")]

ACK = {"message": {"ack": {"status": "ACK"}}}


@app.post("/search")
async def inbound_search(request: Request):
    """Gateway-multicast buyer intent → capture as a lead."""
    payload = await request.json()
    # In production: verify the gateway's signature via registry /lookup
    # of the sender's signing_public_key (see beckn.crypto.verify).
    result = save_lead(direction="inbound_demand", payload=payload,
                       business_gps=BUSINESS_GPS, business_keywords=BUSINESS_KEYWORDS)
    # A full BPP would now asynchronously POST /on_search (catalog) to the
    # bap_uri in payload["context"]. Hook your catalog builder here.
    print(f"[LEAD] captured: {result}")
    return ACK


@app.post("/on_search")
async def on_search(request: Request):
    """BAP-side: async catalog results from sellers we discovered."""
    payload = await request.json()
    save_lead(direction="outbound_discovery", payload=payload,
              business_gps=BUSINESS_GPS, business_keywords=BUSINESS_KEYWORDS)
    return ACK


@app.post("/on_subscribe")
async def on_subscribe(request: Request):
    """Registry onboarding challenge: decrypt AES key derived from
    X25519(your enc private key, ONDC public key), return the answer."""
    body = await request.json()
    challenge_b64 = body.get("challenge", "")
    enc_priv_b64 = os.getenv("ONDC_ENC_PRIVATE_KEY", "")
    ondc_pub_b64 = os.getenv("ONDC_PUBLIC_KEY", "")
    if not (enc_priv_b64 and ondc_pub_b64):
        return {"answer": "", "error": "encryption keys not configured"}

    private_key = load_der_private_key(base64.b64decode(enc_priv_b64), password=None)
    public_key = X25519PublicKey.from_public_bytes(
        base64.b64decode(ondc_pub_b64)[-32:])
    shared = private_key.exchange(public_key)
    decryptor = Cipher(algorithms.AES(shared), modes.ECB()).decryptor()
    padded = decryptor.update(base64.b64decode(challenge_b64)) + decryptor.finalize()
    answer = padded[:-padded[-1]] if padded else b""  # strip PKCS7 padding
    return {"answer": answer.decode()}


@app.get("/health")
async def health():
    return {"status": "ok", "gps": BUSINESS_GPS, "keywords": BUSINESS_KEYWORDS}
