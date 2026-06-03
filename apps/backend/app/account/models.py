from pydantic import BaseModel, EmailStr, Field


class UpdateEmailRequest(BaseModel):
    new_email: EmailStr
    pin: str = Field(..., pattern=r'^\d{6}$')


class UpdatePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)
    pin: str = Field(..., pattern=r'^\d{6}$')
