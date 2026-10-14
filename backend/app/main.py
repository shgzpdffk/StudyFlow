from fastapi import FastAPI
from pydantic import BaseModel, Field, field_validator

# FastAPI принимает HTTP-запросы и вызывает подходящие функции ниже.
app = FastAPI(title="StudyFlow — первый сервер")


class SubjectCreate(BaseModel):
    """Данные, которые клиент должен отправить для создания дисциплины."""

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
    """Дисциплина в ответе сервера: название и присвоенный сервером ID."""

    id: int
    name: str


# Пока это наша временная «база»: при перезапуске список очищается.
subjects: list[Subject] = []


@app.get("/health")
async def health():
    """Проверка: работает ли сервер."""
    return {"status": "ok"}


@app.get("/subjects", response_model=list[Subject])
async def get_subjects():
    """Вернуть все добавленные дисциплины."""
    return subjects


@app.post("/subjects", response_model=Subject, status_code=201)
async def create_subject(data: SubjectCreate):
    """Принять название, создать дисциплину и вернуть ее клиенту."""
    # Такое назначение ID подходит здесь, пока нет удаления и базы данных.
    subject = Subject(id=len(subjects) + 1, name=data.name)
    subjects.append(subject)
    return subject
