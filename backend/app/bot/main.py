import asyncio
from urllib.parse import urlparse
from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo
from ..config import settings
from ..database import SessionLocal
from ..users import get_or_create_user


def register_user(telegram_id: int, name: str):
    with SessionLocal() as db:
        get_or_create_user(db, telegram_id, name)


def mini_app_keyboard():
    # Пока фронтенд не размещен, бот работает без кнопки открытия.
    if not settings.webapp_url:
        return None
    url = urlparse(settings.webapp_url)
    if url.scheme != "https" or not url.hostname:
        raise ValueError("WEBAPP_URL должен быть публичным HTTPS-адресом")
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Открыть StudyFlow", web_app=WebAppInfo(url=settings.webapp_url))
    ]])


dp = Dispatcher()


@dp.message(CommandStart())
async def start(message: Message):
    if message.chat.type != "private" or message.from_user is None:
        await message.answer("Откройте личный чат со мной и отправьте /start.")
        return
    # Синхронная работа с SQLite не блокирует обработку других сообщений.
    await asyncio.to_thread(register_user, message.from_user.id, message.from_user.first_name)
    keyboard = mini_app_keyboard()
    text = "Привет! Это StudyFlow — твои дедлайны и время учебы в одном месте."
    if keyboard is None:
        text += " Mini App пока в разработке."
    await message.answer(text, reply_markup=keyboard)


async def main():
    token = settings.bot_token.get_secret_value()
    if not token:
        raise RuntimeError("Заполните BOT_TOKEN в backend/.env")
    mini_app_keyboard()
    async with Bot(token=token) as bot:
        await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
