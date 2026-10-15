import hashlib
import hmac
import json
import time
from pathlib import Path
from urllib.parse import urlencode
from unittest.mock import AsyncMock

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.auth import current_user
from app.config import settings
from app.database import get_db
from app.main import app

TOKEN = '123456789:TEST_ONLY_NOT_A_REAL_TOKEN_abcdefgh'


def signed(user_id=101, age=0, **extra):
    fields = {'auth_date': str(int(time.time()) - age), 'user': json.dumps({'id': user_id, 'first_name': 'Студент'})}
    fields.update(extra)
    data = '\n'.join(f'{k}={v}' for k, v in sorted(fields.items()))
    secret = hmac.new(b'WebAppData', TOKEN.encode(), hashlib.sha256).digest()
    fields['hash'] = hmac.new(secret, data.encode(), hashlib.sha256).hexdigest()
    return {'Authorization': 'tma ' + urlencode(fields)}


def migrate(engine):
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    config.attributes['connection'] = engine
    command.upgrade(config, 'head')


@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{tmp_path / "test.db"}', connect_args={'check_same_thread': False})
    migrate(engine)
    sessions = sessionmaker(engine)
    def override_db():
        with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(settings, 'bot_token', SecretStr(TOKEN))
    with TestClient(app) as result:
        yield result
    app.dependency_overrides.clear()
    engine.dispose()


def test_user_isolation(client):
    assert client.get('/subjects').status_code == 401
    a, b = signed(101), signed(202)
    assert client.post('/subjects', headers=a, json={'name': 'Математика', 'user_id': 202}).status_code == 201
    assert len(client.get('/subjects', headers=a).json()) == 1
    assert client.get('/subjects', headers=b).json() == []
    assert client.get('/me', headers=a).json()['telegram_id'] == 101
    assert client.post('/subjects', headers=a, json={'name': ' '}).status_code == 422
    assert 'bot_token' not in client.get('/me', headers=a).text


@pytest.mark.parametrize('headers', [signed(age=4000), signed(age=-120), {'Authorization': 'tma invalid'}, signed(user_id=-1), signed(user_id=True)])
def test_invalid_auth(client, headers):
    assert client.get('/subjects', headers=headers).status_code == 401


def test_tampering_and_duplicates(client):
    headers = signed()
    headers['Authorization'] = headers['Authorization'].replace('101', '999')
    assert client.get('/me', headers=headers).status_code == 401
    headers = signed()
    headers['Authorization'] += '&auth_date=1'
    assert client.get('/me', headers=headers).status_code == 401


def test_missing_token(client, monkeypatch):
    monkeypatch.setattr(settings, 'bot_token', SecretStr(''))
    assert client.get('/me', headers=signed()).status_code == 503


def test_existing_database_migration(tmp_path):
    engine = create_engine(f'sqlite:///{tmp_path / "legacy.db"}')
    with engine.begin() as db:
        db.execute(text('CREATE TABLE subjects (id INTEGER PRIMARY KEY, name VARCHAR(80) NOT NULL)'))
        db.execute(text("INSERT INTO subjects VALUES (1, 'Математика')"))
    migrate(engine)
    migrate(engine)
    with engine.connect() as db:
        assert db.execute(text('SELECT name, user_id FROM subjects')).one() == ('Математика', None)
    engine.dispose()


def test_start_handler(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from app.bot import main as bot_module
    calls = []
    monkeypatch.setattr(bot_module, 'register_user', lambda uid, name: calls.append((uid, name)))
    monkeypatch.setattr(settings, 'webapp_url', '')
    message = SimpleNamespace(chat=SimpleNamespace(type='private'), from_user=SimpleNamespace(id=101, first_name='Студент'), answer=AsyncMock())
    asyncio.run(bot_module.start(message))
    assert calls == [(101, 'Студент')]
    message.answer.assert_awaited_once()
    monkeypatch.setattr(settings, 'webapp_url', 'https://example.com')
    assert bot_module.mini_app_keyboard().inline_keyboard[0][0].web_app.url == 'https://example.com'
