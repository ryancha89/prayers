"""Painted textures for the Mountain Temple (산사 대웅전) — tools/blender/build_mountain_temple.py.

    python3 tools/gen_mountain_temple_textures.py <out_dir>

Everything is drawn here (no photos, no outside art), in the warm sunset palette of the concept
(assets/mountain-temple/concepts): 단청 in 뇌록 green / 군청 blue / 석간주 red / 주홍 / 황, red
lacquered columns, slate tiles, pale granite.

dancheong_beam.png    2048×256  a beam band: 머리초 lotus bursts at both ends, 계풍 field between (tiles in U)
dancheong_bracket.png  512×512  공포 blocks: green body, white/red 긋기 outlines, a small lotus
dancheong_rafter.png   256×256  rafter ends: concentric 연화 rings
coffer.png            1024×1024 우물천장 coffer: green frame, red border, lotus rosette
lattice_door.png       512×1024 꽃살문 panel (RGBA: paper in the gaps is translucent white)
taenghwa.png          2048×1280 the hall's painting behind the Buddha (abstract: clouds, flames, flowers,
                                two attendant silhouettes with halos — original, not a copy of any painting)
halo.png              1024×1024 mandorla / 광배 (RGBA)
cushion.png            512×512  crimson cushion, gold border and lotus
roof_tile.png          512×512  slate tile tint with soot and moss variation (geometry makes the rows)
granite.png           1024×1024 pale granite
paving.png            1024×1024 laid stone slabs
wood_floor.png        1024×1024 polished maru boards
wood_red.png           512×1024 red lacquer over grain (columns)
wood_brown.png         512×512  plain brown timber (door frames, rails)
plaster.png            512×512  lime plaster wall
paper.png              512×512  hanji
sky_sunset.png        4096×1024 panorama: sunset, layered ridges, mist, the river glow
"""
import math
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
rng = np.random.default_rng(23)
random.seed(23)

# 단청 palette (sRGB)
GREEN = (62, 128, 99)      # 뇌록
DKGREEN = (30, 78, 62)
BLUE = (43, 79, 132)       # 군청
SKY = (110, 160, 190)
RED = (138, 46, 34)        # 석간주
VERMIL = (214, 84, 48)     # 주홍
YELLOW = (232, 180, 60)    # 황
WHITE = (240, 232, 214)
BLACK = (28, 22, 20)
PINK = (226, 128, 128)


def noise(h, w, scales=(4, 8, 16, 32, 64), decay=0.55):
    out = np.zeros((h, w))
    a, tot = 1.0, 0.0
    for s in scales:
        g = rng.random((s + 1, s + 1))
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += a * np.asarray(img) / 255.0
        tot += a
        a *= decay
    return out / tot


def tileable_noise(h, w, scales=(4, 8, 16, 32), decay=0.55):
    """Noise that wraps at the edges (sum of periodic sines with random phases per octave)."""
    y = np.linspace(0, 2 * np.pi, h, endpoint=False)[:, None]
    x = np.linspace(0, 2 * np.pi, w, endpoint=False)[None, :]
    out = np.zeros((h, w))
    a, tot = 1.0, 0.0
    for s in scales:
        for _ in range(3):
            fx, fy = rng.integers(1, s + 1), rng.integers(1, s + 1)
            out += a * np.sin(fx * x + fy * y + rng.random() * 6.28) / 3
        tot += a
        a *= decay
    out = out / tot
    return (out - out.min()) / (out.max() - out.min() + 1e-9)


def save(arr, name):
    Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8)).save(f"{OUT}/{name}")


def lotus(d, cx, cy, r, petals=8, cols=(VERMIL, YELLOW, WHITE, RED), outline=BLACK):
    """A 연화 rosette: rings of petals, a seed-pod centre."""
    rings = [(r, cols[3]), (r * 0.82, cols[0]), (r * 0.6, cols[2]), (r * 0.42, cols[1])]
    for k, (rr, c) in enumerate(rings):
        off = (math.pi / petals) * (k % 2)
        for i in range(petals):
            a = 2 * math.pi * i / petals + off
            px, py = cx + math.cos(a) * rr * 0.55, cy + math.sin(a) * rr * 0.55
            pr = rr * 0.48
            d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=c, outline=outline, width=max(1, int(r / 40)))
    d.ellipse([cx - r * 0.24, cy - r * 0.24, cx + r * 0.24, cy + r * 0.24], fill=GREEN, outline=outline, width=2)
    for i in range(6):
        a = 2 * math.pi * i / 6
        d.ellipse([cx + math.cos(a) * r * 0.12 - 3, cy + math.sin(a) * r * 0.12 - 3,
                   cx + math.cos(a) * r * 0.12 + 3, cy + math.sin(a) * r * 0.12 + 3], fill=YELLOW)


# ------------------------------------------------------------------ dancheong beam
def beam():
    W, H = 2048, 256
    im = Image.new("RGB", (W, H), GREEN)
    d = ImageDraw.Draw(im)
    # 계풍 field: blue-green band with gold 금문 stripes
    d.rectangle([0, 0, W, H], fill=GREEN)
    d.rectangle([0, 18, W, H - 18], fill=BLUE)
    d.rectangle([0, 30, W, H - 30], fill=SKY)
    d.rectangle([0, 40, W, H - 40], fill=GREEN)
    for y in (18, H - 18, 30, H - 30, 40, H - 40):
        d.line([0, y, W, y], fill=WHITE, width=2)
    # repeating 금문 (a meander of gold) through the middle
    for x in range(0, W, 64):
        d.rectangle([x + 8, H // 2 - 22, x + 56, H // 2 + 22], outline=YELLOW, width=4)
        d.rectangle([x + 20, H // 2 - 10, x + 44, H // 2 + 10], outline=RED, width=3)
    # 머리초 at both ends (and the middle so a long beam reads busy): lotus burst with wave bands
    for cx in (130, W // 2, W - 130):
        d.rectangle([cx - 128, 6, cx + 128, H - 6], fill=DKGREEN)
        for k, c in enumerate((RED, VERMIL, YELLOW, WHITE)):
            d.rectangle([cx - 128 + k * 10, 6 + k * 6, cx + 128 - k * 10, H - 6 - k * 6], outline=c, width=4)
        lotus(d, cx, H // 2, 96, petals=10)
        for side in (-1, 1):
            for k in range(4):
                x0 = cx + side * (140 + k * 16)
                d.polygon([(x0, 20), (x0 + side * 12, H // 2), (x0, H - 20)], fill=(VERMIL, YELLOW, WHITE, RED)[k])
    arr = np.asarray(im).astype(float) / 255.0
    arr *= (0.9 + 0.1 * noise(H, W))[..., None]
    save(arr, "dancheong_beam.png")


def bracket():
    W = 512
    im = Image.new("RGB", (W, W), GREEN)
    d = ImageDraw.Draw(im)
    for k, c in enumerate((WHITE, RED, WHITE, YELLOW)):
        d.rectangle([k * 9, k * 9, W - k * 9, W - k * 9], outline=c, width=5)
    d.rectangle([60, 60, W - 60, W - 60], fill=DKGREEN, outline=WHITE, width=3)
    lotus(d, W // 2, W // 2, 150, petals=8)
    arr = np.asarray(im).astype(float) / 255.0 * (0.9 + 0.1 * noise(W, W))[..., None]
    save(arr, "dancheong_bracket.png")


def rafter():
    W = 256
    im = Image.new("RGB", (W, W), GREEN)
    d = ImageDraw.Draw(im)
    for k, c in enumerate((WHITE, RED, YELLOW, VERMIL, WHITE, GREEN, BLUE)):
        r = 124 - k * 16
        d.ellipse([128 - r, 128 - r, 128 + r, 128 + r], fill=c)
    save(np.asarray(im).astype(float) / 255.0, "dancheong_rafter.png")


def coffer():
    W = 1024
    im = Image.new("RGB", (W, W), GREEN)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, W], fill=RED)
    d.rectangle([40, 40, W - 40, W - 40], fill=GREEN)
    for k, c in enumerate((WHITE, YELLOW, WHITE)):
        d.rectangle([60 + k * 14, 60 + k * 14, W - 60 - k * 14, W - 60 - k * 14], outline=c, width=6)
    d.rectangle([130, 130, W - 130, W - 130], fill=BLUE)
    d.ellipse([180, 180, W - 180, W - 180], fill=DKGREEN, outline=YELLOW, width=8)
    lotus(d, W // 2, W // 2, 300, petals=12)
    for cx, cy in ((90, 90), (W - 90, 90), (90, W - 90), (W - 90, W - 90)):
        lotus(d, cx, cy, 60, petals=6)
    arr = np.asarray(im).astype(float) / 255.0 * (0.88 + 0.12 * noise(W, W))[..., None]
    save(arr, "coffer.png")


def lattice_door():
    W, H = 512, 1024
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    frame = (92, 52, 34, 255)
    paper = (238, 226, 200, 205)
    d.rectangle([0, 0, W, H], fill=paper)
    # 꽃살: diagonal lattice with a flower at every crossing
    step = 64
    for k in range(-H, W + H, step):
        d.line([(k, 0), (k + H, H)], fill=frame, width=10)
        d.line([(k, H), (k + H, 0)], fill=frame, width=10)
    for y in range(0, H + step, step):
        for x in range(0, W + step, step):
            for cx, cy in ((x, y), (x + step / 2, y + step / 2)):
                for i in range(4):
                    a = math.pi / 4 + i * math.pi / 2
                    px, py = cx + math.cos(a) * 12, cy + math.sin(a) * 12
                    d.ellipse([px - 9, py - 9, px + 9, py + 9], fill=(196, 92, 70, 255))
                d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(232, 180, 60, 255))
    # the frame: stiles, rails, the lower 궁창 panel
    d.rectangle([0, 0, W, 40], fill=frame)
    d.rectangle([0, H - 40, W, H], fill=frame)
    d.rectangle([0, 0, 40, H], fill=frame)
    d.rectangle([W - 40, 0, W, H], fill=frame)
    d.rectangle([0, int(H * 0.72), W, int(H * 0.76)], fill=frame)
    d.rectangle([40, int(H * 0.76), W - 40, H - 40], fill=(62, 128, 99, 255))
    lotus(d, W // 2, int(H * 0.87), 70, petals=8)
    im.save(f"{OUT}/lattice_door.png")


def taenghwa():
    W, H = 2048, 1280
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    base = np.zeros((H, W, 3))
    n = noise(H, W, (8, 16, 32, 64, 128))
    deep = np.array([0.36, 0.08, 0.06])
    green = np.array([0.10, 0.26, 0.18])
    t = np.clip(n * 1.6 - 0.3, 0, 1)
    base = deep * (1 - t[..., None]) + green * t[..., None]
    im = Image.fromarray((base * 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    # swirling clouds (구름)
    for _ in range(140):
        cx, cy, r = random.uniform(0, W), random.uniform(0, H), random.uniform(18, 60)
        c = random.choice([(60, 120, 100), (210, 170, 90), (230, 220, 200), (90, 140, 170)])
        for k in range(3):
            d.arc([cx - r + k * 6, cy - r + k * 6, cx + r - k * 6, cy + r - k * 6],
                  random.uniform(0, 180), random.uniform(200, 360), fill=c, width=5)
    # flowers scattered
    for _ in range(70):
        lotus(d, random.uniform(0, W), random.uniform(0, H), random.uniform(16, 34), petals=6,
              cols=(PINK, YELLOW, WHITE, (180, 60, 70)))
    # the great central halo the statue sits in front of
    cx, cy = W // 2, int(H * 0.42)
    for k, c in enumerate(((120, 30, 20), (214, 84, 48), (232, 180, 60), (62, 128, 99), (240, 210, 130),
                           (43, 79, 132), (232, 180, 60))):
        r = 560 - k * 62
        d.ellipse([cx - r, cy - r * 0.95, cx + r, cy + r * 0.95], outline=c, width=26)
    # flame tongues around the halo
    for i in range(48):
        a = 2 * math.pi * i / 48
        r0 = 560
        px, py = cx + math.cos(a) * r0, cy + math.sin(a) * r0 * 0.95
        tip = (cx + math.cos(a) * (r0 + 70), cy + math.sin(a) * (r0 + 70) * 0.95)
        side = 0.06
        p1 = (cx + math.cos(a - side) * r0, cy + math.sin(a - side) * r0 * 0.95)
        p2 = (cx + math.cos(a + side) * r0, cy + math.sin(a + side) * r0 * 0.95)
        d.polygon([p1, tip, p2], fill=(232, 150, 60))
    # either side: a tall flame-edged halo over a lotus pedestal holding a jewel (보주) — pattern, not people
    for fx in (int(W * 0.15), int(W * 0.85)):
        for k, c in enumerate(((120, 30, 20), (232, 180, 60), (62, 128, 99), (214, 84, 48), (240, 210, 130))):
            rx, ry = 190 - k * 26, 430 - k * 40
            d.ellipse([fx - rx, 560 - ry, fx + rx, 560 + ry], outline=c, width=16)
        for i in range(28):
            a = 2 * math.pi * i / 28
            p0 = (fx + math.cos(a) * 190, 560 + math.sin(a) * 430)
            tip = (fx + math.cos(a) * 235, 560 + math.sin(a) * 490)
            p1 = (fx + math.cos(a + 0.09) * 190, 560 + math.sin(a + 0.09) * 430)
            d.polygon([p0, tip, p1], fill=(232, 150, 60))
        for k in range(5):                                  # stacked lotus pedestal
            w = 150 - k * 18
            yy = 1080 - k * 34
            d.ellipse([fx - w, yy - 22, fx + w, yy + 22], fill=((176, 54, 44), (226, 128, 128), (240, 210, 130),
                                                              (226, 128, 128), (176, 54, 44))[k], outline=BLACK, width=3)
        d.ellipse([fx - 70, 820, fx + 70, 960], fill=(232, 180, 60), outline=(120, 30, 20), width=8)
        d.ellipse([fx - 34, 856, fx + 34, 924], fill=(250, 236, 190))
        for j in range(8):
            a = 2 * math.pi * j / 8
            d.line([(fx + math.cos(a) * 80, 890 + math.sin(a) * 80), (fx + math.cos(a) * 130, 890 + math.sin(a) * 130)],
                   fill=(240, 210, 130), width=6)
        lotus(d, fx, 560, 110, petals=10)
    # border
    for k, c in enumerate(((120, 30, 20), (232, 180, 60), (62, 128, 99))):
        d.rectangle([k * 14, k * 14, W - k * 14, H - k * 14], outline=c, width=14)
    arr = np.asarray(im).astype(float) / 255.0
    arr = arr * (0.82 + 0.18 * noise(H, W))[..., None]
    save(arr, "taenghwa.png")


def halo():
    W = 1024
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = W // 2
    # pointed mandorla outline (flame shape)
    pts = []
    for i in range(120):
        a = 2 * math.pi * i / 120
        r = 470 * (1 + 0.18 * max(0.0, -math.sin(a)) ** 6)
        pts.append((c + math.cos(a) * r * 0.82, c + math.sin(a) * r))
    d.polygon(pts, fill=(196, 120, 40, 255))
    for k, col in enumerate(((232, 180, 60), (214, 84, 48), (240, 210, 130), (62, 128, 99), (232, 180, 60))):
        r = 400 - k * 70
        d.ellipse([c - r * 0.82, c - r, c + r * 0.82, c + r], outline=col + (255,), width=20)
    for i in range(36):
        a = 2 * math.pi * i / 36
        d.line([(c + math.cos(a) * 120, c + math.sin(a) * 150), (c + math.cos(a) * 330, c + math.sin(a) * 400)],
               fill=(240, 200, 110, 255), width=6)
    im.save(f"{OUT}/halo.png")


def cushion():
    W = 512
    im = Image.new("RGB", (W, W), (128, 26, 34))
    d = ImageDraw.Draw(im)
    for k, c in enumerate(((176, 132, 60), (110, 20, 28), (190, 150, 70))):
        d.rectangle([20 + k * 14, 20 + k * 14, W - 20 - k * 14, W - 20 - k * 14], outline=c, width=6)
    lotus(d, W // 2, W // 2, 110, petals=8, cols=((170, 120, 60), (200, 160, 80), (150, 40, 44), (120, 24, 30)),
          outline=(90, 16, 22))
    arr = np.asarray(im).astype(float) / 255.0
    weave = 0.94 + 0.06 * np.sin(np.arange(W)[None, :] * 1.7) * np.sin(np.arange(W)[:, None] * 1.7)
    arr *= (weave * (0.9 + 0.1 * noise(W, W)))[..., None]
    save(arr, "cushion.png")


def roof_tile():
    W = 512
    n = tileable_noise(W, W)
    base = np.array([0.20, 0.22, 0.26])
    arr = base[None, None, :] * (0.75 + 0.5 * n[..., None])
    moss = np.clip(tileable_noise(W, W, (2, 4, 8)) * 2 - 1.3, 0, 1)
    arr = arr * (1 - moss[..., None] * 0.5) + np.array([0.24, 0.28, 0.16]) * moss[..., None] * 0.5
    save(arr, "roof_tile.png")


def fine_grain(W, sigma=1.2):
    """Random grain, blurred and wrapped (no sine interference)."""
    g = Image.fromarray((rng.random((W, W)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(sigma))
    a = np.asarray(g).astype(float) / 255.0
    return (a - a.mean()) / (a.std() + 1e-6)


def soft_patches(W, cells=6):
    """Large soft tone patches that wrap: a blurred, tiled random grid."""
    g = rng.random((cells, cells))
    big = np.tile(g, (3, 3))
    img = Image.fromarray((big * 255).astype(np.uint8)).resize((W * 3, W * 3), Image.BICUBIC)
    a = np.asarray(img).astype(float)[W:2 * W, W:2 * W] / 255.0
    return a


def granite():
    W = 1024
    arr = np.array([0.80, 0.76, 0.70])[None, None, :] * (0.94 + 0.08 * soft_patches(W)[..., None])
    arr = arr * (1 + 0.035 * fine_grain(W, 0.8)[..., None])
    speck = (rng.random((W, W)) > 0.993).astype(float)
    arr -= np.asarray(Image.fromarray((speck * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(float)[..., None] / 255.0 * 0.18
    save(arr, "granite.png")


def paving():
    W = 1024
    arr = np.array([0.76, 0.72, 0.65])[None, None, :] * (0.93 + 0.1 * soft_patches(W, 5)[..., None])
    arr = arr * (1 + 0.03 * fine_grain(W, 1.0)[..., None])
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    y = 0
    row = 0
    while y < W:
        h = random.choice((170, 200, 256))
        x = -random.randint(0, 200) if row % 2 else 0
        while x < W:
            w = random.choice((200, 256, 300))
            shade = random.uniform(-18, 18)
            d.rectangle([x + 4, y + 4, x + w - 4, y + h - 4], outline=(120, 110, 96), width=6)
            ov = Image.new("RGBA", (W, W), (0, 0, 0, 0))
            ImageDraw.Draw(ov).rectangle([x + 7, y + 7, x + w - 7, y + h - 7],
                                         fill=(255, 255, 255, int(max(0, shade))) if shade > 0 else (0, 0, 0, int(-shade)))
            im.paste(Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB"))
            x += w
        y += h
        row += 1
    im = im.filter(ImageFilter.GaussianBlur(0.8))
    im.save(f"{OUT}/paving.png")


def wood_floor():
    W = 1024
    arr = np.zeros((W, W, 3))
    plank = 128
    base = np.array([0.42, 0.24, 0.12])
    for i in range(W // plank):
        tone = rng.uniform(0.82, 1.12)
        ys = slice(i * plank, (i + 1) * plank)
        xg = np.linspace(0, 1, W)[None, :]
        grain = 0.5 + 0.5 * np.sin(xg * rng.uniform(60, 90) + noise(plank, W, (4, 8, 16)) * 9)
        arr[ys] = base * tone * (0.88 + 0.14 * grain[..., None])
        arr[i * plank: i * plank + 3] *= 0.45
    save(arr, "wood_floor.png")


def wood_red():
    W, H = 512, 1024
    g = noise(H, W, (2, 4, 8))
    yy = np.linspace(0, 1, H)[:, None]
    grain = 0.5 + 0.5 * np.sin(np.linspace(0, 1, W)[None, :] * 70 + g * 10 + yy * 4)
    arr = np.array([0.55, 0.13, 0.08])[None, None, :] * (0.86 + 0.16 * grain[..., None])
    save(arr, "wood_red.png")


def wood_brown():
    W = 512
    g = noise(W, W, (2, 4, 8))
    grain = 0.5 + 0.5 * np.sin(np.linspace(0, 1, W)[None, :] * 60 + g * 9)
    arr = np.array([0.36, 0.21, 0.12])[None, None, :] * (0.85 + 0.18 * grain[..., None])
    save(arr, "wood_brown.png")


def plaster():
    W = 512
    n = tileable_noise(W, W, (8, 16, 32))
    arr = np.array([0.90, 0.86, 0.78])[None, None, :] * (0.92 + 0.1 * n[..., None])
    save(arr, "plaster.png")


def paper():
    W = 512
    n = noise(W, W, (16, 32, 64, 128))
    fib = (rng.random((W, W)) > 0.995).astype(float)
    arr = np.array([0.95, 0.91, 0.82])[None, None, :] * (0.95 + 0.06 * n[..., None]) - fib[..., None] * 0.06
    save(arr, "paper.png")


def sky_sunset():
    W, H = 4096, 1024
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    top = np.array([0.36, 0.40, 0.62])
    mid = np.array([0.92, 0.62, 0.48])
    hor = np.array([1.0, 0.82, 0.55])
    t = np.clip(y / 0.62, 0, 1)
    sky = np.zeros((H, W, 3))
    for c in range(3):
        sky[..., c] = top[c] * (1 - t) ** 2 + mid[c] * 2 * t * (1 - t) + hor[c] * t ** 2
    sun_x, sun_y = 0.18, 0.50
    dx = np.minimum(abs(x - sun_x), 1 - abs(x - sun_x))
    glow = np.exp(-(dx ** 2 / 0.004 + (y - sun_y) ** 2 / 0.02))
    sky += glow[..., None] * np.array([0.30, 0.20, 0.06])
    disc = (dx ** 2 * 16 + (y - sun_y) ** 2) < 0.0009
    sky[disc] = [1.0, 0.95, 0.80]
    # streaky clouds
    cl = noise(H, W, (4, 8, 16, 32, 64))
    band = np.exp(-((y - 0.30) ** 2) / 0.02)
    cmask = np.clip((cl - 0.55) * 4, 0, 1) * band
    sky = sky * (1 - cmask[..., None] * 0.6) + np.array([1.0, 0.72, 0.58]) * cmask[..., None] * 0.6
    # layered ridges, far to near, with mist between
    ridges = [(0.58, 0.16, (0.66, 0.54, 0.62), 4), (0.66, 0.15, (0.52, 0.42, 0.52), 5),
              (0.75, 0.14, (0.36, 0.32, 0.38), 7), (0.86, 0.12, (0.18, 0.20, 0.20), 11)]
    for base_y, amp, col, octs in ridges:
        prof = np.zeros(W)
        for k in range(1, octs + 1):
            prof += np.sin(np.linspace(0, 2 * np.pi * (k * 2 + 1), W) + rng.random() * 6.28) / k
        prof = base_y - amp * (prof - prof.min()) / (prof.max() - prof.min())
        mask = y > prof[None, :]
        mist = np.clip((y - prof[None, :]) / 0.08, 0, 1)
        c = np.array(col)
        sky = np.where(mask[..., None], c * (0.85 + 0.15 * mist[..., None]) + hor * (1 - mist[..., None]) * 0.25, sky)
    # the river catching the light, low between the near ridges
    river = (abs(y - 0.80) < 0.006 + 0.004 * np.sin(x * 40)) & (dx < 0.25)
    sky[river] = sky[river] * 0.4 + np.array([1.0, 0.85, 0.6]) * 0.6
    save(sky, "sky_sunset.png")


def leaves_pine():
    """Needle tufts on transparent (RGBA) — leaf cards for the pines."""
    W = 512
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for _ in range(46):
        cx, cy = random.uniform(60, W - 60), random.uniform(60, W - 60)
        base = random.choice([(46, 84, 52), (58, 100, 60), (38, 70, 46), (72, 112, 66)])
        for i in range(26):
            a = random.uniform(0, 2 * math.pi)
            r = random.uniform(30, 62)
            c = tuple(int(v * random.uniform(0.85, 1.15)) for v in base) + (255,)
            d.line([(cx, cy), (cx + math.cos(a) * r, cy + math.sin(a) * r)], fill=c, width=3)
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    im.save(f"{OUT}/leaves_pine.png")


def leaves_maple():
    """Maple leaves (red / vermilion / gold) on transparent — leaf cards for the autumn maples."""
    W = 512
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for _ in range(70):
        cx, cy = random.uniform(30, W - 30), random.uniform(30, W - 30)
        r = random.uniform(14, 26)
        rot = random.uniform(0, 2 * math.pi)
        c = random.choice([(200, 46, 30), (226, 80, 36), (176, 30, 28), (236, 128, 40), (214, 60, 34)]) + (255,)
        pts = []
        for i in range(10):
            a = rot + 2 * math.pi * i / 10
            rr = r if i % 2 == 0 else r * 0.45
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        d.polygon(pts, fill=c)
    im.save(f"{OUT}/leaves_maple.png")


for fn in (leaves_pine, leaves_maple, beam, bracket, rafter, coffer, lattice_door, taenghwa, halo, cushion, roof_tile, granite, paving,
           wood_floor, wood_red, wood_brown, plaster, paper, sky_sunset):
    fn()
    print("wrote", fn.__name__, flush=True)
