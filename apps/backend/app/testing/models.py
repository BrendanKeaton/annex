from pydantic import BaseModel


class UserInfo(BaseModel):
    email: str | None = None
    password: str | None = None
