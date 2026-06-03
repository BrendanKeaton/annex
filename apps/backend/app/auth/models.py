from dataclasses import dataclass, field

from pydantic import BaseModel, Field


@dataclass
class UserClaims:
    user_id: str
    email: str
    role: str
    claims: dict = field(default_factory=dict)


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=320)
    password: str = Field(..., max_length=128)


class RefreshSessionRequest(BaseModel):
    refresh_token: str = Field(..., max_length=512)


class PinCheckRequest(BaseModel):
    pin: str = Field(..., pattern=r'^\d{6}$')


class PersonalInfoRequest(BaseModel):
    first_name: str = Field(..., max_length=25, min_length=1)
    last_name: str = Field(..., max_length=25, min_length=1)


class PinSetRequest(BaseModel):
    pin: str = Field(..., pattern=r'^\d{6}$')


class PinResetRequest(BaseModel):
    current_pin: str = Field(..., pattern=r'^\d{6}$')
    new_pin: str = Field(..., pattern=r'^\d{6}$')


class OnboardingStageResponse(BaseModel):
    stage: int


class OnboardingResponse(BaseModel):
    status: bool
    new_stage: int


class RecoveryCodesResponse(BaseModel):
    status: bool
    new_stage: int
    recovery_codes: list[str]


class OrganizationResponse(BaseModel):
    status: bool
    new_stage: int
    org_id: str


class OAuthSessionRequest(BaseModel):
    access_token: str = Field(..., max_length=2048)
    refresh_token: str = Field(..., max_length=512)


class AcceptInviteRequest(BaseModel):
    access_token: str = Field(..., max_length=2048)
    refresh_token: str = Field(..., max_length=512)
    new_password: str = Field(..., min_length=8, max_length=128)
