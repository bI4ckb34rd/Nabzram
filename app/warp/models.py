"""Data models for warp.

All models are plain dataclasses with ``to_dict``/``from_dict`` so they can be
persisted easily (e.g. in TinyDB, JSON files, or warp-compatible TOML).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

__all__ = ["Account", "BoundDevice", "SourceDevice", "Profile"]


@dataclass
class Account:
    """A Cloudflare Warp account, bundled with the credentials needed to use it."""

    device_id: str
    access_token: str
    private_key: str  # base64 WireGuard private key
    license_key: str = ""
    account_type: str = "free"  # "free" or "plus"
    warped: bool | None = None
    warp_plus: bool | None = None
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def from_register(cls, response: dict[str, Any], private_key: str) -> "Account":
        account = response.get("account") or {}
        return cls(
            device_id=response["id"],
            access_token=response["token"],
            private_key=private_key,
            license_key=account.get("license", ""),
            account_type=account.get("account_type", "free"),
            raw=dict(response),
        )

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Account":
        """Restore from :meth:`to_dict` output (or a warp-account.toml dict)."""
        return cls(
            device_id=data["device_id"],
            access_token=data["access_token"],
            private_key=data["private_key"],
            license_key=data.get("license_key", ""),
            account_type=data.get("account_type", "free"),
            warped=data.get("warped"),
            warp_plus=data.get("warp_plus"),
            raw=data.get("raw") or {},
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize; also usable as a ``warp-account.toml``-compatible dict."""
        return {
            "device_id": self.device_id,
            "access_token": self.access_token,
            "private_key": self.private_key,
            "license_key": self.license_key,
            "account_type": self.account_type,
            "warped": self.warped,
            "warp_plus": self.warp_plus,
            "raw": self.raw,
        }


@dataclass
class SourceDevice:
    """The device owning the account (contains the WireGuard config)."""

    id: str
    name: str = ""
    model: str = ""
    config: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SourceDevice":
        return cls(
            id=data["id"],
            name=data.get("name", ""),
            model=data.get("model", ""),
            config=data.get("config") or {},
            raw=dict(data),
        )

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "model": self.model, "config": self.config, "raw": self.raw}


@dataclass
class BoundDevice:
    """A device bound to the account."""

    id: str
    name: str = ""
    type: str = ""
    model: str = ""
    active: bool = True
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BoundDevice":
        return cls(
            id=data["id"],
            name=data.get("name", ""),
            type=data.get("type", ""),
            model=data.get("model", ""),
            active=data.get("active", True),
            raw=dict(data),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "model": self.model,
            "active": self.active,
            "raw": self.raw,
        }


@dataclass
class Profile:
    """A ready-to-use WireGuard profile for a Warp account."""

    private_key: str
    address_v4: str  # e.g. "172.16.0.2"
    address_v6: str  # e.g. "2606:4700:110:8d0b:..."
    peer_public_key: str
    endpoint: str  # e.g. "engage.cloudflareclient.com:2408"
    dns: tuple[str, ...] = ("1.1.1.1", "1.0.0.1", "2606:4700:4700::1111", "2606:4700:4700::1001")
    mtu: int = 1280
    allowed_ips: tuple[str, ...] = ("0.0.0.0/0", "::/0")

    def to_conf(self) -> str:
        """Render as a standard WireGuard ``.conf`` string (like ``warp generate``)."""
        return (
            "[Interface]\n"
            f"PrivateKey = {self.private_key}\n"
            f"Address = {self.address_v4}/32, {self.address_v6}/128\n"
            f"DNS = {', '.join(self.dns)}\n"
            f"MTU = {self.mtu}\n"
            "\n"
            "[Peer]\n"
            f"PublicKey = {self.peer_public_key}\n"
            f"AllowedIPs = {', '.join(self.allowed_ips)}\n"
            f"Endpoint = {self.endpoint}\n"
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "private_key": self.private_key,
            "address_v4": self.address_v4,
            "address_v6": self.address_v6,
            "peer_public_key": self.peer_public_key,
            "endpoint": self.endpoint,
            "dns": list(self.dns),
            "mtu": self.mtu,
            "allowed_ips": list(self.allowed_ips),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Profile":
        return cls(
            private_key=data["private_key"],
            address_v4=data["address_v4"],
            address_v6=data["address_v6"],
            peer_public_key=data["peer_public_key"],
            endpoint=data["endpoint"],
            dns=tuple(data.get("dns", ())),
            mtu=data.get("mtu", 1280),
            allowed_ips=tuple(data.get("allowed_ips", ("0.0.0.0/0", "::/0"))),
        )
