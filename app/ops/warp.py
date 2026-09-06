"""WARP operations and management service."""

import logging
from typing import Any

from app.database import db
from app.ops.utils import clear_socks_system_proxy, error_reply
from app.services.process_service import process_manager
from app.warp import Account, Profile, WarpClient
from app.warp.exceptions import WarpError

logger = logging.getLogger(__name__)


def _restart_server_if_running() -> None:
    """Restart current server if running so config changes take effect."""
    from app.ops import servers

    try:
        if process_manager.current_server_id and process_manager.is_server_running(
            process_manager.current_server_id,
        ):
            server_info = process_manager.running_processes.get(
                process_manager.current_server_id,
            )
            if server_info:
                subscription_id = str(server_info.subscription_id)
                server_id = str(server_info.server_id)
                clear_socks_system_proxy()
                process_manager.stop_server(server_info.server_id)
                start_result = servers.start_server(subscription_id, server_id)
                if start_result.get("success"):
                    logger.info("Server restarted after WARP state update")
                else:
                    logger.warning(
                        f"Server restart after WARP update failed: {start_result.get('message')}",
                    )
    except Exception as e:
        logger.exception(f"Failed to restart server after WARP update: {e}")


def get_warp_status() -> dict[str, Any]:
    """Get WARP configuration and registration state."""
    settings = db.get_settings()
    account_dict = getattr(settings, "warp_account", None)
    profile_dict = getattr(settings, "warp_profile", None)
    warp_enabled = getattr(settings, "warp_enabled", False)

    return {
        "success": True,
        "enabled": bool(warp_enabled),
        "has_account": bool(account_dict),
        "has_profile": bool(profile_dict),
        "account": account_dict,
        "profile": profile_dict,
    }


def enable_warp() -> dict[str, Any]:
    """Ensure account and profile exist (register/generate if needed), then enable WARP."""
    settings = db.get_settings()
    account_dict = getattr(settings, "warp_account", None)
    profile_dict = getattr(settings, "warp_profile", None)

    account: Account | None = None
    if account_dict:
        try:
            account = Account.from_dict(account_dict)
        except Exception as e:
            logger.warning(f"Failed to restore WARP account from saved dict: {e}")
            account = None

    profile: Profile | None = None
    if profile_dict:
        try:
            profile = Profile.from_dict(profile_dict)
        except Exception as e:
            logger.warning(f"Failed to restore WARP profile from saved dict: {e}")
            profile = None

    client = WarpClient()
    try:
        # Register new account if missing
        if account is None:
            logger.info("Registering new WARP account...")
            account = client.register(accept_tos=True)
            account_dict = account.to_dict()
            settings = settings.model_copy(update={"warp_account": account_dict})
            db.update_settings(settings)
            logger.info("WARP account registered and saved")

        # Generate profile if missing
        if profile is None:
            logger.info("Generating WARP profile...")
            profile = client.generate_profile(account)
            profile_dict = profile.to_dict()
            settings = settings.model_copy(update={"warp_profile": profile_dict})
            db.update_settings(settings)
            logger.info("WARP profile generated and saved")

        settings = settings.model_copy(
            update={
                "warp_enabled": True,
                "warp_account": account_dict,
                "warp_profile": profile_dict,
            }
        )
        db.update_settings(settings)
        _restart_server_if_running()

        return {
            "success": True,
            "message": "WARP enabled successfully",
            "enabled": True,
            "has_account": True,
            "has_profile": True,
            "account": account_dict,
            "profile": profile_dict,
        }
    except WarpError as e:
        logger.error(f"WARP operation error: {e}")
        return error_reply(f"WARP error: {e!s}")
    except Exception as e:
        logger.exception(f"Unexpected error enabling WARP: {e}")
        return error_reply(f"Failed to enable WARP: {e!s}")
    finally:
        client.close()


def disable_warp() -> dict[str, Any]:
    """Disable WARP without deleting saved credentials or profile."""
    settings = db.get_settings()
    settings = settings.model_copy(update={"warp_enabled": False})
    db.update_settings(settings)
    _restart_server_if_running()

    return {
        "success": True,
        "message": "WARP disabled",
        "enabled": False,
        "has_account": bool(getattr(settings, "warp_account", None)),
        "has_profile": bool(getattr(settings, "warp_profile", None)),
        "account": getattr(settings, "warp_account", None),
        "profile": getattr(settings, "warp_profile", None),
    }


def generate_warp_profile() -> dict[str, Any]:
    """Regenerate WireGuard profile using existing WARP account (or new account if none)."""
    settings = db.get_settings()
    account_dict = getattr(settings, "warp_account", None)

    client = WarpClient()
    try:
        if not account_dict:
            logger.info("No WARP account found, registering new account first...")
            account = client.register(accept_tos=True)
            account_dict = account.to_dict()
            settings = settings.model_copy(update={"warp_account": account_dict})
            db.update_settings(settings)
        else:
            account = Account.from_dict(account_dict)

        logger.info("Generating WARP profile from Cloudflare...")
        profile = client.generate_profile(account)
        profile_dict = profile.to_dict()

        settings = settings.model_copy(update={"warp_profile": profile_dict})
        db.update_settings(settings)

        if getattr(settings, "warp_enabled", False):
            _restart_server_if_running()

        return {
            "success": True,
            "message": "WARP profile generated successfully",
            "enabled": bool(getattr(settings, "warp_enabled", False)),
            "has_account": True,
            "has_profile": True,
            "account": account_dict,
            "profile": profile_dict,
        }
    except WarpError as e:
        logger.error(f"WARP error generating profile: {e}")
        return error_reply(f"WARP profile error: {e!s}")
    except Exception as e:
        logger.exception(f"Unexpected error generating WARP profile: {e}")
        return error_reply(f"Failed to generate WARP profile: {e!s}")
    finally:
        client.close()


def unregister_warp() -> dict[str, Any]:
    """Delete WARP credentials and profile completely, disabling WARP and resetting routing."""
    settings = db.get_settings()
    settings = settings.model_copy(
        update={
            "warp_enabled": False,
            "warp_route_all": False,
            "warp_account": None,
            "warp_profile": None,
        }
    )
    db.update_settings(settings)
    _restart_server_if_running()

    return {
        "success": True,
        "message": "WARP unregistered and credentials removed",
        "enabled": False,
        "has_account": False,
        "has_profile": False,
        "account": None,
        "profile": None,
    }
