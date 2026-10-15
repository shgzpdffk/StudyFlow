import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.orm import Session
from .config import settings
from .database import get_db
from .users import get_or_create_user

# В /docs появится Authorize. Значение заголовка: tma <initData>.
auth_header = APIKeyHeader(name="Authorization", auto_error=False)


class TelegramUser(BaseModel):
    model_config = ConfigDict(strict=True)
    id: int = Field(gt=0, le=9223372036854775807)
    first_name: str = Field(min_length=1, max_length=100)


def validate_init_data(raw: str) -> TelegramUser:
    token = settings.bot_token.get_secret_value()
    if not token:
        raise HTTPException(503, "Авторизация Telegram пока не настроена")
    try:
        if len(raw) > 16384:
            raise ValueError()
        pairs = parse_qsl(raw, strict_parsing=True)
        fields = dict(pairs)
        if len(fields) != len(pairs):
            raise ValueError()
        supplied_hash = fields.pop("hash")
        # Проверяем подпись всех полей, кроме самого hash, по алгоритму Telegram.
        check_string = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
        secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
        expected = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, supplied_hash):
            raise ValueError()
        age = time.time() - int(fields["auth_date"])
        if age < -30 or age > settings.init_data_max_age:
            raise ValueError()
        return TelegramUser.model_validate(json.loads(fields["user"]))
    except (ValueError, KeyError, TypeError, ValidationError):
        # Не включаем исходные данные или секреты в текст ошибки.
        raise HTTPException(401, "Откройте Mini App заново через Telegram") from None


def current_user(authorization: str | None = Depends(auth_header), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("tma "):
        raise HTTPException(401, "Нужна авторизация Telegram")
    profile = validate_init_data(authorization[4:])
    return get_or_create_user(db, profile.id, profile.first_name)
