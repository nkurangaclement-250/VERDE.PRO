"""
Message routes: list a chat's messages, and post a new user message.

Posting a message stores it, then synchronously asks the AI service for a
reply and stores that too — the response contains both messages so the
client can render the full turn in one round trip.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.schemas import MessageCreate, MessageOut
from app.database.database import get_db
from app.database.models import User
from app.services import chat as chat_service

router = APIRouter(prefix="/api/chats/{chat_id}/messages", tags=["messages"])


def _get_chat_or_404(db: Session, user: User, chat_id: str):
    chat = chat_service.get_owned_chat(db, user, chat_id)
    if chat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    return chat


@router.get("", response_model=list[MessageOut])
def list_messages(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = _get_chat_or_404(db, current_user, chat_id)
    return chat_service.list_messages(db, chat)


@router.post("", response_model=list[MessageOut], status_code=status.HTTP_201_CREATED)
async def post_message(
    chat_id: str,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = _get_chat_or_404(db, current_user, chat_id)
    try:
        user_message, assistant_message = await chat_service.post_user_message(
            db,
            chat,
            payload.content,
            payload.file_ids,
            payload.mode,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return [user_message, assistant_message]