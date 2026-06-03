from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _ip(request: Request) -> str:
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return get_remote_address(request)


def rate_limit_key(request: Request) -> str:
    return _ip(request)


def user_rate_limit_key(request: Request) -> str:
    # Authed endpoints have request.state.user set by user_validation.
    # Fall back to IP so anon routes still get a key (acts as a no-op next to the IP limiter).
    user = getattr(request.state, "user", None)
    user_id = getattr(user, "user_id", None) if user else None
    if user_id:
        return f"user:{user_id}"
    return f"ip:{_ip(request)}"


limiter = Limiter(key_func=rate_limit_key)
user_limiter = Limiter(key_func=user_rate_limit_key)
