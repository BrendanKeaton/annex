# third party imports
from fastapi import HTTPException
from supabase_auth.errors import AuthApiError, AuthWeakPasswordError

# annex imports
from app.third_party_clients.supabase import supabase_service_client
from app.auth.service import check_user_pin


def update_email(user_id: str, new_email: str, pin: str) -> dict:
    check_user_pin(user_id, pin)

    supabase_service_client.auth.admin.update_user_by_id(
        user_id,
        {"email": new_email},
    )

    return {"status": True}


def update_password(user_id: str, new_password: str, pin: str) -> dict:
    check_user_pin(user_id, pin)

    try:
        supabase_service_client.auth.admin.update_user_by_id(
            user_id,
            {"password": new_password},
        )
    except AuthWeakPasswordError as e:
        detail = "; ".join(e.reasons) if e.reasons else (
            e.message or "Password does not meet the required strength."
        )
        raise HTTPException(status_code=400, detail=detail)
    except AuthApiError as e:
        message = e.message or "Unable to update password."
        raise HTTPException(
            status_code=e.status if 400 <= e.status < 500 else 400,
            detail=message,
        )

    return {"status": True}
