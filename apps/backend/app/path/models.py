from pydantic import BaseModel, Field
from typing import List


class PathItem(BaseModel):
    path: str = Field(..., max_length=1024)
    file_size: int = Field(ge=0)
    file_type: str = Field(..., max_length=64)


class PathAddRequest(BaseModel):
    items: List[PathItem] = Field(min_length=1, max_length=250)


class PathName(BaseModel):
    path: str = Field(..., max_length=1024)
