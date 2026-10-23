import pytest
from test_auth import client, signed


def subject(client, user=101):
    return client.post('/subjects', headers=signed(user), json={'name': 'Математика'}).json()['id']


def create(client, sid, user=101, **changes):
    data = {'subject_id': sid, 'title': ' Сдать работу ', 'due_at': '2026-11-01T18:00:00+03:00'}
    data.update(changes)
    return client.post('/deadlines', headers=signed(user), json=data)


def test_lifecycle(client):
    sid = subject(client)
    r = create(client, sid)
    assert r.status_code == 201
    item = r.json()
    assert item['title'] == 'Сдать работу' and item['due_at'] == '2026-11-01T15:00:00Z'
    path = f"/deadlines/{item['id']}"
    assert client.get(path, headers=signed()).json() == item
    assert client.get('/deadlines', headers=signed()).json() == [item]
    r = client.patch(path, headers=signed(), json={'title': 'Экзамен', 'done': True, 'due_at': '2026-11-02T12:00:00Z'})
    assert r.status_code == 200 and r.json()['done'] is True
    assert client.get('/deadlines?done=false', headers=signed()).json() == []
    assert len(client.get('/deadlines?done=true', headers=signed()).json()) == 1
    assert client.patch(path, headers=signed(), json={'done': False}).json()['done'] is False
    assert client.delete(path, headers=signed()).status_code == 204
    assert client.get(path, headers=signed()).status_code == 404
    assert client.get('/deadlines', headers=signed()).json() == []


def test_ownership(client):
    a, b = subject(client), subject(client, 202)
    assert create(client, a, 202).status_code == 404
    item = create(client, a).json()
    path = f"/deadlines/{item['id']}"
    assert client.get('/deadlines', headers=signed(202)).json() == []
    assert client.get(f'/deadlines?subject_id={a}', headers=signed(202)).status_code == 404
    for method, data in [('get', None), ('patch', {'done': True}), ('delete', None)]:
        assert client.request(method, path, headers=signed(202), json=data).status_code == 404
    assert client.patch(path, headers=signed(), json={'subject_id': b}).status_code == 404
    assert client.get(path, headers=signed()).json()['subject_id'] == a
    c = subject(client)
    assert client.patch(path, headers=signed(), json={'subject_id': c}).json()['subject_id'] == c


@pytest.mark.parametrize('changes', [{'title': ''}, {'title': ' '}, {'title': 'a'*201}, {'due_at': '2026-11-01T12:00:00'}, {'due_at': 'bad'}, {'subject_id': 0}, {'user_id': 202}])
def test_invalid_create(client, changes):
    assert create(client, subject(client), **changes).status_code == 422


@pytest.mark.parametrize('changes', [{}, {'done': None}, {'subject_id': None}, {'title': None}, {'due_at': None}, {'title': ' '}, {'due_at': '2026-11-01'}, {'id': 99}])
def test_invalid_patch(client, changes):
    item = create(client, subject(client)).json()
    assert client.patch(f"/deadlines/{item['id']}", headers=signed(), json=changes).status_code == 422


def test_auth_paging_and_sort(client):
    sid = subject(client)
    later = create(client, sid).json()
    earlier = create(client, sid, due_at='2026-10-25T10:00:00Z').json()
    assert client.get('/deadlines?limit=1', headers=signed()).json() == [earlier]
    assert client.get('/deadlines?limit=1&offset=1', headers=signed()).json() == [later]
    assert client.get('/deadlines?limit=201', headers=signed()).status_code == 422
    for method, path, body in [('get', '/deadlines', None), ('get', '/deadlines/1', None), ('post', '/deadlines', {'subject_id': sid, 'title': 'test', 'due_at': '2026-11-01T00:00:00Z'}), ('patch', '/deadlines/1', {'done': True}), ('delete', '/deadlines/1', None)]:
        assert client.request(method, path, json=body).status_code == 401
    assert create(client, 999999).status_code == 404


def test_database_persistence_and_migration(tmp_path):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, text
    path = tmp_path / 'persist.db'
    engine = create_engine(f'sqlite:///{path}')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    config.attributes['connection'] = engine
    command.upgrade(config, '002_users')
    with engine.begin() as db:
        db.execute(text("INSERT INTO users (id, telegram_id, name) VALUES (1, 101, 'Студент')"))
        db.execute(text("INSERT INTO subjects (id, name, user_id) VALUES (1, 'Физика', 1)"))
    command.upgrade(config, 'head')
    with engine.begin() as db:
        assert db.execute(text('SELECT user_id FROM subjects')).scalar() == 1
        db.execute(text("INSERT INTO deadlines (subject_id, title, due_at, done) VALUES (1, 'Экзамен', '2026-11-01 12:00:00', 0)"))
    engine.dispose()
    reopened = create_engine(f'sqlite:///{path}')
    with reopened.connect() as db:
        assert db.execute(text('SELECT title FROM deadlines')).scalar() == 'Экзамен'
    reopened.dispose()
