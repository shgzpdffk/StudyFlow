# StudyFlow: бот и авторизация

Python 3.10+. Все команды выполняются из backend с активным .venv.

```bash
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m uvicorn app.main:app --reload
```

## Токен и запуск бота

Скопируйте .env.example в .env, если .env еще нет. Вставьте токен BotFather
в BOT_TOKEN только в .env. Не вставляйте его в Python-код, чат или команды Git.
.env исключен из Git; .env.example содержит только пустые значения.

В другом терминале из backend:

```bash
source .venv/bin/activate
python -m app.bot.main
```

Отправьте /start в личном чате с ботом. Он сохранит пользователя и ответит.
WEBAPP_URL можно оставить пустым. После размещения фронтенда укажите его
публичный HTTPS-адрес: бот начнет показывать кнопку Mini App.

## API и авторизация

GET /health — публичная проверка. GET /me, GET /subjects и POST /subjects
требуют заголовок Authorization: tma <initData>.
Фронтенд получает initData из Telegram.WebApp.initData и передает серверу.
Токен бота на фронтенд НЕ передается. Сервер проверяет подпись и срок данных
(по умолчанию один час). После истечения нужно заново открыть Mini App.
В /docs есть Authorize для ввода заголовка; без настоящего initData запросы
профиля и дисциплин отклоняются. Полноценный вход проверяется после подключения Mini App.

## Структура

- app/config.py — настройки из .env, токен скрыт типом SecretStr.
- app/auth.py — проверка Telegram и определение текущего пользователя.
- app/users.py — поиск или создание пользователя для бота и API.
- app/bot/main.py — /start, кнопка и long polling.
- app/database.py — подключение и сессии SQLite.
- app/models.py — таблицы users и subjects.
- app/main.py — HTTP-запросы. user_id назначает сервер, не клиент.
- migrations — история изменения структуры базы.

Таблицы теперь создаются через Alembic, а не при запуске API.
Перед обновлением существующей базы остановите приложение и сделайте копию.
Первая миграция поддерживает старую учебную таблицу subjects. Старые записи
остаются с user_id=NULL: они сохранены, но не выдаются ни одному пользователю.
Новые записи всегда получают владельца. База и ее копии не публикуются в Git.

Для дальнейших изменений моделей:

```bash
python -m alembic revision --autogenerate -m "describe schema change"
# Просмотрите сгенерированную миграцию перед применением.
python -m alembic upgrade head
```

## Тесты без настоящего токена и без обращения к Telegram

```bash
python -m pip install -r requirements-dev.txt
python -m pytest tests -q
```

Проверяются подпись, срок авторизации, разделение данных двух пользователей,
миграция старой базы и обработчик /start. Используются временные базы.


## Учебные сессии

POST /sessions/start принимает subject_id. GET /sessions/active восстанавливает
текущий таймер. POST /sessions/{id}/stop останавливает занятие; повтор безопасен.
GET /sessions и GET /sessions/{id} возвращают историю и отдельную сессию.
Только собственные данные, один активный таймер на пользователя, даты в UTC.
Подробнее — раздел «Учебные сессии и таймер» основного README.
Перед запуском примените миграцию: python -m alembic upgrade head.


## Дневная статистика

GET /stats/daily?day=2026-10-24&timezone=Europe/Moscow возвращает total_seconds
и разбивку subjects по дисциплинам текущего пользователя. Авторизация обязательна.
Часовой пояс по умолчанию UTC. Учитываются занятия через полночь, перевод часов
и активная сессия до момента запроса. Новая миграция не нужна.
Установите обновленные requirements.txt (добавлена tzdata) и перезапустите сервер.
Подробный контракт и пример ответа — в основном README.
