from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from .auth import current_user
from .database import get_db
from .models import Deadline, Subject, User
from .deadline_schemas import DeadlineCreate, DeadlineOut, DeadlineUpdate

router = APIRouter(prefix="/deadlines", tags=["Дедлайны"])


def own_subject(db, user, subject_id):
    subject = db.scalar(select(Subject).where(Subject.id == subject_id, Subject.user_id == user.id))
    if subject is None:
        raise HTTPException(404, "Дисциплина не найдена")
    return subject


def own_deadline(db, user, deadline_id):
    item = db.scalar(select(Deadline).join(Subject).where(Deadline.id == deadline_id, Subject.user_id == user.id))
    # Чужая запись неотличима от несуществующей.
    if item is None:
        raise HTTPException(404, "Дедлайн не найден")
    return item


@router.post("", response_model=DeadlineOut, status_code=201)
def create_deadline(data: DeadlineCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    own_subject(db, user, data.subject_id)
    item = Deadline(subject_id=data.subject_id, title=data.title, due_at=data.due_at.replace(tzinfo=None), done=False)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("", response_model=list[DeadlineOut])
def list_deadlines(subject_id: int | None = Query(default=None, gt=0), done: bool | None = None,
                   limit: int = Query(default=100, ge=1, le=200), offset: int = Query(default=0, ge=0),
                   db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = select(Deadline).join(Subject).where(Subject.user_id == user.id)
    if subject_id is not None:
        own_subject(db, user, subject_id)
        query = query.where(Deadline.subject_id == subject_id)
    if done is not None:
        query = query.where(Deadline.done == done)
    return db.scalars(query.order_by(Deadline.due_at, Deadline.id).offset(offset).limit(limit)).all()


@router.get("/{deadline_id}", response_model=DeadlineOut)
def get_deadline(deadline_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return own_deadline(db, user, deadline_id)


@router.patch("/{deadline_id}", response_model=DeadlineOut)
def update_deadline(deadline_id: int, data: DeadlineUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    item = own_deadline(db, user, deadline_id)
    changes = data.model_dump(exclude_unset=True)
    if "subject_id" in changes:
        own_subject(db, user, changes["subject_id"])
    if "due_at" in changes:
        changes["due_at"] = changes["due_at"].replace(tzinfo=None)
    for field, value in changes.items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{deadline_id}", status_code=204)
def delete_deadline(deadline_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    item = own_deadline(db, user, deadline_id)
    db.delete(item)
    db.commit()
    return Response(status_code=204)
