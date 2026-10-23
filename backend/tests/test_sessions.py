from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier

import pytest
from sqlalchemy import create_engine, text
from test_auth import client, signed


def subject(client, uid=101):
    return client.post('/subjects', headers=signed(uid), json={'name': 'Математика'}).json()['id']


def start(client, sid, uid=101):
    return client.post('/sessions/start', headers=signed(uid), json={'subject_id': sid})


def test_timer_lifecycle(client, monkeypatch):
    from app import sessions
    now = datetime(2026, 10, 22, 10)
    monkeypatch.setattr(sessions, 'utc_now', lambda: now)
    sid = subject(client)
    assert client.get('/sessions/active', headers=signed()).json() is None
    r = start(client, sid)
    assert r.status_code == 201
    item = r.json()
    assert item['started_at'] == '2026-10-22T10:00:00Z'
    assert item['duration_seconds'] == 0 and item['ended_at'] is None
    path = f"/sessions/{item['id']}"
    now += timedelta(minutes=25, seconds=15)
    assert client.get('/sessions/active', headers=signed()).json()['duration_seconds'] == 1515
    stopped = client.post(path + '/stop', headers=signed()).json()
    assert stopped['duration_seconds'] == 1515
    assert client.get('/sessions/active', headers=signed()).json() is None
    now += timedelta(hours=1)
    assert client.post(path + '/stop', headers=signed()).json() == stopped
    assert client.get(path, headers=signed()).json() == stopped
    second = start(client, sid).json()
    client.post(path + '/stop', headers=signed())
    assert client.get('/sessions/active', headers=signed()).json()['id'] == second['id']
    assert client.get('/sessions?completed=true', headers=signed()).json() == [stopped]
    assert len(client.get('/sessions?completed=false', headers=signed()).json()) == 1


def test_ownership_and_duplicate_start(client):
    a, b = subject(client), subject(client, 202)
    assert start(client, b).status_code == 404
    item = start(client, a).json()
    assert start(client, a).status_code == 409
    assert start(client, subject(client)).status_code == 409
    assert start(client, b, 202).status_code == 201
    path = f"/sessions/{item['id']}"
    assert client.get(path, headers=signed(202)).status_code == 404
    assert client.post(path + '/stop', headers=signed(202)).status_code == 404
    assert client.get(f'/sessions?subject_id={a}', headers=signed(202)).status_code == 404
    assert all(row['subject_id'] == b for row in client.get('/sessions', headers=signed(202)).json())
    assert client.get('/sessions/999999', headers=signed()).status_code == 404
    assert client.post('/sessions/999999/stop', headers=signed()).status_code == 404
    assert start(client, 999999).status_code == 404


@pytest.mark.parametrize('data', [{}, {'subject_id': 0}, {'subject_id': None}, {'subject_id': 1, 'user_id': 202}, {'subject_id': 1, 'started_at': '2020-01-01'}])
def test_invalid_input(client, data):
    assert client.post('/sessions/start', headers=signed(), json=data).status_code == 422


def test_auth_and_paging(client, monkeypatch):
    from app import sessions
    monkeypatch.setattr(sessions, 'utc_now', lambda: datetime(2026, 10, 22, 10))
    sid = subject(client)
    first = start(client, sid).json()
    client.post(f"/sessions/{first['id']}/stop", headers=signed())
    second = start(client, sid).json()
    assert client.get('/sessions?limit=1', headers=signed()).json()[0]['id'] == second['id']
    assert client.get('/sessions?limit=1&offset=1', headers=signed()).json()[0]['id'] == first['id']
    assert client.get('/sessions?limit=201', headers=signed()).status_code == 422
    for method, path, data in [('get', '/sessions', None), ('get', '/sessions/active', None), ('get', '/sessions/1', None), ('post', '/sessions/start', {'subject_id': sid}), ('post', '/sessions/1/stop', None)]:
        assert client.request(method, path, json=data).status_code == 401


def test_two_simultaneous_starts(client, monkeypatch):
    from app import sessions
    sid = subject(client)
    barrier = Barrier(2)
    original = sessions.active_session
    def synchronized(db, uid):
        result = original(db, uid)
        if result is None:
            barrier.wait(timeout=10)
        return result
    monkeypatch.setattr(sessions, 'active_session', synchronized)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: start(client, sid).status_code, range(2)))
    assert sorted(results) == [201, 409]
    assert len(client.get('/sessions', headers=signed()).json()) == 1


def test_clock_adjustment_and_midnight(client, monkeypatch):
    from app import sessions
    now = datetime(2026, 10, 22, 23, 50)
    monkeypatch.setattr(sessions, 'utc_now', lambda: now)
    sid = subject(client)
    item = start(client, sid).json()
    now += timedelta(minutes=20)
    assert client.post(f"/sessions/{item['id']}/stop", headers=signed()).json()['duration_seconds'] == 1200
    item = start(client, sid).json()
    now -= timedelta(minutes=5)
    r = client.post(f"/sessions/{item['id']}/stop", headers=signed())
    assert r.status_code == 200 and r.json()['duration_seconds'] == 0


def test_restart_and_upgrade(tmp_path):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    from sqlalchemy.orm import sessionmaker
    from app.models import User
    from app.sessions import get_active_session, stop_session
    engine = create_engine(f'sqlite:///{tmp_path / "persist.db"}')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    config.attributes['connection'] = engine
    command.upgrade(config, '003_deadlines')
    with engine.begin() as db:
        db.execute(text("INSERT INTO users VALUES (1, 101, 'Студент')"))
        db.execute(text("INSERT INTO subjects (id, name, user_id) VALUES (1, 'Физика', 1)"))
        db.execute(text("INSERT INTO deadlines VALUES (1, 1, 'Работа', '2026-11-01 12:00:00', 0)"))
    command.upgrade(config, 'head')
    with engine.begin() as db:
        db.execute(text("INSERT INTO study_sessions (user_id, subject_id, started_at) VALUES (1, 1, '2026-10-01 12:00:00')"))
    url = engine.url
    engine.dispose()
    reopened = create_engine(url)
    with sessionmaker(reopened)() as db:
        user = db.get(User, 1)
        assert get_active_session(db, user).id == 1
        assert stop_session(1, db, user).ended_at is not None
        assert db.execute(text('SELECT title FROM deadlines')).scalar() == 'Работа'
    reopened.dispose()
