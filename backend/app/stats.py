from datetime import date, datetime, time, timedelta, timezone as utc_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .auth import current_user
from .database import get_db
from .models import StudySession, Subject, User
from .sessions import utc_now
from .stat_schemas import DailyStats, SubjectStats

router = APIRouter(prefix="/stats", tags=["Статистика"])


def day_bounds(day: date, zone_name: str):
    # Ограничиваем крайние даты, чтобы перевод зоны и следующий день не переполняли datetime.
    if not 1970 <= day.year <= 9998:
        raise HTTPException(422, "Год должен быть от 1970 до 9998")
    try:
        zone = ZoneInfo(zone_name)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, "Неизвестный часовой пояс. Пример: Europe/Moscow") from None
    # Строим обе местные полуночи отдельно: при переводе часов день бывает 23 или 25 часов.
    start = datetime.combine(day, time.min, zone)
    end = datetime.combine(day + timedelta(days=1), time.min, zone)
    return (
        start.astimezone(utc_timezone.utc).replace(tzinfo=None),
        end.astimezone(utc_timezone.utc).replace(tzinfo=None),
    )


@router.get("/daily", response_model=DailyStats)
def daily_stats(day: date, timezone: str = Query(default="UTC", min_length=1, max_length=100),
                db: Session = Depends(get_db), user: User = Depends(current_user)):
    start, end = day_bounds(day, timezone)
    # Один снимок времени на весь запрос: активные занятия считаем только до этого момента.
    now = utc_now()
    cutoff = min(end, now)
    result = DailyStats(day=day, timezone=timezone,
                        calculated_at=now.replace(tzinfo=utc_timezone.utc), total_seconds=0, subjects=[])
    if cutoff <= start:
        return result
    query = select(StudySession, Subject.name).join(Subject).where(
        StudySession.user_id == user.id,
        Subject.user_id == user.id,
        StudySession.started_at < cutoff,
        or_(StudySession.ended_at.is_(None), StudySession.ended_at > start),
    )
    totals = {}
    names = {}
    for item, name in db.execute(query):
        # В расчет попадает только пересечение занятия с выбранным днем.
        session_end = min(item.ended_at, cutoff) if item.ended_at is not None else cutoff
        duration = session_end - max(item.started_at, start)
        if duration <= timedelta(0):
            continue
        totals[item.subject_id] = totals.get(item.subject_id, timedelta(0)) + duration
        names[item.subject_id] = name
    # Сначала складываем точные длительности, затем округляем вниз по дисциплине.
    result.subjects = [SubjectStats(subject_id=sid, subject_name=names[sid], seconds=int(duration.total_seconds()))
                       for sid, duration in totals.items() if duration >= timedelta(seconds=1)]
    result.subjects.sort(key=lambda row: (-row.seconds, row.subject_id))
    result.total_seconds = sum(row.seconds for row in result.subjects)
    return result
