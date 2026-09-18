"""
File routes: upload a file, list your files, download one, or delete one.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.schemas import FileOut
from app.database.database import get_db
from app.database.models import FileAsset, User
from app.services import files as files_service

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("", response_model=FileOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    upload: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await files_service.save_upload(db, current_user, upload)


@router.get("", response_model=list[FileOut])
def list_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(FileAsset).where(FileAsset.owner_id == current_user.id).order_by(
        FileAsset.created_at.desc()
    )
    return list(db.scalars(stmt))


@router.get("/{file_id}/download")
def download_file(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_asset = files_service.get_owned_file(db, current_user, file_id)
    if file_asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return FileResponse(
        path=file_asset.stored_path,
        filename=file_asset.original_name,
        media_type=file_asset.content_type,
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_asset = files_service.get_owned_file(db, current_user, file_id)
    if file_asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    files_service.delete_file(db, file_asset)