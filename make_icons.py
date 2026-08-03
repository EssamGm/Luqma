import os
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "icons")
os.makedirs(OUT, exist_ok=True)
FONTS = "C:/Windows/Fonts/"

BG = (226, 169, 58)     # brand amber
INK = (32, 36, 29)      # dark ink — amber is a light color, so dark-on-amber
                        # reads far crisper at small sizes than white-on-amber did

SIZE = 1024
TARGET_WIDTH = 660      # keep clear margin from the edges (iOS masks corners more
                        # aggressively than Android, and it just looks calmer)

reshaper = arabic_reshaper.ArabicReshaper(configuration={"delete_harakat": False})


def ar(text):
    return get_display(reshaper.reshape(text))


def draw_master():
    img = Image.new("RGB", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)

    text = ar("لقمة")

    # Measure at a reference size, then scale to hit TARGET_WIDTH exactly —
    # keeps a consistent, predictable safety margin from the edges.
    ref_size = 340
    ref_font = ImageFont.truetype(os.path.join(FONTS, "tahomabd.ttf"), ref_size)
    ref_bbox = draw.textbbox((0, 0), text, font=ref_font)
    ref_width = ref_bbox[2] - ref_bbox[0]
    font_size = round(ref_size * (TARGET_WIDTH / ref_width))

    font = ImageFont.truetype(os.path.join(FONTS, "tahomabd.ttf"), font_size)
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
