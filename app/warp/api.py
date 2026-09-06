"""Low-level Cloudflare Warp API client (sync and async).

fingerprint looks like a legitimate client; Cloudflare rejects requests
from generic Python TLS stacks with 403 (error 1020).
"""

from __future__ import annotations

import json
from typing import Any

try:
    from curl_cffi import requests as _curl_requests
except ImportError as exc:  # pragma: no cover
    raise ImportError("warp requires curl_cffi: pip install curl_cffi") from exc

from .exceptions import ApiError

API_URL = "https://api.cloudflareclient.com"
API_VERSION = "v0a1922"

DEFAULT_HEADERS = {
    "User-Agent": "okhttp/3.12.1",
    "CF-Client-Version": "a-6.3-1922",
    "Content-Type": "application/json",
}

# Cloudflare's peer public key — the remote end of the Warp tunnel.
WARP_PEER_PUBLIC_KEY = "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo="

TRACE_URL = "https://cloudflare.com/cdn-cgi/trace"


def _parse_error_response(status_code: int, body: str) -> ApiError:
    code: int | None = None
    errors: list | None = None
    try:
        data = json.loads(body)
        if isinstance(data, dict):
            code = data.get("code")
            errors = data.get("errors")
    except (ValueError, TypeError):
        pass
    msg = f"Cloudflare API error (HTTP {status_code})"
    if code is not None:
        msg += f", code {code}"
    if errors:
        msg += f": {errors}"
    return ApiError(msg, status_code=status_code, code=code, errors=errors)


class ApiBase:
    """Shared request logic; subclasses provide sync or async transport."""

    api_url = API_URL

    def __init__(self, impersonate: str = "chrome131", timeout: float = 15.0):
        self._impersonate = impersonate
        self._timeout = timeout

    @staticmethod
    def _build_request(
        method: str,
        path: str,
        token: str | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Build kwargs for a curl_cffi request."""
        headers = dict(DEFAULT_HEADERS)
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return {
            "method": method,
            "url": f"{API_URL}/{API_VERSION}{path}",
            "headers": headers,
            "json": json_body,
            "timeout": None,  # filled in by subclass
        }

    def _check(self, status_code: int, body: str) -> dict[str, Any] | list | None:
        if status_code >= 400:
            raise _parse_error_response(status_code, body)
        if not body:
            return None
        try:
            return json.loads(body)
        except ValueError:
            return None


class Api(ApiBase):
    """Synchronous Cloudflare Warp API."""

    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)
        self._session = _curl_requests.Session(impersonate=self._impersonate)

    def request(
        self,
        method: str,
        path: str,
        token: str | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any] | list | None:
        kwargs = self._build_request(method, path, token, json_body)
        kwargs["timeout"] = self._timeout
        response = self._session.request(**kwargs)
        return self._check(response.status_code, response.text)

    def trace(self) -> dict[str, str]:
        """Fetch Warp/trace info (``warp=on/off``, IP, colo, ...)."""
        response = self._session.get(TRACE_URL, timeout=self._timeout)
        if response.status_code >= 400:
            raise ApiError("trace request failed", status_code=response.status_code)
        result: dict[str, str] = {}
        for line in response.text.splitlines():
            if "=" in line:
                key, _, value = line.partition("=")
                result[key.strip()] = value.strip()
        return result

    def close(self) -> None:
        self._session.close()


class AsyncApi(ApiBase):
    """Asynchronous Cloudflare Warp API (mirrors :class:`Api`)."""

    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)
        self._session = _curl_requests.AsyncSession(impersonate=self._impersonate)

    async def request(
        self,
        method: str,
        path: str,
        token: str | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any] | list | None:
        kwargs = self._build_request(method, path, token, json_body)
        kwargs["timeout"] = self._timeout
        response = await self._session.request(**kwargs)
        return self._check(response.status_code, response.text)

    async def trace(self) -> dict[str, str]:
        response = await self._session.get(TRACE_URL, timeout=self._timeout)
        if response.status_code >= 400:
            raise ApiError("trace request failed", status_code=response.status_code)
        result: dict[str, str] = {}
        for line in response.text.splitlines():
            if "=" in line:
                key, _, value = line.partition("=")
                result[key.strip()] = value.strip()
        return result

    async def close(self) -> None:
        await self._session.close()
