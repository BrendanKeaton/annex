# third party imports
from typing import List

# annex imports
from fastapi import HTTPException
from app.path.models import PathItem
from app.third_party_clients.supabase import supabase_service_client


def add_protected_path(items: List[PathItem], user_id):

    records = [
        {"path": item.path, "file_size": item.file_size,
         "file_type": item.file_type or "unknown"}
        for item in items
    ]

    res = supabase_service_client.rpc(
        "insert_protected_paths",
        {"p_user_id": user_id, "p_items": records},
    ).execute()
    return res.data


def remove_protected_path(item: str, user_id: str):
    res = supabase_service_client.from_("protected_paths").delete().eq(
        "user_id", user_id).eq("path", item).execute()

    if res.data == []:
        raise HTTPException(status_code=404, detail="File does not exist or could not be deleted")

    return {"status": True}
