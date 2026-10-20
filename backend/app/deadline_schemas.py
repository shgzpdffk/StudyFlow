from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class DeadlineFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("title", check_fields=False)
    @classmethod
    def clean_title(cls, value):
        if value is None or not value.strip():
            raise ValueError("Введите название задания")
        return value.strip()

    @field_validator("due_at", check_fields=False)
    @classmethod
    def utc_date(cls, value):
        if value is None or value.utcoffset() is None:
            raise ValueError("Укажите дату и время с часовым поясом")
        return value.astimezone(timezone.utc)


class DeadlineCreate(DeadlineFields):
    subject_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=200)
    due_at: datetime


class DeadlineUpdate(DeadlineFields):
    # Отсутствующее поле не изменяется. Явный null запрещен.
    subject_id: int | None = Field(default=None, gt=0)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    due_at: datetime | None = None
    done: bool | None = None

    @model_validator(mode="after")
    def check_changes(self):
        if not self.model_fields_set:
            raise ValueError("Укажите хотя бы одно изменение")
        if any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Значения null не поддерживаются")
        return self


class DeadlineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    subject_id: int
    title: str
    due_at: datetime
    done: bool

    @field_validator("due_at")
    @classmethod
    def restore_timezone(cls, value):
        # Возвращаем явную зону UTC, чтобы фронтенд правильно показал местное время.
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
