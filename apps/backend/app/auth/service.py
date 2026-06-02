# std library
from datetime import datetime, timezone

# third party imports
from fastapi import HTTPException
import bcrypt
import secrets
import string

# annex imports
from app.third_party_clients.supabase import supabase_service_client, supabase_auth_client
from app.encryption import encrypt, decrypt
from app.config import IS_DEV


def _get_session_record(user_id: str) -> dict:
    return (
        supabase_service_client.rpc(
            "get_user_session", {"p_user_id": user_id}
        ).execute()
    ).data


def _build_session_response(session_record: dict, session_data: dict, user_data: dict) -> dict:
    response = {
        "session": {
            **session_data,
            "daily_session_count": session_record.get("session_count"),
        },
        "user": user_data,
        "org_name": session_record.get("org_name"),
        "logo_path": session_record.get("logo_path"),
        "usage": session_record.get("usage"),
        "current_file_count": session_record.get("current_file_count"),
        "max_file_count": session_record.get("max_file_count"),
        "protected_paths": session_record.get("protected_paths"),
        "session_history": session_record.get("session_history", []),
        "mid_process": session_record.get("mid_process"),
        "subscription_level": session_record.get("subscription_level"),
    }

    return response


def user_onboarding_stage_increment(user_id: str) -> bool:
    user = supabase_service_client.auth.admin.get_user_by_id(
        user_id
    )

    current_stage = (
        user.user.app_metadata.get("onboarding_stage", 0)
        if user and user.user and user.user.app_metadata
        else 0
    )

    supabase_service_client.auth.admin.update_user_by_id(
        user_id,
        {
            "app_metadata": {
                "onboarding_stage": current_stage + 1,
            }
        }
    )

    return {"status": True, "new_stage": current_stage + 1}


def user_login(email: str, password: str):
    auth_response = supabase_auth_client.auth.sign_in_with_password(
        {
            "email": email,
            "password": password,
        })

    user_id = auth_response.user.id
    session_record = _get_session_record(user_id)

    return _build_session_response(
        session_record,
        session_data={
            "access_token": auth_response.session.access_token,
            "refresh_token": auth_response.session.refresh_token,
            "expires_at": auth_response.session.expires_at,
        },
        user_data={
            "id": user_id,
            "email": auth_response.user.email,
        },
    )


def get_user_session_data(user_id: str, access_token: str):
    user_response = supabase_auth_client.auth.get_user(access_token)
    user = user_response.user
    session_record = _get_session_record(user_id)

    return _build_session_response(
        session_record,
        session_data={"access_token": access_token},
        user_data={
            "id": user_id,
            "email": user.email,
        },
    )


def refresh_user_session(refresh_token: str):
    auth_response = supabase_auth_client.auth.refresh_session(refresh_token)

    user = auth_response.user
    user_id = user.id
    session_record = _get_session_record(user_id)

    return _build_session_response(
        session_record,
        session_data={
            "access_token": auth_response.session.access_token,
            "refresh_token": auth_response.session.refresh_token,
            "expires_at": auth_response.session.expires_at,
        },
        user_data={
            "id": user_id,
            "email": user.email,
        },
    )


def get_onboarding_stage(user_id: str) -> int:
    user = supabase_service_client.auth.admin.get_user_by_id(user_id)
    if user and user.user and user.user.app_metadata:
        return user.user.app_metadata.get("onboarding_stage", 0)
    return 0


def update_organization(user_id: str, name: str, subscription_code: str, logo_file=None):
    user_res = (
        supabase_service_client.from_("users")
        .select("org_id")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found")

    org_id = user_res.data["org_id"]

    member_res = (
        supabase_service_client.from_("organization_members")
        .select("role")
        .eq("user_id", user_id)
        .eq("org_id", org_id)
        .single()
        .execute()
    )
    if not member_res.data or member_res.data["role"] not in ("owner", "admin"):
        raise HTTPException(
            status_code=403, detail="Only owners and admins can update the organization")

    plan_res = (
        supabase_service_client.from_("subscription_plans")
        .select("id")
        .eq("code", subscription_code)
        .single()
        .execute()
    )
    if not plan_res.data:
        raise HTTPException(
            status_code=400, detail="Invalid subscription code")

    subscription_plan_id = plan_res.data["id"]

    supabase_service_client.from_("organizations").update(
        {"name": name, "subscription_plan_id": subscription_plan_id}
    ).eq("id", org_id).execute()

    if logo_file:
        file_bytes = logo_file.file.read()
        ext = ""
        if logo_file.filename and "." in logo_file.filename:
            ext = "." + logo_file.filename.rsplit(".", 1)[1]
        file_path = f"{org_id}/logo{ext}"

        supabase_service_client.storage.from_("company_logos").upload(
            file_path, file_bytes, {"content-type": logo_file.content_type}
        )

        public_url = supabase_service_client.storage.from_(
            "company_logos").get_public_url(file_path)
        supabase_service_client.from_("organizations").update(
            {"logo_path": public_url}).eq("id", org_id).execute()

    user_onboarding_stage_increment(user_id)
    return {"status": True, "new_stage": 2, "org_id": str(org_id)}


def set_pin(user_id: str, pin: str, first: bool):
    hashed_pin = bcrypt.hashpw(pin.encode(
        "utf-8"), bcrypt.gensalt()).decode("utf-8")
    supabase_service_client.from_("users").update(
        {"pin": hashed_pin}).eq("id", user_id).execute()
    if first:
        user_onboarding_stage_increment(user_id)
    return {"status": True, "new_stage": 3}


def generate_recovery_codes(user_id: str):
    chars = string.ascii_lowercase + string.digits
    codes = [
        f"{''.join(secrets.choice(chars) for _ in range(4))}-{''.join(secrets.choice(chars) for _ in range(4))}"
        for _ in range(6)
    ]
    encrypted_codes = [encrypt(code) for code in codes]
    supabase_service_client.from_("users").update(
        {"key_seeds": encrypted_codes}).eq("id", user_id).execute()
    user_onboarding_stage_increment(user_id)
    return {"status": True, "new_stage": 4, "recovery_codes": codes}


def reset_pin(user_id: str, current_pin: str, new_pin: str):
    check_user_pin(user_id, current_pin)
    return set_pin(user_id, new_pin, first=False)


def get_recovery_codes(user_id: str):
    res = (
        supabase_service_client.from_("users")
        .select("key_seeds")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")

    encrypted_codes = res.data.get("key_seeds") or []
    codes = [decrypt(code) for code in encrypted_codes]
    return {"recovery_codes": codes}


def regenerate_recovery_codes(user_id: str):
    chars = string.ascii_lowercase + string.digits
    codes = [
        f"{''.join(secrets.choice(chars) for _ in range(4))}-{''.join(secrets.choice(chars) for _ in range(4))}"
        for _ in range(6)
    ]
    encrypted_codes = [encrypt(code) for code in codes]
    supabase_service_client.from_("users").update(
        {"key_seeds": encrypted_codes}).eq("id", user_id).execute()
    return {"status": True, "recovery_codes": codes}


def oauth_session(access_token: str, refresh_token: str):
    user_response = supabase_auth_client.auth.get_user(access_token)
    user = user_response.user
    user_id = user.id
    session_record = _get_session_record(user_id)

    return _build_session_response(
        session_record,
        session_data={
            "access_token": access_token,
            "refresh_token": refresh_token,
        },
        user_data={
            "id": user_id,
            "email": user.email,
        },
    )


def accept_invite(access_token: str, refresh_token: str, new_password: str):
    user_response = supabase_auth_client.auth.get_user(access_token)
    user = user_response.user
    user_id = user.id
    email = user.email

    # Look up pending, non-expired invite by email
    invite_res = (
        supabase_service_client.from_("organization_invites")
        .select("id, org_id")
        .eq("email", email)
        .eq("status", "pending")
        .gte("expires_at", datetime.now(timezone.utc).isoformat())
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not invite_res.data:
        raise HTTPException(status_code=400, detail="No pending invite found for this user")

    invite = invite_res.data[0]
    invite_id = invite["id"]
    org_id = invite["org_id"]

    # Set the user's password
    supabase_service_client.auth.admin.update_user_by_id(
        user_id,
        {"password": new_password},
    )

    # Create or update users table row linked to org
    existing_user = (
        supabase_service_client.from_("users")
        .select("id")
        .eq("id", user_id)
        .execute()
    )
    if not existing_user.data:
        supabase_service_client.from_("users").insert(
            {"id": user_id, "org_id": org_id}
        ).execute()
    else:
        supabase_service_client.from_("users").update(
            {"org_id": org_id}
        ).eq("id", user_id).execute()

    # Create organization_members row
    existing_member = (
        supabase_service_client.from_("organization_members")
        .select("user_id")
        .eq("user_id", user_id)
        .eq("org_id", org_id)
        .execute()
    )
    if not existing_member.data:
        supabase_service_client.from_("organization_members").insert(
            {"user_id": user_id, "org_id": org_id, "role": "member"}
        ).execute()

    # Mark invite as accepted
    supabase_service_client.from_("organization_invites").update(
        {"status": "accepted", "accepted_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", invite_id).execute()

    # Set onboarding stage to 2 (skip org setup) and clear invite flag
    supabase_service_client.auth.admin.update_user_by_id(
        user_id,
        {"app_metadata": {"onboarding_stage": 2, "is_invited": None}},
    )

    session_record = _get_session_record(user_id)

    return _build_session_response(
        session_record,
        session_data={
            "access_token": access_token,
            "refresh_token": refresh_token,
        },
        user_data={
            "id": user_id,
            "email": email,
        },
    )


def check_user_pin(user_id: str, pin: str):
    res = (
        supabase_service_client.from_("users")
        .select("pin")
        .eq("id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")

    stored_pin = res.data[0]["pin"]
    if not stored_pin:
        raise HTTPException(status_code=403, detail="PIN not set")

    if not bcrypt.checkpw(pin.encode("utf-8"), stored_pin.encode("utf-8")):
        raise HTTPException(status_code=403, detail="Invalid pin")

    return {"status": True}
