"""
Pydantic schemas shared across API routers (request bodies & response models).
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# --- Auth ---
class UserCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    display_name: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# --- Chats ---
class ChatCreate(BaseModel):
    title: Optional[str] = "New chat"


class ChatUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    pinned: bool = False
    folder: str = Field(default="", max_length=100)


class ChatOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    pinned: bool = False
    folder: str = ""

    class Config:
        from_attributes = True


# --- Messages ---
class MessageCreate(BaseModel):
    content: str = Field(min_length=1)
    file_ids: list[str] = Field(default_factory=list)
    mode: str = Field(default="chat", max_length=30)


class MessageOut(BaseModel):
    id: str
    chat_id: str
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Files ---
class FileOut(BaseModel):
    id: str
    original_name: str
    content_type: str
    size_bytes: int
    created_at: datetime

    class Config:
        from_attributes = True