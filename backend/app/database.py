from sqlalchemy import create_engine, event
from .config import settings
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Адрес базы берется из настроек; по умолчанию это backend/studyflow.db.
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def sqlite_settings(connection, _):
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA busy_timeout=5000")


class Base(DeclarativeBase):
    # Общая основа для моделей таблиц SQLAlchemy.
    pass


SessionLocal = sessionmaker(bind=engine)


def get_db():
    # Каждый запрос получает свою сессию. При завершении она закрывается.
    with SessionLocal() as session:
        yield session
