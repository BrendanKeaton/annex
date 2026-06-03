# third party imports
from fastapi import APIRouter, Depends, HTTPException, Request, Form, UploadFile, File

# annex imports
from app.auth.models import LoginRequest, RefreshSessionRequest, OAuthSessionRequest, AcceptInviteRequest
from app.auth.service import (
    user_login, user_onboarding_stage_increment, refresh_user_session,
    get_user_session_data, check_user_pin, get_onboarding_stage as fetch_onboarding_stage,
    update_organization, set_pin,
    generate_recovery_codes, reset_pin, get_recovery_codes, regenerate_recovery_codes,
    oauth_session, accept_invite,
)
from app.logging.logs import log_unhandled_exception
from app.rate_limiter import limiter, user_limiter
from app.config import IS_DEV
from app.auth.depends import user_validation
from app.auth.depends import user_validation as dev_user_validation
from app.auth.models import PinCheckRequest, PersonalInfoRequest, PinSetRequest, PinResetRequest

# Currently, dev user and user are the same, but this allows for future differences
router_dependencies = [Depends(dev_user_validation)] if IS_DEV else [
    Depends(user_validation)]

auth_router = APIRouter(
    prefix="/auth",
    tags=["Auth"],
    dependencies=router_dependencies,
    responses={404: {"description": "Not found"}},
)

# THIS ROUTER SHOULD ONLY BE USED FOR THOSE ENDPOINTS THAT MAY BE ACCESSED WITHOUT A VALID SESSION
# In this example, /auth/anon/login -> the user does not yet have a JWT, but needs one
auth_anon_router = APIRouter(
    prefix="/auth_anon",
    tags=["Auth"],
    responses={404: {"description": "Not found"}},
)


@auth_anon_router.post("/login",
                       summary="login user and return JWT",
                       tags=["Onboarding"],)
@limiter.limit("120/hour;10/minute")
def user_login_endpoint(request: Request, body: LoginRequest):
    """
    Logs an existing user in and provides a JWT

    We use this becauase Supabase doesn't yet have a true Rust library that is in its ecosystem.
    """
    try:
        return user_login(
            email=body.email,
            password=body.password,
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="anon auth",
            endpoint="/user_login",
            extra={
                "rate_limit.bucket": "600/hour;30/minute",
            },
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_anon_router.post("/oauth/session",
                       summary="Exchange OAuth tokens for a full session",
                       tags=["Auth"],)
@limiter.limit("600/hour;30/minute")
def oauth_session_endpoint(request: Request, body: OAuthSessionRequest):
    """
    Accepts an access_token and refresh_token obtained from a Supabase OAuth
    redirect (e.g., Google sign-in via a Tauri deep link), verifies them, and
    returns the same full session object as /login.
    """
    try:
        return oauth_session(
            access_token=body.access_token,
            refresh_token=body.refresh_token,
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="anon auth",
            endpoint="/oauth/session",
            extra={
                "rate_limit.bucket": "600/hour;30/minute",
            },
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_anon_router.post("/refresh_user_session",
                       summary="Refresh user session using refresh token",
                       tags=["Auth"],)
@limiter.limit("600/hour;30/minute")
def refresh_session_endpoint(request: Request, body: RefreshSessionRequest):
    """
    Refreshes an expired or expiring session using the refresh token.
    Returns the same session object as login with a new access_token.
    """
    try:
        return refresh_user_session(
            refresh_token=body.refresh_token,
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="anon auth",
            endpoint="/refresh_user_session",
            extra={
                "rate_limit.bucket": "600/hour;30/minute",
            },
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_anon_router.post("/accept_invite",
                       summary="Accept org invite, set password, and complete initial setup",
                       tags=["Onboarding"],)
@limiter.limit("100/hour;10/minute")
def accept_invite_endpoint(request: Request, body: AcceptInviteRequest):
    """
    Called after an invited user clicks the magic link email and lands on the frontend.
    Sets their password, links them to the org, and skips org onboarding (stage 2).
    User still needs to set PIN (stage 3) and get recovery codes (stage 4).
    """
    try:
        return accept_invite(
            access_token=body.access_token,
            refresh_token=body.refresh_token,
            new_password=body.new_password,
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="anon auth",
            endpoint="/accept_invite",
            extra={
                "rate_limit.bucket": "100/hour;10/minute",
            },
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_router.get("/refresh_user_session",
                 summary="Get current user session data",
                 tags=["Auth"],)
@limiter.limit("600/hour;30/minute")
@user_limiter.limit("600/hour;30/minute")
def get_session_endpoint(request: Request):
    """
    Re-fetches session data for the authenticated user using their bearer token.
    Returns the same object as login without requiring credentials.
    This should be mostly used for when a user clicks refresh on client.
    """
    try:
        access_token = request.headers.get(
            "authorization", "").replace("Bearer ", "")
        return get_user_session_data(
            user_id=request.state.user.user_id,
            access_token=access_token,
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="auth",
            endpoint="/refresh_user_session",
            extra={
                "rate_limit.bucket": "600/hour;30/minute",
            },
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_router.post("/user_state_increment",
                  summary="Advance user signup stage",
                  description=(
                      "Advances the authenticated user's signup stage by 1."
                  ),
                  tags=["Onboarding"],)
@limiter.limit("500/hour;50/minute")
@user_limiter.limit("500/hour;50/minute")
def user_state_increment(request: Request):
    """
    Increments the user's sign-up stage by 1.

    Rate Limit is "high" because we rate limit by IP,
    and multiple users could be behind the same IP (e.g., LAN roster).
    And we dont want to slow down user onboarding for team houses.
    """
    try:
        return user_onboarding_stage_increment(
            user_id=request.state.user.user_id
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="auth",
            endpoint="user_state_increment",
            extra={
                "user.state_op": "increment",
                "rate_limit.bucket": "500/hour;50/minute",
            },
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_router.post("/pin",
                  summary="Check to ensure that the users pin matches the input",
                  tags=["Auth"],)
# This is intentionally a very short duration, to protect against agents attempting to make the request on their own
@limiter.limit("300/hour;5/minute")
@user_limiter.limit("300/hour;5/minute")
def check_user_pin_endpoint(request: Request, pin_object: PinCheckRequest):
    try:
        return check_user_pin(
            user_id=request.state.user.user_id,
            pin=pin_object.pin
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="auth",
            endpoint="/pin",
            extra={
                "rate_limit.bucket": "300/hour;5/minute",
            },
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_router.get(
    "/onboarding/stage",
    summary="Get current onboarding stage",
    tags=["Onboarding"],
)
@limiter.limit("600/hour;60/minute")
@user_limiter.limit("600/hour;60/minute")
def get_onboarding_stage(request: Request):
    try:
        user_id = request.state.user.user_id
        stage = fetch_onboarding_stage(user_id)
        return {"stage": stage}

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="auth",
            endpoint="/onboarding/stage",
            extra={"rate_limit.bucket": "600/hour;60/minute"},
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_router.post(
    "/onboarding/organization",
    summary="Update organization name, subscription, and optional logo during onboarding",
    tags=["Onboarding"],
)
@limiter.limit("500/hour;50/minute")
@user_limiter.limit("500/hour;50/minute")
def onboarding_organization(
    request: Request,
    name: str = Form(...),
    subscription_code: str = Form(...),
    logo: UploadFile | None = File(None),
):
    try:
        user_id = request.state.user.user_id
        if not user_id:
            raise HTTPException(
                status_code=401, detail="Unable to identify user from token")

        name = name.strip()
        if not name or len(name) < 2:
            raise HTTPException(
                status_code=400,
                detail="Organization name must be at least 2 characters",
            )

        if logo:
            contents = logo.file.read()
            if len(contents) > 5 * 1024 * 1024:
                raise HTTPException(
                    status_code=400, detail="Logo must be under 5MB"
                )
            # Validate actual file bytes rather than trusting Content-Type header
            header = contents[:12]
            is_valid_image = (
                header[:3] == b'\xff\xd8\xff'                          # JPEG
                or header[:8] == b'\x89PNG\r\n\x1a\n'                  # PNG
                or header[:4] == b'GIF8'                               # GIF
                or (header[:4] == b'RIFF' and header[8:12] == b'WEBP') # WebP
            )
            if not is_valid_image:
                raise HTTPException(
                    status_code=400, detail="Logo must be a valid image file (JPEG, PNG, GIF, or WebP)"
                )
            logo.file.seek(0)

        return update_organization(user_id, name, subscription_code, logo)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="auth",
            endpoint="/onboarding/organization",
            extra={"rate_limit.bucket": "500/hour;50/minute"},
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_router.post(
    "/onboarding/pin",
    summary="Set user PIN during onboarding",
    tags=["Onboarding"],
)
@limiter.limit("300/hour;10/minute")
@user_limiter.limit("300/hour;10/minute")
def onboarding_pin(request: Request, body: PinSetRequest):
    try:
        user_id = request.state.user.user_id
        return set_pin(user_id, body.pin, True)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="auth",
            endpoint="/onboarding/pin",
            extra={"rate_limit.bucket": "300/hour;10/minute"},
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_router.post(
    "/onboarding/recovery_codes",
    summary="Generate recovery codes during onboarding",
    tags=["Onboarding"],
)
@limiter.limit("300/hour;5/minute")
@user_limiter.limit("300/hour;5/minute")
def onboarding_recovery_codes(request: Request):
    try:
        user_id = request.state.user.user_id
        return generate_recovery_codes(user_id)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="auth",
            endpoint="/onboarding/recovery-codes",
            extra={"rate_limit.bucket": "300/hour;5/minute"},
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_router.put(
    "/pin",
    summary="Reset user PIN (requires current PIN verification)",
    tags=["Auth"],
)
@limiter.limit("300/hour;5/minute")
@user_limiter.limit("300/hour;5/minute")
def reset_pin_endpoint(request: Request, body: PinResetRequest):
    try:
        return reset_pin(
            user_id=request.state.user.user_id,
            current_pin=body.current_pin,
            new_pin=body.new_pin,
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="auth",
            endpoint="/pin (PUT)",
            extra={"rate_limit.bucket": "300/hour;5/minute"},
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_router.get(
    "/recovery_codes",
    summary="View existing recovery codes",
    tags=["Auth"],
)
@limiter.limit("300/hour;10/minute")
@user_limiter.limit("300/hour;10/minute")
def get_recovery_codes_endpoint(request: Request):
    try:
        return get_recovery_codes(
            user_id=request.state.user.user_id,
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="auth",
            endpoint="/recovery_codes",
            extra={"rate_limit.bucket": "300/hour;10/minute"},
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@auth_router.post(
    "/recovery_codes/regenerate",
    summary="Regenerate recovery codes",
    tags=["Auth"],
)
@limiter.limit("300/hour;5/minute")
@user_limiter.limit("300/hour;5/minute")
def regenerate_recovery_codes_endpoint(request: Request):
    try:
        return regenerate_recovery_codes(
            user_id=request.state.user.user_id,
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="auth",
            endpoint="/recovery_codes/regenerate",
            extra={"rate_limit.bucket": "300/hour;5/minute"},
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")
