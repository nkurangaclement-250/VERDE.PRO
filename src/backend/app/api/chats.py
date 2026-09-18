"""
Chat routes: list, create, rename, and delete chat sessions.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.schemas import ChatCreate, ChatOut, ChatUpdate
from app.database.database import get_db
from app.database.models import User
from app.services import chat as chat_service

router = APIRouter(prefix="/api/chats", tags=["chats"])


@router.get("", response_model=list[ChatOut])
def list_chats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return chat_service.list_chats(db, current_user)


@router.post("", response_model=ChatOut, status_code=status.HTTP_201_CREATED)
def create_chat(
    payload: ChatCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return chat_service.create_chat(db, current_user, payload.title)


@router.get("/{chat_id}", response_model=ChatOut)
def get_chat(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = chat_service.get_owned_chat(db, current_user, chat_id)
    if chat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    return chat


@router.patch("/{chat_id}", response_model=ChatOut)
def rename_chat(
    chat_id: str,
    payload: ChatUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = chat_service.get_owned_chat(db, current_user, chat_id)
    if chat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    return chat_service.update_chat(db, chat, payload.title, payload.pinned, payload.folder)


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = chat_service.get_owned_chat(db, current_user, chat_id)
    if chat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    chat_service.delete_chat(db, chat)