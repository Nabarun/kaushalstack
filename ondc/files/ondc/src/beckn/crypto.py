"""
ONDC / Beckn request signing.

Every request between network participants is signed:
  digest  = BLAKE2b-512 of the raw JSON body  -> base64
  signing_string = "(created): <ts>\n(expires): <ts>\ndigest: BLAKE-512=<digest>"
  signature = Ed25519(signing_string) with your signing_private_key
  Authorization header carries keyId = "{subscriber_id}|{unique_key_id}|ed25519"

Uses only `cryptography` + stdlib (no PyNaCl / pycryptodome needed).
"""

import base64
import hashlib
import time

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey, Ed25519PublicKey)
from cryptography.exceptions import InvalidSignature


def generate_key_pairs() -> dict:
    """Generate the Ed25519 signing key pair (raw, base64) for onboarding."""
    sk = Ed25519PrivateKey.generate()
    from cryptography.hazmat.primitives import serialization as ser
    raw_priv = sk.private_bytes(ser.Encoding.Raw, ser.PrivateFormat.Raw,
                                ser.NoEncryption())
    raw_pub = sk.public_key().public_bytes(ser.Encoding.Raw,
                                           ser.PublicFormat.Raw)
    return {
        "signing_private_key": base64.b64encode(raw_priv).decode(),
        "signing_public_key": base64.b64encode(raw_pub).decode(),
    }


def hash_message(msg: str) -> str:
    digest = hashlib.blake2b(msg.encode(), digest_size=64).digest()
    return base64.b64encode(digest).decode()


def create_signing_string(digest_b64: str, created: int | None = None,
                          expires: int | None = None):
    created = created or int(time.time())
    expires = expires or created + 3600
    return (
        f"(created): {created}\n(expires): {expires}\ndigest: BLAKE-512={digest_b64}",
        created,
        expires,
    )


def sign(signing_string: str, private_key_b64: str) -> str:
    sk = Ed25519PrivateKey.from_private_bytes(base64.b64decode(private_key_b64))
    return base64.b64encode(sk.sign(signing_string.encode())).decode()


def build_auth_header(body: str, subscriber_id: str, unique_key_id: str,
                      private_key_b64: str) -> str:
    digest = hash_message(body)
    signing_string, created, expires = create_signing_string(digest)
    signature = sign(signing_string, private_key_b64)
    return (
        f'Signature keyId="{subscriber_id}|{unique_key_id}|ed25519",'
        f'algorithm="ed25519",created="{created}",expires="{expires}",'
        f'headers="(created) (expires) digest",signature="{signature}"'
    )


def verify(body: str, auth_header: str, public_key_b64: str) -> bool:
    """Verify an incoming request's Authorization header (e.g. gateway /search)."""
    try:
        parts = {}
        for kv in auth_header.replace("Signature ", "").split(","):
            k, _, v = kv.partition("=")
            parts[k.strip()] = v.strip().strip('"')
        digest = hash_message(body)
        signing_string = (
            f"(created): {parts['created']}\n"
            f"(expires): {parts['expires']}\n"
            f"digest: BLAKE-512={digest}"
        )
        vk = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64))
        vk.verify(base64.b64decode(parts["signature"]), signing_string.encode())
        return True
    except (InvalidSignature, KeyError, ValueError):
        return False
