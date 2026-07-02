"""
ONDC Preprod Registration — fires POST /ondc/subscribe to the registry.

Usage:
  python register.py

Before running:
  1. Fill ONDC_PUBLIC_KEY in .env  (ONDC's preprod enc public key, base64 raw X25519)
  2. Fill entity details below (GST, PAN, contact) — required by registry
  3. Make sure https://ondc.kaushalstack.com/bapl/on_subscribe is publicly reachable

After running:
  ONDC registry POSTs a challenge to /bapl/on_subscribe within ~30s.
  The webhook decrypts and responds automatically.
  Check server logs for the on_subscribe hit and 'answer' response.
"""

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone, timedelta

import httpx
from dotenv import load_dotenv

load_dotenv()

REGISTRY_URL = "https://preprod.registry.ondc.org/ondc/subscribe"

# ── Entity details — fill before running ──────────────────────────────────────
ENTITY = {
    "gst": {
        "legal_entity_name": "KaushalStack Technologies",
        "business_address": "Panathur, Bengaluru, Karnataka 560103",
        "city_code": ["std:080"],
        "gst_no": "",                          # fill: 15-char GSTIN
    },
    "pan": {
        "name_as_per_pan": "KaushalStack Technologies",
        "pan_no": "",                          # fill: 10-char PAN
        "date_of_incorporation": "01/01/2024",
    },
    "name_of_authorised_signatory": "Nabarun Sengupta",
    "address_of_authorised_signatory": "Panathur, Bengaluru, Karnataka 560103",
    "email_id": "tech@kaushalstack.com",
    "mobile_no": "",                           # fill: 10-digit mobile
    "country": "IND",
}
# ─────────────────────────────────────────────────────────────────────────────

SUBSCRIBER_ID  = os.getenv("ONDC_SUBSCRIBER_ID",  "ondc.kaushalstack.com")
SUBSCRIBER_URI = os.getenv("ONDC_SUBSCRIBER_URI", "https://ondc.kaushalstack.com/bapl")
UNIQUE_KEY_ID  = os.getenv("ONDC_UNIQUE_KEY_ID",  "")
SIGN_PRIV      = os.getenv("ONDC_SIGNING_PRIVATE_KEY", "")

# Derived public keys (computed from private keys at import time)
import base64
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives import serialization as ser

def _pub(priv_b64: str, cls):
    raw = base64.b64decode(priv_b64)
    sk = cls.from_private_bytes(raw)
    return base64.b64encode(
        sk.public_key().public_bytes(ser.Encoding.Raw, ser.PublicFormat.Raw)
    ).decode()

SIGNING_PUBLIC_KEY    = _pub(os.getenv("ONDC_SIGNING_PRIVATE_KEY", ""), Ed25519PrivateKey)
ENCRYPTION_PUBLIC_KEY = _pub(os.getenv("ONDC_ENC_PRIVATE_KEY", ""),    X25519PrivateKey)

now = datetime.now(timezone.utc)
valid_from  = now.strftime("%Y-%m-%dT%H:%M:%S.000Z")
valid_until = (now + timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def build_payload() -> dict:
    return {
        "context": {
            "operation": {"ops_no": 1}
        },
        "message": {
            "request_id": str(uuid.uuid4()),
            "timestamp": now.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "entity": {
                **ENTITY,
                "subscriber_id":  SUBSCRIBER_ID,
                "unique_key_id":  UNIQUE_KEY_ID,
                "callback_url":   SUBSCRIBER_URI,
                "subscriber_url": SUBSCRIBER_URI,
                "type": "BAP",
                "key_pair": {
                    "signing_public_key":    SIGNING_PUBLIC_KEY,
                    "encryption_public_key": ENCRYPTION_PUBLIC_KEY,
                    "valid_from":  valid_from,
                    "valid_until": valid_until,
                },
            },
            "network_participant": [
                {
                    "subscriber_url": SUBSCRIBER_URI,
                    "domain":         "ONDC:SRV11",
                    "type":           "BAP",
                    "msme":           {},
                    "city_code":      ["std:080"],
                }
            ],
        },
    }


async def register():
    payload = build_payload()
    print("Sending subscribe request to ONDC preprod registry...")
    print(json.dumps(payload, indent=2))
    print()

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            REGISTRY_URL,
            content=json.dumps(payload),
            headers={"Content-Type": "application/json"},
        )

    print(f"Status: {resp.status_code}")
    try:
        print(json.dumps(resp.json(), indent=2))
    except Exception:
        print(resp.text)

    if resp.status_code == 200:
        data = resp.json()
        ack = data.get("message", {}).get("ack", {}).get("status")
        if ack == "ACK":
            print("\nACK received — watch /bapl/on_subscribe in server logs for the challenge.")
        else:
            print("\nNACK — check error details above and fix before retrying.")


if __name__ == "__main__":
    missing = [k for k, v in {
        "ONDC_SIGNING_PRIVATE_KEY": os.getenv("ONDC_SIGNING_PRIVATE_KEY"),
        "ONDC_ENC_PRIVATE_KEY":     os.getenv("ONDC_ENC_PRIVATE_KEY"),
        "ONDC_UNIQUE_KEY_ID":       os.getenv("ONDC_UNIQUE_KEY_ID"),
        "ONDC_SUBSCRIBER_URI":      os.getenv("ONDC_SUBSCRIBER_URI"),
        "ONDC_PUBLIC_KEY":          os.getenv("ONDC_PUBLIC_KEY"),
    }.items() if not v or not v.strip()]
    if missing:
        print(f"ERROR: missing env vars: {', '.join(missing)}")
        print("Fill them in .env and rerun.")
        raise SystemExit(1)

    asyncio.run(register())
