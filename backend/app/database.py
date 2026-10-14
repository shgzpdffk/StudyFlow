from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Абсолютный путь: база всегда находится в backend, независимо от папки запуска.
DATABASE_PATH = Path(__file__).resolve().parents[1] / "studyflow.db"
engine = create_engine(
    f"sqlite:///{DATABASE_PATH}",
    connect_args={"check_same_thread": False},
)


class Base(DeclarativeBase):
    # Общая основа для моделей таблиц SQLAlchemy.
    pass


SessionLocal = sessionmaker(bind=engine)


def get_db():
    # Каждый запрос получает свою сессию. При завершении она закрывается.
    with SessionLocal() as session:
        yield session
