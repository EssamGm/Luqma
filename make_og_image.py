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
LEAF = (63, 143, 95)


def ar(text):
    return get_display(arabic_reshaper.reshape(text))


def font(path, size):
    return ImageFont.truetype(os.path.join(FONTS, path), size)


def draw_apple(img, cx, cy, r):
    draw = ImageDraw.Draw(img)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BG)

    notch_r = int(r * 0.3)
    draw.ellipse([cx - int(r*0.5) - notch_r, cy - r - int(r*0.07), cx - int(r*0.5) + notch_r, cy - r - int(r*0.07) + notch_r * 2], fill=CARD)
    draw.ellipse([cx + int(r*0.13) - notch_r, cy - r - int(r*0.07), cx + int(r*0.13) + notch_r, cy - r - int(r*0.07) + notch_r * 2], fill=CARD)

    bite_r = int(r * 0.57)
    bcx, bcy = cx + r - int(r*0.13), cy - r + int(r*0.3)
    draw.ellipse([bcx - bite_r, bcy - bite_r, bcx + bite_r, bcy + bite_r], fill=CARD)

    stem_w, stem_h = int(r*0.11), int(r*0.43)
    scx = cx - int(r*0.18)
    stem_top = cy - r - int(r*0.23)
    draw.rounded_rectangle([scx - stem_w // 2, stem_top, scx + stem_w // 2, stem_top + stem_h], radius=stem_w // 2, fill=BG)

    leaf_w, leaf_h = int(r*0.8), int(r*0.53)
    leaf = Image.new("RGBA", (leaf_w, leaf_h), (0, 0, 0, 0))
    ld = ImageDraw.Draw(leaf)
    ld.ellipse([0, 0, leaf_w, leaf_h], fill=LEAF)
    leaf = leaf.rotate(28, expand=True, resample=Image.BICUBIC)
    img.paste(leaf, (int(cx - r*0.07), int(stem_top - r*0.32)), leaf)


def build():
    img = Image.new("RGB", (W, H), BG)

    margin = 36
    card = Image.new("RGB", (W - margin * 2, H - margin * 2), CARD)
    img.paste(card, (margin, margin))
    draw = ImageDraw.Draw(img)

    # apple mark, top-right area (RTL "start" side)
    draw_apple(img, W - margin - 150, margin + 160, 110)

    title_font = font("tahomabd.ttf", 108)
    tagline_font = font("tahoma.ttf", 42)
    credit_font = font("tahomabd.ttf", 34)

    title = ar("لُقْمَة")
    tagline = ar("صوّر وجبتك، واعرف ما فيها من سعرات وعناصر غذائية")
    credit = ar("من عصام بالتعاون مع كلود")

    right_edge = W - margin - 80

    tb = draw.textbbox((0, 0), title, font=title_font)
    draw.text((right_edge - (tb[2] - tb[0]), 250), title, font=title_font, fill=INK)

    tb2 = draw.textbbox((0, 0), tagline, font=tagline_font)
    draw.text((right_edge - (tb2[2] - tb2[0]), 400), tagline, font=tagline_font, fill=INK_DIM)

    tb3 = draw.textbbox((0, 0), credit, font=credit_font)
    pad_x, pad_y = 28, 16
    bw, bh = (tb3[2] - tb3[0]) + pad_x * 2, (tb3[3] - tb3[1]) + pad_y * 2
    bx1 = right_edge - bw
    by1 = 480
    draw.rounded_rectangle([bx1, by1, bx1 + bw, by1 + bh], radius=bh // 2, fill=BG)
    draw.text((bx1 + pad_x, by1 + pad_y - tb3[1]), credit, font=credit_font, fill=(255, 255, 255))

    img.save(os.path.join(BASE, "icons", "og-image.png"), quality=92)
    print("saved og-image.png", img.size)


build()
