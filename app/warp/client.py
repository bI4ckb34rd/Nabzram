"""High-level warp clients (sync and async).

Example::

    from warp import WarpClient

    client = WarpClient()
    account = client.register()  # new Warp account
    profile = client.generate_profile(account)  # WireGuard Profile
    print(profile.to_conf())

    # later, from saved account dict:
    account = Account.from_dict(saved)
    client.update_license(account, "your-warp+-key")
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .api import WARP_PEER_PUBLIC_KEY, Api, AsyncApi
from .exceptions import TOSNotAcceptedError, WarpError
from .keys import Key
from .models import Account, BoundDevice, Profile, SourceDevice

__all__ = ["WarpClient", "AsyncWarpClient"]


def _interface_config(device: SourceDevice) -> dict[str, Any]:
    config = device.config or {}
    interface = config.get("interface") or {}
    addresses = interface.get("addresses") or {}
    peers = config.get("peers") or []
    v4 = addresses.get("v4")
    v6 = addresses.get("v6")
    if not (v4 and v6 and peers):
        raise WarpError("device config does not contain interface/peer data")
    return {
        "v4": v4,
        "v6": v6,
        "public_key": peers[0].get("public_key", WARP_PEER_PUBLIC_KEY),
        "endpoint": (peers[0].get("endpoint") or {}).get("host", ""),
    }


class _ClientMixin:
    """Shared, transport-agnostic logic. ``self._request`` and ``self._api``
    are provided by the sync/async subclasses."""

    @staticmethod
    def _register_body(private_key: Key, device_model: str, device_name: str | None) -> dict[str, Any]:
        return {
            # Empty on purpose; the real app sends push-install data.
            "fcm_token": "",
            "install_id": "",
            "key": str(private_key.public()),
            "locale": "en_US",
            "model": device_model,
            "tos": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "type": "Android",
        }

    @staticmethod
    def _extract_config_data(device: SourceDevice) -> dict[str, Any]:
        return _interface_config(device)


class WarpClient(_ClientMixin):
    """Synchronous client for the Cloudflare Warp API."""

    def __init__(self, impersonate: str = "chrome131", timeout: float = 15.0):
        self._api = Api(impersonate=impersonate, timeout=timeout)

    # -- low-level -----------------------------------------------------

    def _request(
        self, method: str, path: str, account: Account | None = None, json_body: dict[str, Any] | None = None
    ) -> Any:
        token = account.access_token if account else None
        return self._api.request(method, path, token=token, json_body=json_body)

    # -- API operations --------------------------------------------------

    def register(
        self,
        private_key: str | Key | None = None,
        device_model: str = "PC",
        device_name: str | None = None,
        accept_tos: bool = True,
    ) -> Account:
        """Register a new Cloudflare Warp account and device.

        Args:
            private_key: Base64 WireGuard private key to use; random if omitted.
            device_model: Device model shown in the 1.1.1.1 app.
            device_name: Device name shown in the 1.1.1.1 app (random if omitted).
            accept_tos: Must be True; Cloudflare's Terms of Service apply.
        """
        if not accept_tos:
            raise TOSNotAcceptedError(
                "Cloudflare's Terms of Service must be accepted to register: "
                "https://www.cloudflare.com/application/terms/"
            )
        if private_key is None:
            key = Key.generate_private()
        elif isinstance(private_key, Key):
            key = private_key
        else:
            key = Key.from_base64(private_key)

        response = self._request("POST", "/reg", json_body=self._register_body(key, device_model, device_name))
        account = Account.from_register(response, private_key=str(key))

        if device_name:
            self.rename_device(account, account.device_id, device_name)
        self.get_account(account)  # refresh account_type/quota fields
        return account

    def get_source_device(self, account: Account) -> SourceDevice:
        """Fetch this account's device, including the WireGuard config."""
        data = self._request("GET", f"/reg/{account.device_id}", account=account)
        return SourceDevice.from_dict(data)

    def get_account(self, account: Account) -> Account:
        """Refresh and return the account (type, quota, license...)."""
        data = self._request("GET", f"/reg/{account.device_id}/account", account=account)
        account.account_type = data.get("account_type", account.account_type)
        account.warped = data.get("warped")
        account.warp_plus = data.get("warp_plus")
        if data.get("license"):
            account.license_key = data["license"]
        account.raw.update(data)
        return account

    def update_license(self, account: Account, license_key: str) -> Account:
        """Bind a Warp+ license key to this account and refresh it."""
        data = self._request(
            "PUT", f"/reg/{account.device_id}/account/license", account=account, json_body={"license": license_key}
        )
        if data.get("license"):
            account.license_key = data["license"]
        account.raw.update(data)
        return account

    def get_devices(self, account: Account) -> list[BoundDevice]:
        """List all devices bound to the account."""
        data = self._request("GET", f"/reg/{account.device_id}/account/devices", account=account)
        return [BoundDevice.from_dict(item) for item in data or []]

    def rename_device(self, account: Account, device_id: str, name: str) -> BoundDevice:
        """Rename a bound device (pass ``account.device_id`` to rename this one)."""
        return self._update_device(account, device_id, {"name": name})

    def set_device_active(self, account: Account, device_id: str, active: bool) -> BoundDevice:
        """Enable/disable a bound device."""
        return self._update_device(account, device_id, {"active": active})

    def _update_device(self, account: Account, device_id: str, body: dict[str, Any]) -> BoundDevice:
        data = self._request(
            "PATCH",
            f"/reg/{account.device_id}/account/reg/{device_id}",
            account=account,
            json_body=body,
        )
        for item in data or []:
            if item.get("id") == account.device_id:
                return BoundDevice.from_dict(item)
        raise WarpError(f"device {account.device_id} not found in response")

    def delete_device(self, account: Account, device_id: str) -> None:
        """Unbind a device. Note: the source device cannot be deleted."""
        self._request("DELETE", f"/reg/{account.device_id}/account/reg/{device_id}", account=account)

    def generate_profile(self, account: Account, private_key: str | None = None) -> Profile:
        """Build a WireGuard profile for this account.

        Args:
            account: The account (``get_source_device`` is called to fetch config).
            private_key: Override the private key; defaults to the account's key.
        """
        device = self.get_source_device(account)
        return self.profile_from_device(account, device, private_key)

    def profile_from_device(self, account: Account, device: SourceDevice, private_key: str | None = None) -> Profile:
        """Build a profile from an already-fetched device (offline-friendly)."""
        cfg = self._extract_config_data(device)
        return Profile(
            private_key=private_key or account.private_key,
            address_v4=cfg["v4"],
            address_v6=cfg["v6"],
            peer_public_key=cfg["public_key"],
            endpoint=cfg["endpoint"],
        )

    def trace(self) -> dict[str, str]:
        """Warp trace info (``warp=on/off``, IP, colo...). Useful to verify status."""
        return self._api.trace()

    def close(self) -> None:
        self._api.close()

    def __enter__(self) -> "WarpClient":
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.close()


class AsyncWarpClient(_ClientMixin):
    """Asynchronous client; identical API to :class:`WarpClient` but awaits."""

    def __init__(self, impersonate: str = "chrome131", timeout: float = 15.0):
        self._api = AsyncApi(impersonate=impersonate, timeout=timeout)

    async def _request(
        self, method: str, path: str, account: Account | None = None, json_body: dict[str, Any] | None = None
    ) -> Any:
        token = account.access_token if account else None
        return await self._api.request(method, path, token=token, json_body=json_body)

    async def register(
        self,
        private_key: str | Key | None = None,
        device_model: str = "PC",
        device_name: str | None = None,
        accept_tos: bool = True,
    ) -> Account:
        if not accept_tos:
            raise TOSNotAcceptedError(
                "Cloudflare's Terms of Service must be accepted to register: "
                "https://www.cloudflare.com/application/terms/"
            )
        if private_key is None:
            key = Key.generate_private()
        elif isinstance(private_key, Key):
            key = private_key
        else:
            key = Key.from_base64(private_key)

        response = await self._request("POST", "/reg", json_body=self._register_body(key, device_model, device_name))
        account = Account.from_register(response, private_key=str(key))

        if device_name:
            await self.rename_device(account, account.device_id, device_name)
        await self.get_account(account)
        return account

    async def get_source_device(self, account: Account) -> SourceDevice:
        data = await self._request("GET", f"/reg/{account.device_id}", account=account)
        return SourceDevice.from_dict(data)

    async def get_account(self, account: Account) -> Account:
        data = await self._request("GET", f"/reg/{account.device_id}/account", account=account)
        account.account_type = data.get("account_type", account.account_type)
        account.warped = data.get("warped")
        account.warp_plus = data.get("warp_plus")
        if data.get("license"):
            account.license_key = data["license"]
        account.raw.update(data)
        return account

    async def update_license(self, account: Account, license_key: str) -> Account:
        data = await self._request(
            "PUT", f"/reg/{account.device_id}/account/license", account=account, json_body={"license": license_key}
        )
        if data.get("license"):
            account.license_key = data["license"]
        account.raw.update(data)
        return account

    async def get_devices(self, account: Account) -> list[BoundDevice]:
        data = await self._request("GET", f"/reg/{account.device_id}/account/devices", account=account)
        return [BoundDevice.from_dict(item) for item in data or []]

    async def rename_device(self, account: Account, device_id: str, name: str) -> BoundDevice:
        return await self._update_device(account, device_id, {"name": name})

    async def set_device_active(self, account: Account, device_id: str, active: bool) -> BoundDevice:
        return await self._update_device(account, device_id, {"active": active})

    async def _update_device(self, account: Account, device_id: str, body: dict[str, Any]) -> BoundDevice:
        data = await self._request(
            "PATCH",
            f"/reg/{account.device_id}/account/reg/{device_id}",
            account=account,
            json_body=body,
        )
        for item in data or []:
            if item.get("id") == account.device_id:
                return BoundDevice.from_dict(item)
        raise WarpError(f"device {account.device_id} not found in response")

    async def delete_device(self, account: Account, device_id: str) -> None:
        await self._request("DELETE", f"/reg/{account.device_id}/account/reg/{device_id}", account=account)

    async def generate_profile(self, account: Account, private_key: str | None = None) -> Profile:
        device = await self.get_source_device(account)
        return self.profile_from_device(account, device, private_key)

    def profile_from_device(self, account: Account, device: SourceDevice, private_key: str | None = None) -> Profile:
        cfg = self._extract_config_data(device)
        return Profile(
            private_key=private_key or account.private_key,
            address_v4=cfg["v4"],
            address_v6=cfg["v6"],
            peer_public_key=cfg["public_key"],
            endpoint=cfg["endpoint"],
        )

    async def trace(self) -> dict[str, str]:
        return await self._api.trace()

    async def close(self) -> None:
        await self._api.close()

    async def __aenter__(self) -> "AsyncWarpClient":
        return self

    async def __aexit__(self, *_exc: Any) -> None:
        await self._api.close()
