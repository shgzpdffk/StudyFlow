from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .models import User


def get_or_create_user(db: Session, telegram_id: int, name: str):
    user = db.scalar(select(User).where(User.telegram_id == telegram_id))
    if user is None:
        user = User(telegram_id=telegram_id, name=name[:100])
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            # Бот и Mini App могут одновременно создать одного пользователя.
            db.rollback()
            user = db.scalar(select(User).where(User.telegram_id == telegram_id))
            if user is None:
                raise
        db.refresh(user)
    return user
