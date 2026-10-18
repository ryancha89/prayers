"""Painted textures for Luna's starlight temple (Unity ConsultationSolo04, LunaTempleBuilder).

    python3 tools/gen_luna_temple_textures.py <out_dir>

sky_backdrop.png  — lavender twilight seen through the round window: clouds, far mountains, a castle, stars
marble_floor.png  — polished white marble with grey/lavender veins and a gold star-circle inlay
marble_wall.png   — pale lavender-white plaster/marble
cloth_moon.png    — navy table runner with a gold crescent, stars and border (alpha fringe at the bottom)
"""
import sys, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
OUT = sys.argv[1]
rng = np.random.default_rng(17); random.seed(17)

def noise(h, w, scales=(4, 8, 16, 32, 64), amp_decay=.55):
    out = np.zeros((h, w)); a = 1.0; tot = 0
    for s in scales:
        g = rng.random((s + 1, s + 1))
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += a * np.asarray(img) / 255.0; tot += a; a *= amp_decay
    return out / tot

def save(arr, name, mode='RGB'):
    Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8), mode).save(f'{OUT}/{name}')

# ---------------------------------------------------------------- sky backdrop
W, H = 2048, 1536
y = np.linspace(0, 1, H)[:, None]; x = np.linspace(0, 1, W)[None, :]
top = np.array([.36, .34, .62]); mid = np.array([.62, .56, .82]); hor = np.array([.96, .84, .90])
t = np.clip(y / .78, 0, 1)
sky = np.zeros((H, W, 3))
for c in range(3):
    sky[..., c] = (top[c] * (1 - t) ** 2 + mid[c] * 2 * t * (1 - t) + hor[c] * t ** 2)
# warm glow low on the horizon
glow = np.exp(-((x - .62) ** 2 / .08 + (y - .80) ** 2 / .02))
sky += glow[..., None] * np.array([.12, .08, .02])
# stars in the upper half
st = Image.new('L', (W, H)); d = ImageDraw.Draw(st)
for _ in range(900):
    sx, sy = random.random() * W, (random.random() ** 1.8) * H * .55
    r = random.choice([.6, .8, 1, 1.2, 1.6, 2.2]); b = int(120 + 135 * random.random())
    d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=b)
stars = np.asarray(st.filter(ImageFilter.GaussianBlur(.7))) / 255.0 * (1 - t[:, 0:1]) ** 1.5
sky += stars[..., None] * .9
# big pale moon disc, upper left, with a soft halo
mx, my, mr = .30 * W, .22 * H, 120
yy, xx = np.mgrid[0:H, 0:W]
dist = np.sqrt((xx - mx) ** 2 + (yy - my) ** 2)
halo = np.exp(-(np.maximum(dist - mr, 0) / 140) ** 2) * .35
moon = np.clip((mr - dist) / 3, 0, 1)
crescent_cut = np.clip((mr * .92 - np.sqrt((xx - mx - 52) ** 2 + (yy - my + 22) ** 2)) / 3, 0, 1)
moon = np.clip(moon - crescent_cut, 0, 1)
sky = sky * (1 - moon[..., None]) + np.array([1, .97, .9]) * moon[..., None] + halo[..., None] * np.array([.5, .45, .55])
# clouds: soft billows in two bands
def cloud_layer(cy, spread, n, size, col, shade):
    lay = np.zeros((H, W)); sh = np.zeros((H, W))
    im = Image.new('L', (W, H)); dd = ImageDraw.Draw(im)
    ims = Image.new('L', (W, H)); ds = ImageDraw.Draw(ims)
    for _ in range(n):
        cx = random.random() * W; cyy = cy * H + (random.random() - .5) * spread * H
        for k in range(random.randint(4, 9)):
            r = size * (.5 + random.random()); ox = (random.random() - .5) * size * 3; oy = -random.random() * size * .8
            dd.ellipse([cx + ox - r, cyy + oy - r, cx + ox + r, cyy + oy + r * .8], fill=255)
            ds.ellipse([cx + ox - r, cyy + oy - r * .2, cx + ox + r, cyy + oy + r * .8], fill=255)
    a = np.asarray(im.filter(ImageFilter.GaussianBlur(size * .25))) / 255.0
    s = np.asarray(ims.filter(ImageFilter.GaussianBlur(size * .35))) / 255.0
    return a, s
for cy, spread, n, size, a_ in ((.62, .16, 14, 60, .85), (.80, .10, 22, 46, .95), (.40, .12, 6, 50, .55)):
    a, s = cloud_layer(cy, spread, n, size, None, None)
    tex = noise(H, W, (16, 32, 64, 128)) * .10 + .92
    col = np.array([1, .98, 1]) * tex[..., None] - s[..., None] * np.array([.10, .12, .04])
    sky = sky * (1 - a[..., None] * a_) + col * a[..., None] * a_
# far mountains + castle silhouette (lavender haze)
mount = np.zeros(W)
for f, amp, ph in ((2, .05, 0), (5, .03, 1), (11, .015, 2), (23, .007, 3)):
    mount += amp * np.sin(np.linspace(0, f * math.pi, W) + ph)
mount_y = (.80 - mount - .04 * np.exp(-((np.linspace(0, 1, W) - .75) ** 2) / .01)) * H
mask = (yy > mount_y[None, :]).astype(float)
mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))) / 255.0
sky = sky * (1 - mask[..., None] * .8) + np.array([.70, .66, .84]) * mask[..., None] * .8
cas = Image.new('L', (W, H)); dc = ImageDraw.Draw(cas)
bx = int(.70 * W); by = int(.74 * H)
for (ox, w_, h_) in ((0, 70, 160), (-90, 40, 110), (90, 45, 125), (-150, 30, 70), (150, 30, 80), (40, 26, 210)):
    dc.rectangle([bx + ox - w_ // 2, by - h_, bx + ox + w_ // 2, by + 60], fill=255)
    dc.polygon([(bx + ox - w_ // 2 - 6, by - h_), (bx + ox + w_ // 2 + 6, by - h_), (bx + ox, by - h_ - w_ * 1.6)], fill=255)
ca = np.asarray(cas.filter(ImageFilter.GaussianBlur(1.5))) / 255.0
sky = sky * (1 - ca[..., None] * .7) + np.array([.80, .76, .92]) * ca[..., None] * .7
save(np.clip(sky, 0, 1), 'sky_backdrop.png')

# ---------------------------------------------------------------- marble (floor + wall)
def marble(size, base, vein, vein_amt, inlay=False):
    n = noise(size, size, (3, 6, 12, 24, 48, 96))
    yy, xx = np.mgrid[0:size, 0:size] / size
    v = np.abs(np.sin((xx * 3 + yy * 1.4 + n * 4.5) * math.pi))
    veins = (1 - v) ** 6 * vein_amt
    fine = noise(size, size, (64, 128, 256)) * .06
    img = np.array(base)[None, None, :] * (1 - fine[..., None]) - veins[..., None] * (np.array(base) - np.array(vein))[None, None, :]
    if inlay:
        # tile seams (4x4 tiles) in soft grey
        seam = ((np.abs((xx * 4) % 1 - .5) > .497) | (np.abs((yy * 4) % 1 - .5) > .497)).astype(float)
        img = img * (1 - seam[..., None] * .18)
    return np.clip(img, 0, 1)
save(marble(1024, (.95, .94, .96), (.72, .70, .80), .35, inlay=True), 'marble_floor.png')
save(marble(512, (.93, .91, .97), (.78, .75, .88), .30), 'marble_wall.png')

# floor medallion: gold ring + 8-point star on transparent, laid on the floor under the reading circle
S = 1024; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
c = S / 2; gold = (226, 182, 98, 255)
for r, w_ in ((480, 10), (440, 4), (300, 4)):
    d.ellipse([c - r, c - r, c + r, c + r], outline=gold, width=w_)
pts = []
for k in range(16):
    a = k * math.pi / 8; r = 430 if k % 2 == 0 else 170
    pts.append((c + r * math.sin(a), c - r * math.cos(a)))
d.polygon(pts, outline=gold, width=4)
for k in range(12):
    a = k * math.pi / 6
    d.line([(c + 445 * math.sin(a), c - 445 * math.cos(a)), (c + 478 * math.sin(a), c - 478 * math.cos(a))], fill=gold, width=6)
im.filter(ImageFilter.GaussianBlur(.8)).save(f'{OUT}/floor_medallion.png')

# ---------------------------------------------------------------- navy moon cloth
Wc, Hc = 512, 640
im = Image.new('RGBA', (Wc, Hc), (24, 22, 58, 255)); d = ImageDraw.Draw(im)
n = noise(Hc, Wc, (8, 16, 32, 64))
arr = np.asarray(im).astype(float); arr[..., :3] *= (0.85 + .3 * n[..., None]); im = Image.fromarray(arr.clip(0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
gold = (222, 180, 96, 255)
d.rectangle([18, 18, Wc - 18, Hc - 90], outline=gold, width=5)
d.rectangle([32, 32, Wc - 32, Hc - 104], outline=gold, width=2)
cx, cy, R = Wc / 2, 290, 120
d.ellipse([cx - R - 26, cy - R - 26, cx + R + 26, cy + R + 26], outline=gold, width=3)
d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=gold)
d.ellipse([cx - R + 48, cy - R - 18, cx + R + 48, cy + R - 18], fill=(24, 22, 58, 255))
for k in range(8):
    a = k * math.pi / 4; r1, r2 = R + 40, R + 70
    d.line([(cx + r1 * math.sin(a), cy - r1 * math.cos(a)), (cx + r2 * math.sin(a), cy - r2 * math.cos(a))], fill=gold, width=3)
for (sx, sy, r) in ((110, 110, 14), (400, 120, 10), (420, 450, 12), (95, 470, 9)):
    d.polygon([(sx, sy - r), (sx + r * .3, sy - r * .3), (sx + r, sy), (sx + r * .3, sy + r * .3), (sx, sy + r), (sx - r * .3, sy + r * .3), (sx - r, sy), (sx - r * .3, sy - r * .3)], fill=gold)
# fringe: tassels at the bottom with alpha gaps
fr = np.asarray(im).copy()
for xk in range(0, Wc):
    tassel = (xk // 22) % 2 == 0
    for yk in range(Hc - 86, Hc):
        if not tassel or (yk > Hc - 20 and abs((xk % 22) - 11) > 6 - (Hc - yk) // 4):
            fr[yk, xk, 3] = 0
        else:
            fr[yk, xk, :3] = (200, 168, 230) if yk > Hc - 70 else (222, 180, 96)
Image.fromarray(fr).save(f'{OUT}/cloth_moon.png')
print('ok')
