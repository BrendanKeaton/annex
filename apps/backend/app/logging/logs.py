# std library
import json
import random

# third party imports
from fastapi import Request
from typing import Any, Mapping, Optional

# annex imports
from app.logging.logging_main import logger
from app.config import LOG_OKAY_REQUESTS_RATE_MIDDLEWARE, IS_DEV
from app.global_utils import utc_now_iso
from app.config import IS_DEV


def log_middleware(request, request_id, status_code, duration_ms):
    """
    TODO, UPDATE TO INCLUDE:
    1. Always keep slow requests. Anything above your p99 latency threshold. (right now we only do > 3s)

    2. Always keep specific users. VIP customers, internal testing accounts, flagged sessions.

    3. Set up file rotater in logger / don't just go straight to console (in config.yaml,
    3.1 example here: https://gist.github.com/kingspp/9451566a5555fb022215ca2b7b802f19)

    MIDDLEWARE BASE LOG.
    VERY BASIC LOGGING TO AVOID CONFIGURING FOR ALL ROUTES INITIALLY
    THIS IS NOT COMPREHENSIVE
    ATTEMPT TO FOLLOW GUIDELINES DISCUSSED AT https://loggingsucks.com/ WHERE POSSIBLE

    Decide whether to log this request:
    - Always log if status != 200
    - Always log in development
    - Otherwise, log a fraction based on LOG_OKAY_REQUESTS_RATE
    """
    if status_code >= 500:
        level = "ERROR"
    elif status_code >= 400:
        level = "WARNING"
    else:
        level = "INFO"

    SAMPLE_RATE = max(
        0.0, min(1.0, LOG_OKAY_REQUESTS_RATE_MIDDLEWARE)
    )  # Max / Min, so that bad config doesn't break
    should_log = (
        status_code != 200
        or IS_DEV
        or random.random() < SAMPLE_RATE
        or duration_ms > 3000
    )

    if not should_log:
        return

    log = {
        "timestamp": utc_now_iso(),
        "level": level,
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status_code": status_code,
        "duration_sec": float(duration_ms / 1000),
        "auth.user_id": getattr(getattr(request.state, "user", None), "user_id", None),
    }

    payload = json.dumps(log, indent=2) if IS_DEV else json.dumps(log)

    if level == "ERROR":
        logger.error(payload)
    elif level == "WARNING":
        logger.warning(payload)
    else:
        logger.info(payload)


def log_unhandled_exception(
    *,
    request: Request,
    exc: Exception,
    endpoint: str,
    router: Optional[str] = None,
    extra: Optional[Mapping[str, Any]] = None,
) -> None:
    """
    TODO, UPDATE TO INCLUDE:
    1. Wider (more jwt claims, subscription levels, organization/VIP users)

    2. switch statement for dev/discord notification for certain endpoints once that is built out

    LOGS UNHANDLED EXCEPTIONS IN COMMON ENDPOINTS
    Params:
        request: FastAPI Request object
        exc: The caught exception
        endpoint: Logical endpoint name (stable identifier)
        router: Optional router name (e.g. 'auth', 'users')
        extra: Optional dict for caller-specific fields
    """

    log_extra: dict[str, Any] = {
        "request_id": getattr(request.state, "request_id", None),
        "http.method": request.method,
        "http.path": request.url.path,
        "http.query": str(request.query_params),
        "http.client": request.client.host if request.client else None,
        "auth.user_id": getattr(getattr(request.state, "user", None), "user_id", None),
        "auth.role": getattr(getattr(request.state, "user", None), "role", None),
        "env.is_dev": IS_DEV,
        "router": router,
        "endpoint": endpoint,
        "error.type": type(exc).__name__,
        "error.message": str(exc),
    }

    # Allow endpoint-specific extension
    if extra:
        log_extra.update(extra)

    payload = json.dumps(
        log_extra, indent=2) if IS_DEV else json.dumps(log_extra)

    logger.error(payload)


def log_info_worker(extra: Optional[Mapping[str, Any]] = None):

    log = {
        "timestamp": utc_now_iso(),
        "level": "INFO",
        "extra": extra or {},
    }

    payload = json.dumps(log, indent=2) if IS_DEV else json.dumps(log)

    logger.info(payload)


def log_error_worker(extra: Optional[Mapping[str, Any]] = None):

    log = {
        "timestamp": utc_now_iso(),
        "level": "ERROR",
        "extra": extra or {},
    }

    payload = json.dumps(log, indent=2) if IS_DEV else json.dumps(log)

    logger.error(payload)


def log_error_api(
    *,
    message: str,
    exc: Optional[Exception],
    path: str,
    status_code: str,
    method: str,
    level: str,
) -> None:

    log = {
        "timestamp": utc_now_iso(),
        "level": level,
        "method": method,
        "path": path,
        "status_code": status_code,
        "exc": str(exc),
        "message": message
    }

    payload = json.dumps(log, indent=2) if IS_DEV else json.dumps(log)

    logger.error(payload)
