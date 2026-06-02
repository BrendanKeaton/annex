from pydantic import BaseModel, EmailStr, Field
from typing import List


class OrgInfoResponse(BaseModel):
    name: str
    plan_name: str
    max_users: int
    max_files_stored: int
    current_files_stored: int
    is_active: bool


class MemberInfo(BaseModel):
    user_id: str
    email: str
    role: str
    joined_at: str
    file_count: int


class OrgMembersResponse(BaseModel):
    members: List[MemberInfo]


class InviteRequest(BaseModel):
    email: EmailStr
