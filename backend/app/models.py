from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Subject(Base):
    # Таблица дисциплин. Это модель хранения, а не проверки JSON.

    __tablename__ = "subjects"

    # Первичный ключ SQLite назначает самостоятельно при сохранении.
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
