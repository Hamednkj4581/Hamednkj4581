import logging
import os
from io import BytesIO
from typing import List

import cv2
import numpy as np
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


def decode_qr_codes(image_bytes: bytes) -> List[str]:
    """Decode one or more QR codes from image bytes."""
    data = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("无法读取图片，请确认图片格式是否正确。")

    detector = cv2.QRCodeDetector()
    ok, decoded_info, _, _ = detector.detectAndDecodeMulti(image)

    if ok and decoded_info:
        results = [text.strip() for text in decoded_info if text and text.strip()]
        if results:
            return results

    single = detector.detectAndDecode(image)[0].strip()
    return [single] if single else []


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "你好！请发送一张包含二维码的图片。\n"
        "我会自动识别二维码并把内容回复给你。"
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "使用方式：\n"
        "1) 直接发送图片（相册/拍照）\n"
        "2) 或发送图片文件（document）\n\n"
        "我会返回识别到的二维码内容。"
    )


async def handle_image(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    if message is None:
        return

    telegram_file = None
    if message.photo:
        telegram_file = await message.photo[-1].get_file()
    elif message.document and message.document.mime_type and message.document.mime_type.startswith("image/"):
        telegram_file = await message.document.get_file()

    if telegram_file is None:
        return

    image_buffer = BytesIO()
    await telegram_file.download_to_memory(out=image_buffer)
    image_bytes = image_buffer.getvalue()

    try:
        qr_contents = decode_qr_codes(image_bytes)
    except Exception as exc:
        logger.exception("二维码识别失败: %s", exc)
        await message.reply_text("识别失败：图片无法处理，请换一张更清晰的图片再试。")
        return

    if not qr_contents:
        await message.reply_text("没有识别到二维码，请发送更清晰或完整的二维码图片。")
        return

    lines = [f"{idx}. {text}" for idx, text in enumerate(qr_contents, start=1)]
    await message.reply_text("识别结果：\n" + "\n".join(lines))


async def handle_unsupported(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message:
        await update.message.reply_text("请发送图片，我会帮你解析二维码。")


def main() -> None:
    load_dotenv()
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("缺少 TELEGRAM_BOT_TOKEN 环境变量，请先配置后再运行。")

    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(MessageHandler(filters.PHOTO, handle_image))
    app.add_handler(
        MessageHandler(
            filters.Document.IMAGE,
            handle_image,
        )
    )
    app.add_handler(MessageHandler(~(filters.PHOTO | filters.Document.IMAGE | filters.COMMAND), handle_unsupported))

    logger.info("Bot is running...")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
