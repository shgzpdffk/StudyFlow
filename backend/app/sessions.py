from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import current_user
from .database import get_db
from .models import StudySession, Subject, User
from .session_schemas import SessionOut, SessionStart

router = APIRouter(prefix="/sessions", tags=["Учебные сессии"])


def utc_now():
    # SQLite хранит UTC без часового пояса; наружу всегда возвращаем его явно.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def session_response(item, now=None):
    end = item.ended_at if item.ended_at is not None else (now if now is not None else utc_now())
    return SessionOut(
        id=item.id,
        subject_id=item.subject_id,
        started_at=item.started_at.replace(tzinfo=timezone.utc),
        ended_at=item.ended_at.replace(tzinfo=timezone.utc) if item.ended_at is not None else None,
        duration_seconds=max(0, int((end - item.started_at).total_seconds())),
    )


def active_session(db, user_id):
    return db.scalar(select(StudySession).where(
        StudySession.user_id == user_id, StudySession.ended_at.is_(None)))


def own_session(db, user_id, session_id):
    item = db.scalar(select(StudySession).where(
        StudySession.id == session_id, StudySession.user_id == user_id))
    if item is None:
        raise HTTPException(404, "Учебная сессия не найдена")
    return item


@router.post("/start", response_model=SessionOut, status_code=201)
def start_session(data: SessionStart, db: Session = Depends(get_db), user: User = Depends(current_user)):
    subject = db.scalar(select(Subject).where(Subject.id == data.subject_id, Subject.user_id == user.id))
    if subject is None:
        raise HTTPException(404, "Дисциплина не найдена")
    if active_session(db, user.id) is not None:
        raise HTTPException(409, "Сначала остановите текущий таймер")
    item = StudySession(user_id=user.id, subject_id=subject.id, started_at=utc_now())
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Уникальный индекс защищает от одновременных запусков с разных устройств.
        if active_session(db, user.id) is not None:
            raise HTTPException(409, "Сначала остановите текущий таймер") from None
        raise
    db.refresh(item)
    return session_response(item)


@router.get("/active", response_model=SessionOut | None)
def get_active_session(db: Session = Depends(get_db), user: User = Depends(current_user)):
    item = active_session(db, user.id)
    # При отсутствии таймера возвращаем JSON null.
    return session_response(item) if item is not None else None


@router.get("", response_model=list[SessionOut])
def list_sessions(subject_id: int | None = Query(default=None, gt=0),
                  completed: bool | None = None,
                  limit: int = Query(default=50, ge=1, le=200),
                  offset: int = Query(default=0, ge=0),
                  db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = select(StudySession).where(StudySession.user_id == user.id)
    if subject_id is not None:
        subject = db.scalar(select(Subject).where(Subject.id == subject_id, Subject.user_id == user.id))
        if subject is None:
            raise HTTPException(404, "Дисциплина не найдена")
        query = query.where(StudySession.subject_id == subject_id)
    if completed is not None:
        query = query.where(StudySession.ended_at.is_not(None) if completed else StudySession.ended_at.is_(None))
    items = db.scalars(query.order_by(StudySession.started_at.desc(), StudySession.id.desc()).offset(offset).limit(limit)).all()
    now = utc_now()
    return [session_response(item, now) for item in items]


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return session_response(own_session(db, user.id, session_id))


@router.post("/{session_id}/stop", response_model=SessionOut)
def stop_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    own_session(db, user.id, session_id)
    now = utc_now()
    # Закрываем именно указанную сессию. Повторный запрос не меняет время
    # окончания и не останавливает другой, уже запущенный таймер.
    db.execute(update(StudySession).where(
        StudySession.id == session_id,
        StudySession.user_id == user.id,
        StudySession.ended_at.is_(None),
    ).values(ended_at=case((StudySession.started_at > now, StudySession.started_at), else_=now)),
        execution_options={"synchronize_session": False})
    db.commit()
    return session_response(own_session(db, user.id, session_id))
