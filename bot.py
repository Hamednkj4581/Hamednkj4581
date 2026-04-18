import asyncio
import logging
import os
from io import BytesIO
from typing import List
from urllib.parse import parse_qs, urlparse

import zxingcpp
from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import Message
from dotenv import load_dotenv
from PIL import Image


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


def decode_qr_codes(image_bytes: bytes) -> List[str]:
    """Decode one or more QR codes from image bytes."""
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.load()
            barcodes = zxingcpp.read_barcodes(
                image, formats=zxingcpp.BarcodeFormat.QRCode
            )
    except (OSError, ValueError) as exc:
        raise ValueError("无法读取图片，请确认图片格式是否正确。") from exc

    seen: set[str] = set()
    results: List[str] = []
    for barcode in barcodes:
        text = (barcode.text or "").strip()
        if text and text not in seen:
            seen.add(text)
            results.append(text)
    return results


def extract_totp_secret(content: str) -> str | None:
    """Extract secret from otpauth://totp URI."""
    try:
        parsed = urlparse(content)
    except Exception:
        return None

    if parsed.scheme.lower() != "otpauth":
        return None
    if parsed.netloc.lower() != "totp":
        return None

    query = parse_qs(parsed.query, keep_blank_values=False)
    secrets = query.get("secret")
    if not secrets:
        return None

    secret = secrets[0].strip()
    return secret or None


_IMAGE_DOCUMENT = (
    F.document & F.document.mime_type & F.document.mime_type.startswith("image/")
)


async def start(message: Message) -> None:
    await message.answer(
        "你好！请发送一张包含二维码的图片。\n"
        "我会自动识别二维码并把内容回复给你。"
    )


async def help_command(message: Message) -> None:
    await message.answer(
        "使用方式：\n"
        "1) 直接发送图片（相册/拍照）\n"
        "2) 或发送图片文件（document）\n\n"
        "我会返回识别到的二维码内容。"
    )


async def handle_image(message: Message, bot: Bot) -> None:
    image_buffer = BytesIO()
    if message.photo:
        await bot.download(message.photo[-1], destination=image_buffer)
    elif message.document:
        await bot.download(message.document, destination=image_buffer)
    else:
        return

    image_bytes = image_buffer.getvalue()

    try:
        qr_contents = decode_qr_codes(image_bytes)
    except Exception as exc:
        logger.exception("二维码识别失败: %s", exc)
        await message.answer("识别失败：图片无法处理，请换一张更清晰的图片再试。")
        return

    if not qr_contents:
        await message.answer("没有识别到二维码，请发送更清晰或完整的二维码图片。")
        return

    lines = [f"{idx}. {text}" for idx, text in enumerate(qr_contents, start=1)]
    await message.answer("识别结果：\n" + "\n".join(lines))

    secret_lines = []
    for idx, text in enumerate(qr_contents, start=1):
        secret = extract_totp_secret(text)
        if secret:
            secret_lines.append(f"{idx}. {secret}")

    if secret_lines:
        await message.answer("检测到 TOTP 秘钥：\n" + "\n".join(secret_lines))


async def handle_unsupported(message: Message) -> None:
    await message.answer("请发送图片，我会帮你解析二维码。")


async def main() -> None:
    load_dotenv()
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("缺少 TELEGRAM_BOT_TOKEN 环境变量，请先配置后再运行。")

    bot = Bot(token=token)
    dp = Dispatcher()

    dp.message.register(start, Command("start"))
    dp.message.register(help_command, Command("help"))
    dp.message.register(handle_image, F.photo)
    dp.message.register(handle_image, _IMAGE_DOCUMENT)
    dp.message.register(
        handle_unsupported,
        ~F.photo & ~_IMAGE_DOCUMENT & ~(F.text & F.text.startswith("/")),
    )

    logger.info("Bot is running...")
    await dp.start_polling(bot, drop_pending_updates=True)


if __name__ == "__main__":
    asyncio.run(main())
