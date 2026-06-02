# std library
import os

# third party imports
from fastapi import HTTPException

# annex imports
from app.third_party_clients.supabase import supabase_service_client
from app.org.models import OrgInfoResponse, OrgMembersResponse, MemberInfo


def _get_user_org_id(user_id: str) -> str:
    user_res = (
        supabase_service_client.from_("users")
        .select("org_id")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not user_res.data or not user_res.data.get("org_id"):
        raise HTTPException(
            status_code=404, detail="User has no associated organization")
    return user_res.data["org_id"]


def _assert_admin(user_id: str, org_id: str) -> None:
    member_res = (
        supabase_service_client.from_("organization_members")
        .select("role")
        .eq("user_id", user_id)
        .eq("org_id", org_id)
        .single()
        .execute()
    )
    if not member_res.data or member_res.data["role"] not in ("admin", "owner"):
        raise HTTPException(status_code=403, detail="Admin access required")


def get_org_info(user_id: str) -> OrgInfoResponse:
    org_id = _get_user_org_id(user_id)

    org_res = (
        supabase_service_client.from_("organizations")
        .select("name, is_active, current_files_stored, subscription_plans(name, max_users, max_files_stored)")
        .eq("id", org_id)
        .single()
        .execute()
    )
    if not org_res.data:
        raise HTTPException(status_code=404, detail="Organization not found")

    org = org_res.data
    plan = org.get("subscription_plans") or {}

    return OrgInfoResponse(
        name=org["name"],
        plan_name=plan.get("name", ""),
        max_users=plan.get("max_users", 0),
        max_files_stored=plan.get("max_files_stored", 0),
        current_files_stored=org.get("current_files_stored", 0),
        is_active=org.get("is_active", False),
    )


def get_org_members(user_id: str) -> OrgMembersResponse:
    org_id = _get_user_org_id(user_id)
    _assert_admin(user_id, org_id)

    members_res = (
        supabase_service_client.from_("organization_members")
        .select("user_id, role, joined_at")
        .eq("org_id", org_id)
        .execute()
    )
    members_data = members_res.data or []

    member_user_ids = [m["user_id"] for m in members_data]

    files_res = (
        supabase_service_client.from_("protected_paths")
        .select("user_id")
        .eq("org_id", org_id)
        .in_("user_id", member_user_ids)
        .execute()
    )
    file_rows = files_res.data or []
    file_counts: dict[str, int] = {}
    for row in file_rows:
        uid = row["user_id"]
        file_counts[uid] = file_counts.get(uid, 0) + 1

    members = []
    for m in members_data:
        uid = m["user_id"]
        auth_user = supabase_service_client.auth.admin.get_user_by_id(uid)
        email = auth_user.user.email if auth_user and auth_user.user else ""
        joined_at = m["joined_at"]
        if joined_at and hasattr(joined_at, "isoformat"):
            joined_at = joined_at.isoformat()
        members.append(MemberInfo(
            user_id=uid,
            email=email,
            role=m["role"],
            joined_at=str(joined_at),
            file_count=file_counts.get(uid, 0),
        ))

    return OrgMembersResponse(members=members)


def remove_org_member(calling_user_id: str, target_user_id: str) -> dict:
    org_id = _get_user_org_id(calling_user_id)
    _assert_admin(calling_user_id, org_id)

    if calling_user_id == target_user_id:
        raise HTTPException(
            status_code=400, detail="Admins cannot remove themselves")

    admins_res = (
        supabase_service_client.from_("organization_members")
        .select("user_id")
        .eq("org_id", org_id)
        .in_("role", ["admin", "owner"])
        .execute()
    )
    admin_ids = [r["user_id"] for r in (admins_res.data or [])]

    if target_user_id in admin_ids and len(admin_ids) <= 1:
        raise HTTPException(
            status_code=400, detail="Cannot remove the last admin")

    supabase_service_client.from_("organization_members").delete().eq(
        "user_id", target_user_id
    ).eq("org_id", org_id).execute()

    supabase_service_client.from_("users").update({"org_id": None}).eq(
        "id", target_user_id
    ).execute()

    return {"status": True}


def invite_org_member(calling_user_id: str, email: str) -> dict:
    org_id = _get_user_org_id(calling_user_id)
    _assert_admin(calling_user_id, org_id)

    org_res = (
        supabase_service_client.from_("organizations")
        .select("subscription_plans(max_users)")
        .eq("id", org_id)
        .single()
        .execute()
    )
    max_users = (org_res.data or {}).get(
        "subscription_plans", {}).get("max_users", 0)

    current_members = (
        supabase_service_client.from_("organization_members")
        .select("id", count="exact")
        .eq("org_id", org_id)
        .execute()
    )
    pending_invites = (
        supabase_service_client.from_("organization_invites")
        .select("id", count="exact")
        .eq("org_id", org_id)
        .eq("status", "pending")
        .execute()
    )
    total_seats_used = (current_members.count or 0) + \
        (pending_invites.count or 0)

    if total_seats_used >= max_users:
        raise HTTPException(
            status_code=403,
            detail=f"Organization has reached its member limit ({max_users}). Upgrade your plan to add more members.",
        )

    # Check for existing pending invite for this email + org
    existing = (
        supabase_service_client.from_("organization_invites")
        .select("id")
        .eq("org_id", org_id)
        .eq("email", email)
        .eq("status", "pending")
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409, detail="Invite already pending for this email")

    # Send Supabase magic link invite
    webapp_url = os.getenv("WEBAPP_URL", "http://localhost:3000")
    supabase_service_client.auth.admin.invite_user_by_email(
        email,
        options={"redirect_to": f"{webapp_url}/auth/accept-invite"},
    )

    # Record invite in organization_invites table (expires in 7 days via DB default)
    supabase_service_client.from_("organization_invites").insert(
        {
            "org_id": org_id,
            "email": email,
            "invited_by": calling_user_id,
        }
    ).execute()

    return {"status": True}
