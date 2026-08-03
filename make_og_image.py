import os
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

BASE = os.path.dirname(os.path.abspath(__file__))
FONTS = "C:/Windows/Fonts/"

W, H = 1200, 630
BG = (226, 169, 58)
INK = (255, 255, 255)

reshaper = arabic_reshaper.ArabicReshaper(configuration={"delete_harakat": False})


def ar(text):
    return get_display(reshaper.reshape(text))


def build():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Just the wordmark — Telegram/WhatsApp/etc. already render og:title and
    # og:description as their own text next to this image, so repeating the
    # tagline/credit here just duplicates what the platform already shows.
    text = ar("لُقْمَة")
    title_font = ImageFont.truetype(os.path.join(FONTS, "tahomabd.ttf"), 220)
    bbox = draw.textbbox((0, 0), text, font=title_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (W - tw) / 2 - bbox[0]
    y = (H - th) / 2 - bbox[1]
    draw.text((x, y), text, font=title_font, fill=INK)

    out_path = os.path.join(BASE, "icons", "og-share.png")
    img.save(out_path, quality=92)
    print("saved", out_path, img.size)


build()
