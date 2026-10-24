from contextlib import contextmanager
from datetime import datetime

import pytest
from test_auth import client, signed
from app.database import get_db
from app.main import app
from app.models import StudySession, Subject


def subject(client, name='Математика', uid=101):
    return client.post('/subjects', headers=signed(uid), json={'name': name}).json()['id']


def seed(sid, start, end=None):
    # Добавляем занятия только во временную тестовую базу.
    with contextmanager(app.dependency_overrides[get_db])() as db:
        owner = db.get(Subject, sid).user_id
        db.add(StudySession(user_id=owner, subject_id=sid,
                            started_at=datetime.fromisoformat(start),
                            ended_at=datetime.fromisoformat(end) if end else None))
        db.commit()


def query(client, day='2026-10-24', zone='UTC', uid=101):
    return client.get('/stats/daily', params={'day': day, 'timezone': zone}, headers=signed(uid))


@pytest.fixture(autouse=True)
def fixed_time(monkeypatch):
    from app import stats
    monkeypatch.setattr(stats, 'utc_now', lambda: datetime(2026, 10, 24, 12))


def test_empty_and_auth(client):
    r = query(client)
    assert r.status_code == 200
    assert r.json() == {'day': '2026-10-24', 'timezone': 'UTC', 'calculated_at': '2026-10-24T12:00:00Z', 'total_seconds': 0, 'subjects': []}
    assert client.get('/stats/daily?day=2026-10-24').status_code == 401


def test_totals_subject_names_and_isolation(client):
    math, physics = subject(client), subject(client, 'Физика')
    other = subject(client, 'Чужая дисциплина', 202)
    seed(math, '2026-10-24T08:00:00', '2026-10-24T08:30:00')
    seed(math, '2026-10-24T09:00:00', '2026-10-24T09:15:00')
    seed(physics, '2026-10-24T10:00:00', '2026-10-24T10:20:00')
    seed(other, '2026-10-24T00:00:00', '2026-10-24T10:00:00')
    data = query(client).json()
    assert data['total_seconds'] == 3900
    assert data['subjects'] == [{'subject_id': math, 'subject_name': 'Математика', 'seconds': 2700}, {'subject_id': physics, 'subject_name': 'Физика', 'seconds': 1200}]
    assert query(client, uid=202).json()['total_seconds'] == 36000


def test_midnight_split_in_local_timezone(client):
    sid = subject(client)
    # 23:30–00:30 в Москве: по полчаса в каждый день.
    seed(sid, '2026-10-23T20:30:00', '2026-10-23T21:30:00')
    assert query(client, '2026-10-23', 'Europe/Moscow').json()['total_seconds'] == 1800
    assert query(client, '2026-10-24', 'Europe/Moscow').json()['total_seconds'] == 1800
    assert query(client, '2026-10-24', 'UTC').json()['total_seconds'] == 0


def test_active_session_and_future(client):
    sid = subject(client)
    seed(sid, '2026-10-23T23:00:00')
    assert query(client, '2026-10-23').json()['total_seconds'] == 3600
    assert query(client).json()['total_seconds'] == 12 * 3600
    assert query(client, '2026-10-25').json()['total_seconds'] == 0
    assert client.get('/sessions/active', headers=signed()).json()['ended_at'] is None


def test_exact_boundaries_and_multiday(client):
    sid = subject(client)
    seed(sid, '2026-10-20T12:00:00', '2026-10-23T00:00:00')
    assert query(client, '2026-10-21').json()['total_seconds'] == 86400
    assert query(client, '2026-10-23').json()['total_seconds'] == 0
    assert query(client, '2026-10-19').json()['total_seconds'] == 0


@pytest.mark.parametrize('day, start, end, hours', [
    ('2026-03-08', '2026-03-08T05:00:00', '2026-03-09T04:00:00', 23),
    ('2026-11-01', '2026-11-01T04:00:00', '2026-11-02T05:00:00', 25),
])
def test_dst_days(client, monkeypatch, day, start, end, hours):
    from app import stats
    monkeypatch.setattr(stats, 'utc_now', lambda: datetime(2026, 12, 1))
    sid = subject(client)
    seed(sid, start, end)
    assert query(client, day, 'America/New_York').json()['total_seconds'] == hours * 3600


def test_fractional_seconds_and_same_names(client):
    a, b = subject(client), subject(client)
    seed(a, '2026-10-24T08:00:00.000000', '2026-10-24T08:00:00.600000')
    seed(a, '2026-10-24T08:01:00.000000', '2026-10-24T08:01:00.600000')
    seed(b, '2026-10-24T09:00:00', '2026-10-24T09:00:02')
    data = query(client).json()
    assert data['total_seconds'] == 3
    assert [(row['subject_id'], row['seconds']) for row in data['subjects']] == [(b, 2), (a, 1)]


@pytest.mark.parametrize('params', [
    {'day': 'not-a-date'}, {'day': '2026-02-30'}, {},
    {'day': '2026-10-24', 'timezone': 'Invalid/Zone'},
    {'day': '2026-10-24', 'timezone': '../UTC'},
    {'day': '2026-10-24', 'timezone': ''},
    {'day': '9999-12-31'}, {'day': '0001-01-01'},
])
def test_invalid_queries(client, params):
    assert client.get('/stats/daily', params=params, headers=signed()).status_code == 422
