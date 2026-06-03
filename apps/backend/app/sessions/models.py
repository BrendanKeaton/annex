
from typing import Optional

from pydantic import BaseModel, Field


class StartSessionMetadata(BaseModel):
    file_count: int
    total_size_bytes: int
    estimated_time_ms: int


class StartSessionResponse(BaseModel):
    aes_key: str = Field(..., max_length=128)
    session_id: str = Field(..., max_length=64)


class FileRecord(BaseModel):
    original_path: str = Field(..., max_length=1024)
    encrypted_filename: str = Field(..., max_length=512)
    checksum_sha256: str = Field(..., max_length=64)
    status: str = Field(..., max_length=32)
    format_version: Optional[int] = None


class ReportEncryptedFile(BaseModel):
    session_id: str = Field(..., max_length=64)
    original_path: str = Field(..., max_length=1024)
    encrypted_filename: str = Field(..., max_length=512)
    checksum_sha256: str = Field(..., max_length=64)
    format_version: Optional[int] = None
    status: str = Field(..., max_length=32)


class SessionStartUpdate(BaseModel):
    session_id: str = Field(..., max_length=64)
    actual_time_ms: int


class EndSession(BaseModel):
    session_id: str = Field(..., max_length=64)
    status: str = Field(..., max_length=32)


class InitiateEndSession(BaseModel):
    session_id: str = Field(..., max_length=64)


class InitiateEndSessionResponse(BaseModel):
    aes_key: str = Field(..., max_length=128)
    files: list[FileRecord]
