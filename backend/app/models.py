from datetime import datetime
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    name: Mapped[str] = mapped_column(String(100))


class Subject(Base):
    __tablename__ = "subjects"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    # Старые учебные записи без владельца сохраняются, но никому не выдаются.
    # Новые записи всегда получают ID авторизованного пользователя.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)


class Deadline(Base):
    __tablename__ = "deadlines"
    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    # SQLite хранит дату без зоны: здесь всегда UTC.
    due_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
