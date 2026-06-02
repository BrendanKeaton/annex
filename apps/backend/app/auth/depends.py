from fastapi import Request, HTTPException, Depends
from app.third_party_clients.supabase import supabase_service_client
from app.logging.logging_main import logger
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends, HTTPException, Request
from app.auth.models import UserClaims

bearer_scheme = HTTPBearer(auto_error=False)


def user_validation(request: Request, credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),):
    """
    FastAPI Depends function to decode Supabase JWT from Authorization header and verify its trusted/real user
    """
    if not credentials:
        raise HTTPException(
            status_code=401, detail="Missing Authorization header")

    token = credentials.credentials

    try:
        claims_response = supabase_service_client.auth.get_claims(jwt=token)
        if not claims_response:
            raise HTTPException(status_code=401, detail="Invalid JWT")

        payload = claims_response["claims"]

        # sub in user_id row is short for subject... in supabase, it's the user ID. We rename to user_id for clarity
        request.state.user = UserClaims(
            user_id=payload["sub"],
            email=payload.get("email"),
            role=payload.get("role", "authenticated"),
            claims=payload,
        )

    except Exception as e:
        logger.warning("JWT verification failed: %s", type(e).__name__)
        raise HTTPException(status_code=401, detail="Invalid or expired JWT")
