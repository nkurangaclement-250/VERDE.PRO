"""
Files service — validates and persists uploaded files to disk, and records
metadata in the database.
"""
import uuid
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.models import FileAsset, User

ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
}


def _user_upload_dir(user_id: str) -> Path:
    path = Path(settings.UPLOAD_DIR) / user_id
    path.mkdir(parents=True, exist_ok=True)
    return path


async def save_upload(db: Session, user: User, upload: UploadFile) -> FileAsset:
    if upload.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {upload.content_type}",
        )

    dest_dir = _user_upload_dir(user.id)
    safe_name = f"{uuid.uuid4()}_{Path(upload.filename or 'upload').name}"
    dest_path = dest_dir / safe_name

    size = 0
    async with aiofiles.open(dest_path, "wb") as out_file:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > settings.max_upload_size_bytes:
                await out_file.close()
                dest_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
                )
            await out_file.write(chunk)

    file_asset = FileAsset(
        owner_id=user.id,
        original_name=upload.filename or safe_name,
        stored_path=str(dest_path),
        content_type=upload.content_type or "application/octet-stream",
        size_bytes=size,
    )
    db.add(file_asset)
    db.commit()
    db.refresh(file_asset)
    return file_asset


def get_owned_file(db: Session, user: User, file_id: str) -> FileAsset | None:
    file_asset = db.get(FileAsset, file_id)
    if file_asset is None or file_asset.owner_id != user.id:
        return None
    return file_asset


def delete_file(db: Session, file_asset: FileAsset) -> None:
    Path(file_asset.stored_path).unlink(missing_ok=True)
    db.delete(file_asset)
    db.commit()