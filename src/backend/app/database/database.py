from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Called once on app startup."""
    from app.database import models  # noqa: F401  (ensures models are registered)
    Base.metadata.create_all(bind=engine)
    if settings.database_url.startswith("sqlite"):
        with engine.begin() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(chats)"))}
            if "pinned" not in cols:
                conn.execute(text("ALTER TABLE chats ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT 0"))
            if "folder" not in cols:
                conn.execute(text("ALTER TABLE chats ADD COLUMN folder VARCHAR(100) NOT NULL DEFAULT ''"))