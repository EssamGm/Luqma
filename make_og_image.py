import os
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

BASE = os.path.dirname(os.path.abspath(__file__))
FONTS = "C:/Windows/Fonts/"

W, H = 1200, 630

BG = (226, 169, 58)
CARD = (255, 255, 255)
INK = (32, 36, 29)
INK_DIM = (91, 99, 85)

reshaper = arabic_reshaper.ArabicReshaper(configuration={"delete_harakat": False})


def ar(text):
    return get_display(reshaper.reshape(text))


def font(path, size):
    return ImageFont.truetype(os.path.join(FONTS, path), size)


def build():
    img = Image.new("RGB", (W, H), BG)

    margin = 36
    card = Image.new("RGB", (W - margin * 2, H - margin * 2), CARD)
    img.paste(card, (margin, margin))
    draw = ImageDraw.Draw(img)

    title_font = font("tahomabd.ttf", 130)
    tagline_font = font("tahoma.ttf", 44)
    credit_font = font("tahomabd.ttf", 36)

    title = ar("لُقْمَة")
    tagline = ar("صوّر وجبتك، واعرف ما فيها من سعرات وعناصر غذائية")
    credit = ar("من عصام بالتعاون مع كلود")

    right_edge = W - margin - 90

    tb = draw.textbbox((0, 0), title, font=title_font)
    title_y = 175
    draw.text((right_edge - (tb[2] - tb[0]), title_y - tb[1]), title, font=title_font, fill=INK)

    tb2 = draw.textbbox((0, 0), tagline, font=tagline_font)
    tag_y = 380
    draw.text((right_edge - (tb2[2] - tb2[0]), tag_y - tb2[1]), tagline, font=tagline_font, fill=INK_DIM)

    tb3 = draw.textbbox((0, 0), credit, font=credit_font)
    pad_x, pad_y = 30, 18
    bw, bh = (tb3[2] - tb3[0]) + pad_x * 2, (tb3[3] - tb3[1]) + pad_y * 2
    bx1 = right_edge - bw
    by1 = 460
    draw.rounded_rectangle([bx1, by1, bx1 + bw, by1 + bh], radius=bh // 2, fill=BG)
    draw.text((bx1 + pad_x, by1 + pad_y - tb3[1]), credit, font=credit_font, fill=(255, 255, 255))

    img.save(os.path.join(BASE, "icons", "og-image.png"), quality=92)
    print("saved og-image.png", img.size)


build()
