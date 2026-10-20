from fastapi import Depends, FastAPI
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .deadlines import router as deadlines_router
from .auth import current_user
from .models import User
from .models import Subject as SubjectModel

# Структура базы обновляется отдельно: python -m alembic upgrade head.
app = FastAPI(title="StudyFlow")
app.include_router(deadlines_router)


class SubjectCreate(BaseModel):
    # Данные, которые клиент должен отправить для создания дисциплины.

    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        # Убираем пробелы по краям и запрещаем название из одних пробелов.
        value = value.strip()
        if not value:
            raise ValueError("Название не должно быть пустым")
        return value


class Subject(BaseModel):
    # Дисциплина в ответе сервера: название и присвоенный сервером ID.

    # Позволяет формировать ответ из объекта SQLAlchemy.
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


@app.get("/health")
async def health():
    # Проверка: работает ли сервер.
    return {"status": "ok"}


@app.get("/subjects", response_model=list[Subject])
def get_subjects(db: Session = Depends(get_db), user: User = Depends(current_user)):
    # Вернуть все добавленные дисциплины.
    # Обычный def: синхронная работа с базой выполняется в потоке FastAPI.
    return db.scalars(select(SubjectModel).where(SubjectModel.user_id == user.id).order_by(SubjectModel.id)).all()


@app.post("/subjects", response_model=Subject, status_code=201)
def create_subject(data: SubjectCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    # Принять название, создать дисциплину и вернуть ее клиенту.
    subject = SubjectModel(name=data.name, user_id=user.id)
    db.add(subject)       # Подготовить новую строку.
    db.commit()           # Сохранить изменения в файле базы.
    db.refresh(subject)   # Получить назначенный базой ID.
    return subject


@app.get("/me")
def me(user: User = Depends(current_user)):
    # Токен бота никогда не возвращается клиенту.
    return {"id": user.id, "telegram_id": user.telegram_id, "name": user.name}
