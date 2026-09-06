"""Exceptions raised by warp."""


class WarpError(Exception):
    """Base exception for all warp errors."""


class ApiError(WarpError):
    """A Cloudflare API request failed.

    Attributes:
        status_code: HTTP status code, if a response was received.
        code: Cloudflare numeric error code (e.g. 1020 for blocked clients), if present.
        errors: Raw ``errors`` list from the API response, if present.
    """

    def __init__(
        self, message: str, status_code: int | None = None, code: int | None = None, errors: list | None = None
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.errors = errors


class TOSNotAcceptedError(WarpError):
    """Raised when Cloudflare's Terms of Service were not accepted."""
