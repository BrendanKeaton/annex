# annex imports
from app.config import IS_DEV
from app.logging.logging_main import logger
from app.third_party_clients.supabase import supabase_service_client
from app.rate_limiter import limiter
from app.config import IS_DEV
from app.testing.models import UserInfo
from app.config import DEFAULT_TEST_USER_PASSWORD
from app.config import DEFAULT_TEST_USER_EMAIL

# third party library
from fastapi import Depends
from fastapi import APIRouter, HTTPException, Request

test_router = APIRouter(
    prefix="/testing",
    tags=["Testing"],
    responses={404: {"description": "Not found"}},
)


# Just an endpoint to check connection.
@test_router.put("/health")
@limiter.limit("500/hour;50/minute")
async def health(request: Request):
    return {"status": "ok"}


"""
Endpoint to generate a user jwt. Place this in the "authorization" tab in swagger docs to bypass
Depends() on authenticated only routes.

"""


@test_router.put("/user_create_jwt")
@limiter.limit("500/hour;50/minute")
async def user_create_jwt(request: Request, user_info: UserInfo = Depends(),):
    try:
        if not IS_DEV:
            return {"details:": "testings endpoints only available on development servers."}
        else:
            res = supabase_service_client.auth.sign_in_with_password({
                "email": user_info.email or DEFAULT_TEST_USER_EMAIL,
                "password": user_info.password or DEFAULT_TEST_USER_PASSWORD,
            })

            return (res.session.access_token)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        logger.exception("Unhandled error while generating user JWT")
        raise HTTPException(status_code=500, detail="Internal server error")
