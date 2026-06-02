# third party imports
from fastapi import APIRouter, Depends, HTTPException, Request

# annex imports
from app.logging.logs import log_unhandled_exception
from app.rate_limiter import limiter, user_limiter
from app.config import IS_DEV
from app.auth.depends import user_validation
from app.auth.depends import user_validation as dev_user_validation
from app.org.models import InviteRequest
from app.org.service import get_org_info, get_org_members, remove_org_member, invite_org_member

# Currently, dev user and user are the same, but this allows for future differences
router_dependencies = [Depends(dev_user_validation)] if IS_DEV else [
    Depends(user_validation)]

org_router = APIRouter(
    prefix="/org",
    tags=["Org"],
    dependencies=router_dependencies,
    responses={404: {"description": "Not found"}},
)


@org_router.get(
    "/info",
    summary="Get org details for the authenticated user's organization.",
    tags=["Org"],
)
@limiter.limit("300/hour;30/minute")
@user_limiter.limit("300/hour;30/minute")
def org_info(request: Request):
    try:
        user = request.state.user
        return get_org_info(user.user_id)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="org",
            endpoint="info",
        )

        request.state.exception_logged = True

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


@org_router.get(
    "/members",
    summary="Get all members of the authenticated user's org. Admin only.",
    tags=["Org"],
)
@limiter.limit("300/hour;30/minute")
@user_limiter.limit("300/hour;30/minute")
def org_members(request: Request):
    try:
        user = request.state.user
        return get_org_members(user.user_id)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="org",
            endpoint="members",
        )

        request.state.exception_logged = True

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )

#


@org_router.delete(
    "/members/{user_id}",
    summary="Remove a member from the org. Admin only.",
    tags=["Org"],
)
@limiter.limit("100/hour;10/minute")
@user_limiter.limit("100/hour;10/minute")
def remove_member(request: Request, user_id: str):
    try:
        calling_user = request.state.user
        return remove_org_member(calling_user.user_id, user_id)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="org",
            endpoint="members/{user_id}",
        )

        request.state.exception_logged = True

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


@org_router.post(
    "/invite",
    summary="Generate a Supabase invite link for a new org member. Admin only.",
    tags=["Org"],
)
@limiter.limit("100/hour;10/minute")
@user_limiter.limit("100/hour;10/minute")
def invite_member(request: Request, body: InviteRequest):
    try:
        user = request.state.user
        return invite_org_member(user.user_id, body.email)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="org",
            endpoint="invite",
        )

        request.state.exception_logged = True

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )
