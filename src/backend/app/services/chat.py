"""
Chat service — business logic that sits between the API routers and the ORM.

Handles: creating chats, listing a user's chats, appending messages, and
orchestrating the assistant's reply via the AI service.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import Chat, FileAsset, Message, User
from app.services import ai


def list_chats(db: Session, user: User) -> list[Chat]:
    stmt = select(Chat).where(Chat.owner_id == user.id).order_by(Chat.updated_at.desc())
    return list(db.scalars(stmt))


def create_chat(db: Session, user: User, title: str | None) -> Chat:
    chat = Chat(owner_id=user.id, title=title or "New chat")
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


def get_owned_chat(db: Session, user: User, chat_id: str) -> Chat | None:
    chat = db.get(Chat, chat_id)
    if chat is None or chat.owner_id != user.id:
        return None
    return chat


def rename_chat(db: Session, chat: Chat, title: str) -> Chat:
    return update_chat(db, chat, title, chat.pinned, chat.folder)

def update_chat(db: Session, chat: Chat, title: str, pinned: bool = False, folder: str = "") -> Chat:
    chat.title = title
    chat.pinned = pinned
    chat.folder = folder or ""
    db.commit()
    db.refresh(chat)
    return chat


def delete_chat(db: Session, chat: Chat) -> None:
    db.delete(chat)
    db.commit()


def list_messages(db: Session, chat: Chat) -> list[Message]:
    stmt = select(Message).where(Message.chat_id == chat.id).order_by(Message.created_at)
    return list(db.scalars(stmt))


async def post_user_message(
    db: Session,
    chat: Chat,
    content: str,
    file_ids: list[str],
    mode: str = "chat",
) -> tuple[Message, Message]:
    """
    Store the user's message, attach any referenced files, generate an assistant
    reply, store that too, and return both messages.
    """
    user_message = Message(chat_id=chat.id, role="user", content=content)
    db.add(user_message)
    db.flush()  # get user_message.id without a full commit

    if file_ids:
        stmt = select(FileAsset).where(
            FileAsset.id.in_(file_ids), FileAsset.owner_id == chat.owner_id
        )
        for file_asset in db.scalars(stmt):
            file_asset.message_id = user_message.id

    # Auto-title new chats from the first message.
    if chat.title == "New chat":
        chat.title = ai.suggest_title(content)

    db.commit()
    db.refresh(user_message)

    history = list_messages(db, chat)
    reply_text = await ai.generate_reply(
        history,
        system_prompt=ai.get_mode_prompt(mode),
        web_research=(mode == "research"),
    )

    assistant_message = Message(chat_id=chat.id, role="assistant", content=reply_text)
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)
    db.refresh(chat)

    return user_message, assistant_message