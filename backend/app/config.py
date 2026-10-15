from pathlib import Path
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    # SecretStr скрывает токен при обычном выводе настроек.
    bot_token: SecretStr = SecretStr("")
    webapp_url: str = ""
    database_url: str = f"sqlite:///{ROOT / 'studyflow.db'}"
    init_data_max_age: int = Field(default=3600, ge=60, le=86400)
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")


settings = Settings()
