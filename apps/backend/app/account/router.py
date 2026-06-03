# third party imports
from fastapi import APIRouter, Depends, HTTPException, Request

# annex imports
from app.logging.logs import log_unhandled_exception
from app.rate_limiter import limiter, user_limiter
from app.config import IS_DEV
from app.auth.depends import user_validation
from app.auth.depends import user_validation as dev_user_validation
from app.account.models import UpdateEmailRequest, UpdatePasswordRequest
from app.account.service import update_email, update_password

# Currently, dev user and user are the same, but this allows for future differences
router_dependencies = [Depends(dev_user_validation)] if IS_DEV else [
    Depends(user_validation)]

account_router = APIRouter(
    prefix="/account",
    tags=["Account"],
    dependencies=router_dependencies,
    responses={404: {"description": "Not found"}},
)


@account_router.put(
    "/email",
    summary="Update the authenticated user's email address.",
    tags=["Account"],
)
@limiter.limit("100/hour;10/minute")
@user_limiter.limit("100/hour;10/minute")
def update_email_endpoint(request: Request, body: UpdateEmailRequest):
    try:
        return update_email(
            user_id=request.state.user.user_id,
            new_email=body.new_email,
            pin=body.pin,
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="account",
            endpoint="/email",
            extra={"rate_limit.bucket": "100/hour;10/minute"},
        )
        request.state.exception_logged = True
        raise HTTPException(status_code=500, detail="Internal server error")


@account_router.put(
    "/password",
    summary="Update the authenticated user's password.",
    tags=["Account"],
)
@limiter.limit("100/hour;5/minute")
@user_limiter.limit("100/hour;5/minute")
def update_password_endpoint(request: Request, body: UpdatePasswordRequest):
    try:
        return update_password(
            user_id=request.state.user.user_id,
            new_password=body.new_password,
            pin=body.pin,
        )

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="account",
            endpoint="/password",
            extra={"rate_limit.bucket": "100/hour;5/minute"},
        )
        request.state.exception_logged = True
        raise HTTPException(
            status_code=500,
            detail="Something went wrong updating your password. Please try again.",
        )
