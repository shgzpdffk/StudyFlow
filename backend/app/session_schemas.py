from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class SessionStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Владелец и время начала определяются сервером.
    subject_id: int = Field(gt=0)


class SessionOut(BaseModel):
    id: int
    subject_id: int
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int
