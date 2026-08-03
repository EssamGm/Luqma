from PIL import Image, ImageDraw
import os

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "icons")
os.makedirs(OUT, exist_ok=True)

BG = (226, 169, 58, 255)      # accent amber
MARK = (32, 36, 29, 255)      # deep ink
CRUMB = (32, 36, 29, 255)

SIZE = 1024


def draw_master():
    img = Image.new("RGBA", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)

    cx, cy = SIZE // 2, SIZE // 2 + 20
    r = 340

    # main "morsel" circle
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=MARK)

    # bite taken out (upper-right), cut with background color
    bite_r = 190
    bcx = cx + r - 60
    bcy = cy - r + 70
    draw.ellipse([bcx - bite_r, bcy - bite_r, bcx + bite_r, bcy + bite_r], fill=BG)

    # a couple of crumbs near the bite
    for (dx, dy, rr) in [(40, 140, 26), (-60, 190, 18)]:
        px, py = bcx + dx, bcy + dy
        draw.ellipse([px - rr, py - rr, px + rr, py + rr], fill=CRUMB)

    return img


def flatten_on_opaque(img, bg_color):
    if img.mode == "RGBA":
        base = Image.new("RGB", img.size, bg_color)
        base.paste(img, mask=img.split()[3])
        return base
    return img.convert("RGB")


master = draw_master()

# Standard PWA icons (can keep alpha channel, though our bg is opaque anyway)
master.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-512.png"))
master.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, "icon-192.png"))

# Apple touch icon: must be fully opaque (iOS renders any transparency as black)
apple = flatten_on_opaque(master, (226, 169, 58))
apple.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, "apple-touch-icon.png"))

print("done")
