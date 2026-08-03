import os
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "icons")
os.makedirs(OUT, exist_ok=True)
FONTS = "C:/Windows/Fonts/"

BG = (226, 169, 58)     # brand amber
INK = (255, 255, 255)   # white wordmark for max contrast at small sizes

SIZE = 1024

reshaper = arabic_reshaper.ArabicReshaper(configuration={"delete_harakat": False})


def ar(text):
    return get_display(reshaper.reshape(text))


def draw_master():
    img = Image.new("RGB", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)

    text = ar("لُقْمَة")
    font = ImageFont.truetype(os.path.join(FONTS, "tahomabd.ttf"), 340)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (SIZE - tw) / 2 - bbox[0]
    y = (SIZE - th) / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=INK)

    return img


master = draw_master()

master.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-512.png"))
master.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, "icon-192.png"))
master.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, "apple-touch-icon.png"))

print("done")
