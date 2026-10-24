from datetime import date, datetime
from pydantic import BaseModel, Field


class SubjectStats(BaseModel):
    subject_id: int
    subject_name: str
    seconds: int = Field(ge=0)


class DailyStats(BaseModel):
    day: date
    timezone: str
    calculated_at: datetime
    total_seconds: int = Field(ge=0)
    subjects: list[SubjectStats]
