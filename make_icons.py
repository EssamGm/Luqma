from PIL import Image, ImageDraw
import os

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "icons")
os.makedirs(OUT, exist_ok=True)

BG = (226, 169, 58, 255)       # brand amber
WHITE = (255, 255, 255, 255)
LEAF = (63, 143, 95, 255)      # brand "good" green, for the leaf only

SIZE = 1024


def draw_master():
    img = Image.new("RGBA", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)

    cx, cy = SIZE // 2, SIZE // 2 + 40
    r = 300

    # apple body — a plain circle read clearly at any size
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)

    # top "dip" notch (two small cut circles either side of the stem)
    notch_r = 90
    draw.ellipse([cx - 150 - notch_r, cy - r - 20, cx - 150 + notch_r, cy - r - 20 + notch_r * 2], fill=BG)
    draw.ellipse([cx + 40 - notch_r, cy - r - 20, cx + 40 + notch_r, cy - r - 20 + notch_r * 2], fill=BG)

    # bite taken out of the upper-right — the single most important shape,
    # this is what makes it read as "a bite of food" rather than a fruit icon alone
    bite_r = 170
    bcx, bcy = cx + r - 40, cy - r + 90
    draw.ellipse([bcx - bite_r, bcy - bite_r, bcx + bite_r, bcy + bite_r], fill=BG)

    # stem
    stem_w, stem_h = 34, 130
    scx = cx - 55
    stem_top = cy - r - 70
    draw.rounded_rectangle([scx - stem_w // 2, stem_top, scx + stem_w // 2, stem_top + stem_h], radius=16, fill=WHITE)

    # leaf, tilted
    leaf = Image.new("RGBA", (240, 160), (0, 0, 0, 0))
    ld = ImageDraw.Draw(leaf)
    ld.ellipse([0, 0, 240, 160], fill=LEAF)
    leaf = leaf.rotate(28, expand=True, resample=Image.BICUBIC)
    img.paste(leaf, (int(cx - 20), int(stem_top - 95)), leaf)

    return img


def flatten_on_opaque(img, bg_color):
    if img.mode == "RGBA":
        base = Image.new("RGB", img.size, bg_color)
        base.paste(img, mask=img.split()[3])
        return base
    return img.convert("RGB")


master = draw_master()

master.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-512.png"))
master.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, "icon-192.png"))

apple_icon = flatten_on_opaque(master, (226, 169, 58))
apple_icon.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, "apple-touch-icon.png"))

print("done")
