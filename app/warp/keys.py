"""WireGuard key generation."""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)

from .exceptions import WarpError

KEY_LENGTH = 32


def _clamp(key: bytearray) -> bytearray:
    """Clamp a Curve25519 private key, as the official clients do."""
    key[0] &= 248
    key[31] = (key[31] & 127) | 64
    return key


class Key:
    """A 32-byte WireGuard key (private, public, or preshared)."""

    __slots__ = ("_bytes",)

    def __init__(self, raw: bytes):
        if len(raw) != KEY_LENGTH:
            raise WarpError(f"key must be {KEY_LENGTH} bytes, got {len(raw)}")
        self._bytes = bytes(raw)

    # -- constructors -------------------------------------------------

    @classmethod
    def generate_private(cls) -> "Key":
        """Generate a new, clamped, random private key."""
        return cls(bytes(_clamp(bytearray(os.urandom(KEY_LENGTH)))))

    @classmethod
    def generate_preshared(cls) -> "Key":
        """Generate a new random preshared key."""
        return cls(os.urandom(KEY_LENGTH))

    @classmethod
    def from_base64(cls, b64: str) -> "Key":
        """Decode a base64-encoded key."""
        try:
            return cls(base64.b64decode(b64, validate=True))
        except Exception as exc:
            raise WarpError(f"invalid base64 key: {exc}") from exc

    # -- conversions ---------------------------------------------------

    @property
    def raw(self) -> bytes:
        return self._bytes

    def public(self) -> "Key":
        """Derive the Curve25519 public key for this private key."""
        priv = X25519PrivateKey.from_private_bytes(self._bytes)
        pub = priv.public_key()
        assert isinstance(pub, X25519PublicKey)
        return Key(pub.public_bytes_raw())

    def __str__(self) -> str:
        return base64.b64encode(self._bytes).decode("ascii")

    def __repr__(self) -> str:
        return f"Key({str(self)!r})"

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Key) and other._bytes == self._bytes

    def __hash__(self) -> int:
        return hash(self._bytes)
