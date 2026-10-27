from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import String, Unicode, ForeignKey, DateTime, BigInteger, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(Unicode(100))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Session(Base):
    __tablename__ = 'sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class Folder(Base):
    __tablename__ = 'folders'
    __table_args__ = (UniqueConstraint('owner_id', 'parent_id', 'name'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(Unicode(180))
    owner_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey('folders.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class File(Base):
    __tablename__ = 'files'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(Unicode(180))
    owner_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    folder_id: Mapped[str | None] = mapped_column(ForeignKey('folders.id'), nullable=True)
    blob_key: Mapped[str] = mapped_column(String(255), unique=True)
    size: Mapped[int] = mapped_column(BigInteger)
    content_type: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Share(Base):
    __tablename__ = 'shares'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    file_id: Mapped[str] = mapped_column(ForeignKey('files.id'), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
