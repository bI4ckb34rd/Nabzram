"""warp — unofficial, lightweight Python library for Cloudflare Warp.

Register Warp accounts, manage license keys and devices, and generate
WireGuard profiles — as a library, without a CLI.
"""

from .client import AsyncWarpClient, WarpClient
from .exceptions import ApiError, TOSNotAcceptedError, WarpError
from .keys import Key
from .models import Account, BoundDevice, Profile, SourceDevice

__version__ = "0.1.0"

__all__ = [
    "AsyncWarpClient",
    "Account",
    "ApiError",
    "BoundDevice",
    "Key",
    "Profile",
    "SourceDevice",
    "TOSNotAcceptedError",
    "WarpClient",
    "WarpError",
]
