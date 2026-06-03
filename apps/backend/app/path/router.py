# third party imports
from app.path.service import add_protected_path, remove_protected_path
from app.logging.logs import log_unhandled_exception
from app.path.models import PathItem
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List

# annex imports
from app.logging.logs import log_unhandled_exception
from app.rate_limiter import limiter, user_limiter
from app.config import IS_DEV
from app.auth.depends import user_validation
from app.auth.depends import user_validation as dev_user_validation
from app.path.models import PathItem, PathName

# Currently, dev user and user are the same, but this allows for future differences
router_dependencies = [Depends(dev_user_validation)] if IS_DEV else [
    Depends(user_validation)]

path_router = APIRouter(
    prefix="/paths",
    tags=["Path"],
    dependencies=router_dependencies,
    responses={404: {"description": "Not found"}},
)


@path_router.post(
    "/add",
    summary="Add paths of folders and files to database of user",
    tags=["Path"],
)
@limiter.limit("500/hour;50/minute")
@user_limiter.limit("500/hour;50/minute")
def path_add(request: Request, items: List[PathItem]):
    try:
        user = request.state.user

        if len(items) == 0:
            raise HTTPException(
                status_code=400,
                detail="Request body must be a non-empty array"
            )

        if len(items) > 250:
            raise HTTPException(
                status_code=400,
                detail="Maximum 250 items per request"
            )
        return add_protected_path(items, user.user_id)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="path",
            endpoint="add",
        )

        request.state.exception_logged = True

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


@path_router.delete(
    "/remove",
    summary="Remove paths of folders and files to database of user",
    tags=["Path"],
)
@limiter.limit("10000/hour;500/minute")
@user_limiter.limit("10000/hour;500/minute")
def path_remove(request: Request, item: PathName):
    try:
        user = request.state.user

        if item == None:
            raise HTTPException(
                status_code=400,
                detail="Request body must be non-empty."
            )

        # Dont ned full object for item, just the path itself
        return remove_protected_path(item.path, user.user_id)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="path",
            endpoint="remove",
        )

        request.state.exception_logged = True

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )
