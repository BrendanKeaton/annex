
# std library
import hashlib
from datetime import datetime, timezone

# annex imports
from fastapi import HTTPException
from app.logging.logging_main import logger
from app.config import AES_SEED
from app.encryption import encrypt, decrypt
from app.third_party_clients.supabase import supabase_service_client
from app.sessions.models import StartSessionMetadata, StartSessionResponse, SessionStartUpdate, InitiateEndSessionResponse, FileRecord, ReportEncryptedFile


def session_start(session_metadata: StartSessionMetadata, user_id: str) -> StartSessionResponse:
    try:
        res = supabase_service_client.rpc(
            "get_session_context",
            {
                "p_user_id": user_id,
                "p_file_count": session_metadata.file_count,
                "p_total_size_kb": session_metadata.total_size_bytes // 1024,
                "p_est_encryption_time_ms": session_metadata.estimated_time_ms,
            },
        ).execute()
    except Exception as e:
        error_msg = str(e)
        if "User not found or inactive" in error_msg:
            raise HTTPException(
                status_code=404, detail="User not found or inactive.")
        if "Active session already exists" in error_msg:
            raise HTTPException(
                status_code=409, detail="An active session already exists.")
        raise HTTPException(
            status_code=500,
            detail="Internal database error, contact support if issue persists.",
        )

    if not res.data:
        raise HTTPException(
            status_code=500,
            detail="Internal database error, contact support if issue persists.",
        )

    row = res.data[0]
    session_id = row["session_id"]
    random_seed = row["random_seed"]

    daily_session_count = row["daily_session_count"]
    utc_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    aes_key = hashlib.sha256(
        f"{AES_SEED}:{random_seed}:{utc_date}:{daily_session_count}".encode()
    ).hexdigest()

    try:
        supabase_service_client.from_("sessions").update(
            {"aes_key": encrypt(aes_key)}).eq("id", session_id).execute()
    except Exception as e:
        logger.exception("Failed to store AES key for session %s: %s", session_id, e)
        raise HTTPException(
            status_code=500,
            detail="Internal database error, contact support if issue persists.",
        )

    return StartSessionResponse(aes_key=aes_key, session_id=session_id)


def session_start_update(session_metadata: SessionStartUpdate, user_id: str) -> bool:
    supabase_service_client.rpc(
        "session_start_update",
        {
            "p_session_id": session_metadata.session_id,
            "p_actual_time_ms": session_metadata.actual_time_ms,
            "p_user_id": user_id,
        },
    ).execute()

    return True


def report_encrypted_file(file_report: ReportEncryptedFile, user_id: str) -> bool:
    supabase_service_client.rpc(
        "report_encrypted_file",
        {
            "p_session_id": file_report.session_id,
            "p_user_id": user_id,
            "p_original_path": file_report.original_path,
            "p_encrypted_filename": file_report.encrypted_filename,
            "p_checksum_sha256": file_report.checksum_sha256,
            "p_format_version": file_report.format_version,
            "p_status": file_report.status,
        },
    ).execute()

    return True


def session_end(session_id: str, status: str, user_id: str):
    supabase_service_client.rpc(
        "end_session", {"p_session_id": session_id, "p_status": status, "p_user_id": user_id}).execute()
    return True


def initiate_end_session(session_id: str, user_id: str) -> InitiateEndSessionResponse:
    try:
        res = supabase_service_client.rpc(
            "get_session_for_decryption",
            {"p_session_id": session_id, "p_user_id": user_id},
        ).execute()
    except Exception as e:
        error_msg = str(e)
        if "Session not found or has no AES key" in error_msg:
            raise HTTPException(
                status_code=404, detail="Session not found or has no AES key.")
        raise HTTPException(
            status_code=500,
            detail="Internal database error, contact support if issue persists.",
        )

    if not res.data:
        raise HTTPException(
            status_code=404, detail="Session not found or has no AES key.")

    result = res.data
    aes_key = decrypt(result["aes_key"])
    files = [FileRecord(**f) for f in result["files"]]

    return InitiateEndSessionResponse(aes_key=aes_key, files=files)
