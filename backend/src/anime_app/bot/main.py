"""Minimal Telegram bot that opens the Mini App.

The bot deliberately contains no business logic: it only reacts to the
``/start`` and ``/help`` commands and offers a button that opens the Mini App
configured through ``TELEGRAM_WEBAPP_URL``.
"""

from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardButtonWebAppInfo,
    InlineKeyboardMarkup,
    Message,
)

from anime_app.config import Settings, get_settings

__all__ = ["build_dispatcher", "main", "run"]

logger = logging.getLogger(__name__)

HELP_TEXT = (
    "Anime Watch — поиск и просмотр аниме прямо в Telegram.\n\n"
    "Команды:\n"
    "/start — открыть приложение\n"
    "/help — список команд\n"
    "/catalog — открыть каталог в приложении"
)


def build_dispatcher(webapp_url: str) -> Dispatcher:
    """Build the bot dispatcher.

    Args:
        webapp_url: Public URL of the Mini App.

    Returns:
        A configured dispatcher.
    """
    dispatcher = Dispatcher()
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Открыть приложение",
                    web_app=InlineKeyboardButtonWebAppInfo(url=webapp_url),
                )
            ]
        ]
    )

    @dispatcher.message(CommandStart())
    async def _start(message: Message) -> None:
        """Open the Mini App."""
        await message.answer(
            "Привет! Открываю приложение Anime Watch.",
            reply_markup=keyboard,
        )

    @dispatcher.message(Command("help"))
    async def _help(message: Message) -> None:
        """Show the list of commands."""
        await message.answer(HELP_TEXT)

    @dispatcher.message(Command("catalog"))
    async def _catalog(message: Message) -> None:
        """Open the Mini App from the catalogue command."""
        await message.answer("Каталог доступен в приложении.", reply_markup=keyboard)

    @dispatcher.message(F.text)
    async def _fallback(message: Message) -> None:
        """Answer any other text with a hint."""
        await message.answer(HELP_TEXT)

    return dispatcher


async def main() -> None:
    """Run the bot using long polling."""
    settings: Settings = get_settings()
    token = settings.telegram_token_value
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN is not configured: the bot cannot start")
        return
    if not settings.telegram_webapp_url:
        logger.error("TELEGRAM_WEBAPP_URL is not configured: the bot cannot start")
        return

    bot = Bot(token=token, default=DefaultBotProperties(parse_mode=None))
    dispatcher = build_dispatcher(settings.telegram_webapp_url)
    await bot.set_my_commands(
        [
            BotCommand(command="start", description="Открыть приложение"),
            BotCommand(command="catalog", description="Открыть каталог"),
            BotCommand(command="help", description="Список команд"),
        ]
    )
    logger.info("bot started, mini app url: %s", settings.telegram_webapp_url)
    try:
        await dispatcher.start_polling(bot)
    finally:
        await bot.session.close()


def run() -> None:
    """Console entry point of the bot."""
    asyncio.run(main())


if __name__ == "__main__":  # pragma: no cover
    run()
