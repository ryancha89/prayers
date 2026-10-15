#!/usr/bin/env python3
"""
Nabi (나비), the pixel dosa cat — every frame of him, drawn in code.

WHY CODE AND NOT AN EDITOR FILE
The cat is a 48x48 figure built from a handful of parts (head, ears, gat, robe, paws, tail) and a
face that swaps eyes and mouth. Every animation is the same parts moved a pixel or swapped for a
variant, so authoring it as parameters keeps 60-odd frames consistent — fix the ear once and every
frame has the fixed ear. Hand-drawn frames drift.

OUTPUT
  src/features/counseling/pixel/catArt.generated.ts   palette + every frame as SVG path data
  src/features/counselors/assets/nabi.png              card portrait (0.82) — same art, scaled
  src/features/counselors/assets/nabi_avatar.png       square head crop
  --preview DIR                                        contact sheets for looking at the art

The app draws the frames as SVG rects (one path per colour, built at runtime from the run-length
strings this writes), not as bitmaps: RN's <Image> can only
scale with linear filtering, which smears a 48px sprite into mush at 6x. Paths stay crisp at any
size and weigh a few KB.

Run:  python3 tools/pixelcat/gen_pixel_cat.py [--preview /tmp/cat]
"""
import argparse
import math
import os

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
W = H = 48

# ── palette ────────────────────────────────────────────────────────────────────────────────────────
PAL = {
    'ol': '#2a1b2e',   # outline
    'fur': '#f4b77e',  # orange tabby
    'fsh': '#d88c55',  # fur shade
    'fli': '#fde6c8',  # muzzle / chest
    'str': '#c26d3c',  # stripes
    'ear': '#f29a9f',  # inner ear
    'nos': '#e8707f',  # nose / tongue
    'blu': '#f7a3a0',  # blush
    'eye': '#2a1b2e',
    'iri': '#8ccf5a',  # iris
    'wht': '#ffffff',
    'rob': '#3d4a8f',  # 도포 indigo
    'rsh': '#2c3570',
    'rli': '#5462a8',
    'col': '#f3eee2',  # 동정 collar
    'gld': '#e9b949',  # 세조대 cord / beads
    'gsh': '#b9862a',
    'hat': '#1d1a24',  # 갓
    'hli': '#4b4660',
    'tbl': '#8a5634',  # table
    'tli': '#b0714a',
    'tsh': '#5e3621',
    'pap': '#f6ecd0',  # scroll paper
    'pas': '#d9c9a0',
    'ink': '#3a2a2a',
    'red': '#c83b3b',
    'wsk': '#fff4e6',  # whisker
    'swt': '#8fd3ff',  # sweat drop
    'thk': '#e6e0ff',  # thought dots
}


class Canvas:
    def __init__(self, w=W, h=H):
        self.w, self.h = w, h
        self.px = [[None] * w for _ in range(h)]

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return None

    def sym(self, x, y, c):
        """Set (x, y) and its mirror across the cat's centre line (between x=23 and x=24)."""
        self.set(x, y, c)
        self.set(W - 1 - x, y, c)

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(self.h):
            for x in range(self.w):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0:
                    self.set(x, y, c)

    def poly(self, pts, c):
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        for y in range(max(0, int(min(ys))), min(self.h, int(max(ys)) + 1)):
            for x in range(max(0, int(min(xs))), min(self.w, int(max(xs)) + 1)):
                if _inside(x + 0.5, y + 0.5, pts):
                    self.set(x, y, c)

    def paste(self, other, dx=0, dy=0):
        for y in range(other.h):
            for x in range(other.w):
                c = other.px[y][x]
                if c is not None:
                    self.set(x + dx, y + dy, c)

    def outline(self, color='ol', diagonal=False):
        """Ring every filled pixel with `color` on its empty neighbours."""
        add = []
        n4 = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        n8 = n4 + [(1, 1), (-1, -1), (1, -1), (-1, 1)]
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x] is not None:
                    continue
                for dx, dy in (n8 if diagonal else n4):
                    c = self.get(x + dx, y + dy)
                    if c is not None and c != color:
                        add.append((x, y))
                        break
        for x, y in add:
            self.px[y][x] = color


def _inside(x, y, pts):
    n = len(pts)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
            inside = not inside
        j = i
    return inside


def mirror_pts(pts):
    return [(W - x, y) for x, y in pts]


# ── the cat ────────────────────────────────────────────────────────────────────────────────────────
#
# A pose is a dict; every key has a default so an animation only states what it changes.
#   bob      head+body drop in px (breathing)
#   head_dy  extra head-only drop (nod)          head_dx  head lean
#   eyes     open | blink | half | happy | up | wide | worried | closed | side
#   mouth    closed | small | open | wide | o | worried | smile | flat
#   ears     normal | droop | perk | twitch_l
#   brows    none | worried | raised | focus
#   paw_r    rest | chin | wave1 | wave2 | wave3 | point | open | bow
#   paw_l    rest | open | bow
#   tail     -1 | 0 | 1  (tip sway)
#   extra    list of overlays: blush, sweat, think1..3, bang, sparkle1/2, notes
#   bow      body lean for a bow (px)

DEFAULT = dict(bob=0, head_dy=0, head_dx=0, eyes='open', mouth='closed', ears='normal',
               brows='none', paw_r='rest', paw_l='rest', tail=0, extra=(), bow=0)


def draw_tail(c, sway):
    # Curls up the right-hand side of the body, behind it.
    base = [(36, 39), (39, 38), (41, 35), (42 + sway, 31), (41 + sway, 27)]
    for i in range(len(base) - 1):
        (x0, y0), (x1, y1) = base[i], base[i + 1]
        steps = max(abs(x1 - x0), abs(y1 - y0)) * 2
        for s in range(steps + 1):
            t = s / max(1, steps)
            x = round(x0 + (x1 - x0) * t)
            y = round(y0 + (y1 - y0) * t)
            c.rect(x - 1, y - 1, x + 1, y + 1, 'fur')
    tx, ty = base[-1]
    c.rect(tx - 1, ty - 2, tx + 1, ty, 'fli')          # pale tip
    c.set(tx - 1, ty + 3, 'str')
    c.set(tx, ty + 3, 'str')
    c.set(41, 34, 'str')
    c.set(42, 34, 'str')


def draw_body(c, dy, lean):
    # 도포: a trapezoid that widens toward the table.
    for y in range(27 + dy, 41):
        t = (y - 27 - dy) / 13.0
        half = 8.5 + t * 5.0
        x0 = int(round(24 - half))
        x1 = int(round(24 + half)) - 1
        c.rect(x0 + lean, y, x1 + lean, y, 'rob')
        # shading on the right flank
        c.set(x1 + lean, y, 'rsh')
        c.set(x1 - 1 + lean, y, 'rsh')
        c.set(x0 + lean, y, 'rli')
    # chest fur in the V of the collar
    for y in range(27 + dy, 33 + dy):
        k = (y - 27 - dy)
        half = max(0, 3 - k // 2)
        c.rect(23 - half + lean, y, 24 + half + lean, y, 'fli')
    # collar (동정): white bands along both edges of the V
    for k in range(0, 7):
        y = 27 + dy + k
        half = max(0, 3 - k // 2)
        c.set(22 - half + lean, y, 'col')
        c.set(21 - half + lean, y, 'col')
        c.set(25 + half + lean, y, 'col')
        c.set(26 + half + lean, y, 'col')
    # lapel overlap line below the V
    for y in range(34 + dy, 40):
        c.set(24 + lean + (y - 34 - dy) // 3, y, 'rsh')
    # sleeve seams: where the arms meet the torso
    for y in range(31 + dy, 40):
        c.set(16 + lean, y, 'rsh')
        c.set(31 + lean, y, 'rsh')
    # 세조대: gold cord at the waist, knot and tassel on the left
    y = 37
    c.rect(17 + lean, y, 30 + lean, y, 'gld')
    c.set(19 + lean, y + 1, 'gld')
    c.set(20 + lean, y + 1, 'gsh')
    c.set(19 + lean, y + 2, 'gsh')


def draw_head(c, dy, dx, pose):
    cx, cy = 24 + dx, 21.5 + dy
    # cheek fluff first, so the head ellipse sits over its roots
    for sx in (-1, 1):
        for (ox, oy) in [(12.0, 3.2), (12.4, 4.6), (11.8, 5.8)]:
            px_ = int(math.floor(cx + sx * ox - (0.5 if sx < 0 else -0.5)))
            c.set(px_ if sx > 0 else px_, int(cy + oy), 'fur')
    c.ellipse(cx, cy, 11.6, 8.9, 'fur')
    # soft shade on the lower right of the face
    for y in range(int(cy + 3), int(cy + 9)):
        for x in range(int(cx + 6), int(cx + 12)):
            if c.get(x, y) == 'fur' and ((x + 0.5 - cx) / 11.6) ** 2 + ((y + 0.5 - cy) / 8.9) ** 2 > 0.55:
                c.set(x, y, 'fsh')
    # muzzle
    c.ellipse(cx, cy + 4.3, 5.2, 3.0, 'fli')
    # tabby marks on the forehead, under the brim
    y0 = int(cy - 8)
    for x, y in [(23, y0), (23, y0 + 1), (21, y0), (21, y0 + 1), (19, y0 + 1)]:
        c.set(x + dx, y, 'str')
        c.set(W - 1 - x + dx, y, 'str')
    # side-of-face stripes
    for y in (int(cy), int(cy + 2)):
        c.set(int(cx - 11) , y, 'str')
        c.set(int(cx - 10), y, 'str')
        c.set(int(cx + 10) , y, 'str')
        c.set(int(cx + 9), y, 'str')


def draw_ears(c, dy, dx, mode):
    left = [(12.0, 15.0), (19.5, 12.0), (13.0, 3.5)]
    inner = [(14.0, 13.5), (18.0, 12.0), (14.0, 6.5)]
    l_tip = (15.0, 4.5)
    r_mode = mode
    if mode == 'droop':
        left = [(12.0, 15.0), (19.5, 12.0), (9.0, 8.0)]
        inner = [(13.5, 13.5), (17.5, 12.5), (11.0, 9.5)]
    elif mode == 'perk':
        left = [(12.0, 15.0), (19.5, 12.0), (13.0, 2.0)]
        inner = [(14.0, 13.5), (18.0, 12.0), (14.0, 5.0)]
    def shift(pts):
        return [(x + dx, y + dy) for x, y in pts]
    lt, li = left, inner
    rt, ri = mirror_pts(left), mirror_pts(inner)
    if mode == 'twitch_l':
        lt = [(12.0, 15.0), (19.5, 12.0), (11.0, 5.0)]
        li = [(13.8, 13.5), (17.8, 12.0), (12.6, 7.8)]
        rt, ri = mirror_pts(left), mirror_pts(inner)
    c.poly(shift(lt), 'fur')
    c.poly(shift(li), 'ear')
    c.poly(shift(rt), 'fsh')
    c.poly(shift(ri), 'ear')


def draw_hat(c, dy, dx):
    # 갓: a wide thin brim and a tall crown. Drawn after the ears so the brim crosses their roots.
    c.ellipse(24 + dx, 11.4 + dy, 13.6, 1.7, 'hat')
    for x in range(12 + dx, 36 + dx):
        if c.get(x, int(11 + dy)) == 'hat' and x % 3 == 0:
            c.set(x, int(11 + dy), 'hli')          # horsehair weave glint
    c.rect(20 + dx, 1 + dy, 27 + dx, 10 + dy, 'hat')
    c.rect(19 + dx, 8 + dy, 28 + dx, 10 + dy, 'hat')
    c.rect(20 + dx, 8 + dy, 27 + dx, 8 + dy, 'hli')   # band
    for yy in range(2, 7):
        c.set(21 + dx, yy + dy, 'hli')                # crown glint


def draw_eyes(c, dy, dx, mode):
    ly = 18 + dy
    for side in (0, 1):
        x0 = (17 if side == 0 else 27) + dx
        def s(x, y, col):
            c.set(x0 + x, ly + y, col)
        if mode in ('open', 'up', 'side', 'wide', 'worried', 'half'):
            h = 5 if mode == 'wide' else 4
            top = -1 if mode == 'wide' else 0
            for yy in range(top, top + h):
                for xx in range(0, 4):
                    corner = (xx in (0, 3)) and (yy in (top, top + h - 1))
                    if not corner:
                        s(xx, yy, 'eye')
            # iris low in the eye, pupil slit, highlight
            if mode == 'wide':
                s(1, 1, 'iri'); s(2, 1, 'iri'); s(1, 2, 'iri'); s(2, 2, 'iri')
                s(1, 0, 'wht')
            else:
                oy = -1 if mode == 'up' else 0
                ox = 1 if mode == 'side' else 0
                s(1 + ox, 2 + oy, 'iri'); s(2 + ox, 2 + oy, 'iri')
                s(1 + ox, 3 + oy if mode != 'up' else 1, 'iri')
                s(1 + ox, 1 + oy if oy == 0 else 0, 'wht')
            if mode == 'half':
                for xx in range(0, 4):
                    s(xx, 0, 'fur')
                    s(xx, 1, 'ol')
            if mode == 'worried':
                # lids tilted up toward the middle
                inner = 3 if side == 0 else 0
                s(inner, 0, 'fur')
        elif mode == 'blink' or mode == 'closed':
            for xx in range(0, 4):
                s(xx, 2, 'eye')
            if mode == 'closed':
                s(0, 1, 'eye') if side == 0 else s(3, 1, 'eye')
        elif mode == 'happy':
            s(0, 2, 'eye'); s(1, 1, 'eye'); s(2, 1, 'eye'); s(3, 2, 'eye')


def draw_brows(c, dy, dx, mode):
    y = 16 + dy
    if mode == 'worried':
        for side in (0, 1):
            if side == 0:
                c.set(17 + dx, y + 1, 'ol'); c.set(18 + dx, y, 'ol'); c.set(19 + dx, y, 'ol')
            else:
                c.set(30 + dx, y + 1, 'ol'); c.set(29 + dx, y, 'ol'); c.set(28 + dx, y, 'ol')
    elif mode == 'raised':
        for x in (18, 19, 28, 29):
            c.set(x + dx, y - 1, 'ol')
    elif mode == 'focus':
        c.set(18 + dx, y, 'ol'); c.set(19 + dx, y + 1, 'ol'); c.set(20 + dx, y + 1, 'ol')
        c.set(29 + dx, y, 'ol'); c.set(28 + dx, y + 1, 'ol'); c.set(27 + dx, y + 1, 'ol')


def draw_mouth(c, dy, dx, mode):
    ny = 23 + dy
    c.set(23 + dx, ny, 'nos'); c.set(24 + dx, ny, 'nos')
    y = ny + 1
    def sy(x, yy, col):
        c.set(x + dx, yy, col)
        c.set(W - 1 - x + dx, yy, col)
    if mode == 'closed':
        sy(23, y, 'ol'); sy(22, y + 1, 'ol'); sy(21, y, 'ol')
    elif mode == 'smile':
        sy(23, y, 'ol'); sy(22, y + 1, 'ol'); sy(21, y + 1, 'ol'); sy(20, y, 'ol')
    elif mode == 'small':
        sy(23, y, 'ol')
        sy(22, y + 1, 'ol'); sy(23, y + 1, 'ol')
        sy(23, y + 2, 'nos'); sy(22, y + 2, 'ol')
    elif mode == 'open':
        sy(23, y, 'ol')
        sy(21, y + 1, 'ol'); sy(22, y + 1, 'ol'); sy(23, y + 1, 'ol')
        sy(21, y + 2, 'ol'); sy(22, y + 2, 'ol'); sy(23, y + 2, 'nos')
        sy(22, y + 3, 'ol'); sy(23, y + 3, 'ol')
    elif mode == 'wide':
        sy(20, y + 1, 'ol'); sy(21, y + 1, 'ol'); sy(22, y + 1, 'ol'); sy(23, y + 1, 'ol')
        sy(20, y + 2, 'ol'); sy(21, y + 2, 'ol'); sy(22, y + 2, 'nos'); sy(23, y + 2, 'nos')
        sy(21, y + 3, 'ol'); sy(22, y + 3, 'ol'); sy(23, y + 3, 'ol')
    elif mode == 'o':
        sy(23, y + 1, 'ol'); sy(22, y + 2, 'ol'); sy(23, y + 3, 'ol')
        sy(23, y + 2, 'nos')
    elif mode == 'worried':
        c.set(21 + dx, y + 2, 'ol'); c.set(22 + dx, y + 1, 'ol'); c.set(23 + dx, y + 1, 'ol')
        c.set(24 + dx, y + 2, 'ol'); c.set(25 + dx, y + 2, 'ol'); c.set(26 + dx, y + 1, 'ol')
    elif mode == 'flat':
        for x in range(21, 27):
            c.set(x + dx, y + 1, 'ol')


def draw_whiskers(c, dy, dx):
    y = 24 + dy
    for (x, yy) in [(8, y - 1), (9, y - 1), (10, y), (8, y + 2), (9, y + 2), (10, y + 1)]:
        c.set(x + dx, yy, 'wsk')
        c.set(W - 1 - x + dx, yy, 'wsk')


def draw_paws(c, pose, dy):
    """Paws go on their own layer so they can sit over the table edge."""
    layer = Canvas()
    pr = pose['paw_r']
    pl = pose['paw_l']
    # left paw (viewer's left = cat's right, but we name them by screen side)
    if pl == 'rest':
        _paw(layer, 13, 38)
    elif pl == 'open':
        _sleeve(layer, 11, 33 + dy, 4, 4)
        _paw(layer, 11, 30 + dy)
    elif pl == 'bow':
        _paw(layer, 16, 38)
    # right paw
    if pr == 'rest':
        _paw(layer, 31, 38)
    elif pr == 'chin':
        _sleeve(layer, 29, 30 + dy, 5, 6)
        _paw(layer, 27, 27 + dy)
    elif pr in ('wave1', 'wave2', 'wave3'):
        ox = {'wave1': 0, 'wave2': 1, 'wave3': -1}[pr]
        for i in range(6):
            layer.rect(32 + i // 2, 31 - i + dy, 35 + i // 2, 32 - i + dy, 'rob')
            layer.set(35 + i // 2, 31 - i + dy, 'rsh')
        layer.rect(34, 25 + dy, 37, 25 + dy, 'col')
        _bigpaw(layer, 34 + ox, 19 + dy)
    elif pr == 'point':
        _sleeve(layer, 30, 33 + dy, 5, 4)
        _paw(layer, 28, 34 + dy)
        layer.set(27, 35 + dy, 'fli')
    elif pr == 'open':
        _sleeve(layer, 33, 33 + dy, 4, 4)
        _paw(layer, 33, 30 + dy)
    elif pr == 'bow':
        _paw(layer, 28, 38)
    layer.outline('ol')
    return layer


def _paw(c, x, y, up=False):
    c.rect(x, y, x + 3, y + 2, 'fli')
    if up:
        c.rect(x, y - 1, x + 3, y - 1, 'fli')
        c.set(x + 1, y - 1, 'fsh'); c.set(x + 2, y - 1, 'fsh')   # toe gaps, pads facing out
        c.set(x + 1, y + 1, 'nos'); c.set(x + 2, y + 1, 'nos')
    else:
        c.set(x + 1, y + 2, 'fsh')
        c.set(x + 2, y + 2, 'fsh')


def _bigpaw(c, x, y):
    # palm out: 5x5 with pink pads, the gesture has to read at phone size
    c.rect(x, y + 1, x + 4, y + 5, 'fli')
    c.rect(x + 1, y, x + 3, y, 'fli')
    for tx in (x, x + 2, x + 4):
        c.set(tx, y + 1, 'fli')
    c.set(x + 1, y + 1, 'fsh'); c.set(x + 3, y + 1, 'fsh')
    c.rect(x + 1, y + 3, x + 3, y + 4, 'nos')
    c.set(x + 2, y + 2, 'nos')


def _sleeve(c, x, y, w, h):
    c.rect(x, y, x + w - 1, y + h - 1, 'rob')
    c.rect(x, y + h - 1, x + w - 1, y + h - 1, 'col')
    for yy in range(y, y + h - 1):
        c.set(x + w - 1, yy, 'rsh')


def draw_table(c):
    c.rect(0, 40, 47, 47, 'tbl')
    c.rect(0, 40, 47, 40, 'tli')
    c.rect(0, 41, 47, 41, 'tli')
    c.rect(0, 46, 47, 47, 'tsh')
    for x in range(0, 48, 7):
        c.set(x, 43, 'tsh')
        c.set(x + 1, 44, 'tsh')
    # scroll with the four pillars on it, between the paws
    c.rect(19, 41, 28, 43, 'pap')
    c.rect(19, 43, 28, 43, 'pas')
    c.rect(18, 41, 18, 43, 'tsh')
    c.rect(29, 41, 29, 43, 'tsh')
    for x in (20, 22, 25, 27):
        c.set(x, 42, 'ink')
    c.set(23, 41, 'red')


def draw_extras(c, extras, dy):
    for e in extras:
        if e == 'blush':
            for x in (15, 16):
                c.sym(x, 24 + dy, 'blu')
        elif e == 'sweat':
            c.set(37, 13 + dy, 'swt'); c.set(37, 14 + dy, 'swt'); c.set(36, 15 + dy, 'swt')
            c.set(37, 15 + dy, 'swt'); c.set(38, 15 + dy, 'wht')
        elif e.startswith('think'):
            n = int(e[-1])
            for i in range(n):
                x = 38 + i * 3
                y = 6 - i
                c.rect(x, y, x + 1, y + 1, 'thk')
        elif e == 'bang':
            c.rect(40, 2, 41, 6, 'gld'); c.rect(40, 8, 41, 9, 'gld')
        elif e in ('sparkle1', 'sparkle2'):
            pts = [(8, 8), (40, 16)] if e == 'sparkle1' else [(6, 16), (41, 7)]
            for x, y in pts:
                c.set(x, y, 'gld'); c.set(x - 1, y, 'gld'); c.set(x + 1, y, 'gld')
                c.set(x, y - 1, 'gld'); c.set(x, y + 1, 'gld'); c.set(x, y, 'wht')
        elif e == 'bless':
            for x, y in [(7, 12), (40, 10), (10, 4), (38, 3)]:
                c.set(x, y, 'gld')


def render(pose_in):
    pose = dict(DEFAULT)
    pose.update(pose_in)
    bob = pose['bob']
    hdy = bob + pose['head_dy']
    hdx = pose['head_dx']
    body = Canvas()
    draw_tail(body, pose['tail'])
    draw_body(body, bob, pose['bow'] // 2)
    head = Canvas()
    draw_ears(head, 0, 0, pose['ears'])
    draw_head(head, 0, 0, pose)
    draw_hat(head, 0, 0)
    draw_eyes(head, 0, 0, pose['eyes'])
    draw_brows(head, 0, 0, pose['brows'])
    draw_mouth(head, 0, 0, pose['mouth'])
    if 'blush' in pose['extra']:
        for x in (15, 16):
            head.sym(x, 24, 'blu')
    fig = Canvas()
    fig.paste(body)
    fig.paste(head, hdx, hdy + pose['bow'])
    fig.outline('ol')
    draw_whiskers(fig, hdy + pose['bow'], hdx)
    out = Canvas()
    out.paste(fig)
    draw_table(out)
    out.paste(draw_paws(out, pose, bob))
    draw_extras(out, [e for e in pose['extra'] if e != 'blush'], hdy)
    return out


# ── animations ─────────────────────────────────────────────────────────────────────────────────────
#
# (name, fps, loop, [pose, ...]). Every clip starts from rest so any clip can follow any other.

def idle_frames(eyes='open', mouth='closed', **kw):
    seq = []
    for i in range(8):
        p = dict(kw, eyes=eyes, mouth=mouth, bob=1 if i in (2, 3, 4) else 0,
                 tail=[0, 1, 1, 0, -1, -1, 0, 0][i])
        if i == 6 and eyes == 'open':
            p['eyes'] = 'blink'
        seq.append(p)
    return seq


def talk_frames(eyes='open', mouths=('small', 'open', 'small', 'closed'), **kw):
    seq = []
    for i, m in enumerate(mouths * 2):
        seq.append(dict(kw, eyes=eyes, mouth=m, bob=1 if i % 4 == 1 else 0, tail=[0, 1, 0, -1][i % 4]))
    return seq


ANIMS = [
    # emotion × activity: the stage picks by what the engine says she feels and whether she talks
    ('idle', 6, True, idle_frames()),
    ('talk', 8, True, talk_frames()),
    ('idle_happy', 6, True, idle_frames(eyes='happy', mouth='smile', extra=('blush',))),
    ('talk_happy', 8, True, talk_frames(eyes='happy', mouths=('open', 'wide', 'open', 'smile'), extra=('blush',))),
    ('idle_concerned', 6, True, idle_frames(eyes='worried', mouth='worried', brows='worried', ears='droop')),
    ('talk_concerned', 8, True, talk_frames(eyes='worried', mouths=('small', 'worried', 'small', 'worried'), brows='worried', ears='droop')),
    ('idle_surprised', 6, True, idle_frames(eyes='wide', mouth='o', ears='perk', brows='raised')),
    ('talk_surprised', 8, True, talk_frames(eyes='wide', mouths=('o', 'open', 'o', 'small'), ears='perk', brows='raised')),
    ('think', 4, True, [
        dict(eyes='up', mouth='flat', paw_r='chin', head_dx=-1, extra=('think1',)),
        dict(eyes='up', mouth='flat', paw_r='chin', head_dx=-1, extra=('think2',), tail=1),
        dict(eyes='up', mouth='flat', paw_r='chin', head_dx=-1, extra=('think3',), tail=1),
        dict(eyes='closed', mouth='flat', paw_r='chin', head_dx=-1, extra=('think3',), ears='twitch_l'),
        dict(eyes='up', mouth='flat', paw_r='chin', head_dx=-1, extra=(), tail=-1),
        dict(eyes='side', mouth='flat', paw_r='chin', head_dx=-1, extra=('think1',), tail=-1),
    ]),
    ('talk_think', 8, True, talk_frames(eyes='half', brows='focus', paw_r='point')),
    ('listen', 5, True, [
        dict(eyes='open', mouth='closed', head_dx=1),
        dict(eyes='open', mouth='closed', head_dx=1, ears='twitch_l'),
        dict(eyes='open', mouth='closed', head_dx=1, bob=1, tail=1),
        dict(eyes='blink', mouth='closed', head_dx=1, bob=1, tail=1),
        dict(eyes='open', mouth='closed', head_dx=1, tail=0),
        dict(eyes='open', mouth='smile', head_dx=1, tail=-1),
    ]),
    # gestures: played once, then the stage returns to the emotion loop
    ('wave', 8, False, [
        dict(eyes='happy', mouth='open', paw_r='wave1', extra=('blush',)),
        dict(eyes='happy', mouth='wide', paw_r='wave2', extra=('blush',)),
        dict(eyes='happy', mouth='open', paw_r='wave3', extra=('blush',)),
        dict(eyes='happy', mouth='wide', paw_r='wave2', extra=('blush',)),
        dict(eyes='happy', mouth='open', paw_r='wave1', extra=('blush',)),
        dict(eyes='happy', mouth='wide', paw_r='wave2', extra=('blush',)),
        dict(eyes='happy', mouth='open', paw_r='wave3', extra=('blush',)),
        dict(eyes='happy', mouth='smile', paw_r='wave1', extra=('blush',)),
    ]),
    ('nod', 8, False, [
        dict(eyes='open', mouth='closed'),
        dict(eyes='half', mouth='smile', head_dy=1),
        dict(eyes='closed', mouth='smile', head_dy=2),
        dict(eyes='half', mouth='smile', head_dy=1),
        dict(eyes='open', mouth='closed'),
        dict(eyes='closed', mouth='smile', head_dy=2),
        dict(eyes='open', mouth='smile'),
    ]),
    ('bow', 6, False, [
        dict(eyes='open', mouth='smile'),
        dict(eyes='closed', mouth='smile', bow=2, paw_r='bow', paw_l='bow'),
        dict(eyes='closed', mouth='smile', bow=3, paw_r='bow', paw_l='bow'),
        dict(eyes='closed', mouth='smile', bow=3, paw_r='bow', paw_l='bow'),
        dict(eyes='closed', mouth='smile', bow=2, paw_r='bow', paw_l='bow'),
        dict(eyes='happy', mouth='smile', extra=('blush',)),
    ]),
    ('surprise', 10, False, [
        dict(eyes='open', mouth='closed'),
        dict(eyes='wide', mouth='o', ears='perk', brows='raised', bob=-1, extra=('bang',)),
        dict(eyes='wide', mouth='o', ears='perk', brows='raised', bob=-1, extra=('bang',)),
        dict(eyes='wide', mouth='o', ears='perk', brows='raised', extra=('bang',)),
        dict(eyes='wide', mouth='o', ears='perk', brows='raised', extra=('bang',)),
        dict(eyes='wide', mouth='small', ears='perk', brows='raised'),
    ]),
    ('explain', 8, False, [
        dict(eyes='open', mouth='small', paw_l='open'),
        dict(eyes='open', mouth='open', paw_l='open', bob=1),
        dict(eyes='open', mouth='small', paw_l='open'),
        dict(eyes='happy', mouth='open', paw_l='open', paw_r='open'),
        dict(eyes='happy', mouth='wide', paw_l='open', paw_r='open', extra=('sparkle1',)),
        dict(eyes='happy', mouth='open', paw_l='open', paw_r='open', extra=('sparkle2',)),
        dict(eyes='open', mouth='small'),
    ]),
    ('bless', 6, False, [
        dict(eyes='closed', mouth='smile', paw_l='open', paw_r='open', extra=('sparkle1',)),
        dict(eyes='closed', mouth='smile', paw_l='open', paw_r='open', extra=('sparkle2', 'bless')),
        dict(eyes='closed', mouth='smile', paw_l='open', paw_r='open', extra=('sparkle1', 'bless')),
        dict(eyes='happy', mouth='smile', paw_l='open', paw_r='open', extra=('sparkle2', 'blush')),
        dict(eyes='happy', mouth='smile', extra=('blush',)),
    ]),
    ('fret', 6, False, [
        dict(eyes='worried', mouth='worried', brows='worried', ears='droop', extra=('sweat',)),
        dict(eyes='worried', mouth='worried', brows='worried', ears='droop', bob=1, extra=('sweat',)),
        dict(eyes='closed', mouth='worried', brows='worried', ears='droop', bob=1, extra=('sweat',)),
        dict(eyes='worried', mouth='worried', brows='worried', ears='droop', extra=('sweat',)),
    ]),
]


# ── background: the reading room ───────────────────────────────────────────────────────────────────
BG_W, BG_H = 64, 100
CAT_X, CAT_Y = 8, 34        # where the 48x48 cat frame sits in the room

BG_PAL = {
    'wal': '#2a2146', 'wsh': '#211a39', 'wli': '#352a57',
    'bea': '#4a2f28', 'bli': '#6b4533',
    'sky': '#161c48', 'sk2': '#1f2760', 'moo': '#fff1b8', 'mos': '#f0d98a',
    'sta': '#fff7d6', 'fra': '#7a5236', 'frl': '#a0714c',
    'flo': '#5c3a28', 'fls': '#4a2e20', 'fll': '#6e4632',
    'rug': '#7a2e3e', 'rgl': '#a8475a', 'rgg': '#e0b44f',
    'lan': '#d9483c', 'las': '#a8302a', 'lab': '#3c5bb0', 'lag': '#ffd98a', 'lgl': '#5a3e5e',
    'tal': '#f2d36b', 'tar': '#c4302b',
    'pot': '#6a6f7a', 'pos': '#4a4e58', 'smk': '#b7b0d8', 'emb': '#ff9a3c',
}


def draw_background():
    c = Canvas(BG_W, BG_H)
    c.rect(0, 0, BG_W - 1, 71, 'wal')
    # wall panels
    for x in range(0, BG_W, 16):
        c.rect(x, 12, x, 71, 'wsh')
    c.rect(0, 0, BG_W - 1, 9, 'wsh')
    c.rect(0, 10, BG_W - 1, 11, 'bea')
    c.rect(0, 10, BG_W - 1, 10, 'bli')
    c.rect(0, 0, 2, 71, 'bea'); c.rect(61, 0, 63, 71, 'bea')
    c.rect(2, 0, 2, 71, 'bli'); c.rect(61, 0, 61, 71, 'bli')
    c.rect(0, 66, BG_W - 1, 71, 'bea')
    c.rect(0, 66, BG_W - 1, 66, 'bli')
    # moon window, framed behind his head like a halo
    cx, cy, r = 32, 46, 17
    c.ellipse(cx, cy, r + 1.5, r + 1.5, 'fra')
    c.ellipse(cx, cy, r + 0.5, r + 0.5, 'frl')
    c.ellipse(cx, cy, r - 0.5, r - 0.5, 'sky')
    for y in range(BG_H):
        for x in range(BG_W):
            if c.get(x, y) == 'sky' and (y - cy) > 4:
                c.set(x, y, 'sk2')
    c.ellipse(41, 36, 5.2, 5.2, 'moo')
    for x, y in [(43, 38), (44, 36), (40, 39), (41, 39)]:
        c.set(x, y, 'mos')
    # lattice
    for y in range(BG_H):
        for x in range(BG_W):
            if c.get(x, y) in ('sky', 'sk2', 'moo', 'mos') and (x == cx or y == cy):
                c.set(x, y, 'fra')
    # lantern (청사초롱), left
    c.rect(8, 12, 8, 17, 'lgl')
    c.rect(5, 18, 11, 19, 'lab')
    c.rect(5, 20, 11, 27, 'lan')
    c.rect(10, 20, 11, 27, 'las')
    c.rect(5, 28, 11, 29, 'lab')
    c.rect(7, 22, 8, 25, 'lag')
    c.rect(8, 30, 8, 33, 'rgg')
    # talisman (부적), right
    c.rect(52, 18, 57, 30, 'tal')
    for x, y in [(54, 20), (55, 21), (54, 22), (56, 22), (55, 24), (54, 26), (55, 26), (56, 27), (55, 28)]:
        c.set(x, y, 'tar')
    c.rect(52, 18, 57, 18, 'tar')
    # floor
    c.rect(0, 72, BG_W - 1, BG_H - 1, 'flo')
    for y in range(74, BG_H, 5):
        c.rect(0, y, BG_W - 1, y, 'fls')
        off = (y * 7) % 13
        for x in range(off, BG_W, 13):
            c.set(x, y + 1, 'fls'); c.set(x, y + 2, 'fls')
    c.rect(0, 72, BG_W - 1, 72, 'fll')
    # rug under the table
    c.rect(6, 80, 57, 94, 'rug')
    c.rect(7, 81, 56, 93, 'rgl')
    c.rect(8, 82, 55, 92, 'rug')
    for x in range(10, 55, 4):
        c.set(x, 87, 'rgg'); c.set(x + 1, 86, 'rgg'); c.set(x + 1, 88, 'rgg'); c.set(x + 2, 87, 'rgg')
    # incense burner on the floor, right
    c.rect(57, 75, 61, 78, 'pot')
    c.rect(56, 74, 62, 74, 'pos')
    c.rect(57, 78, 61, 78, 'pos')
    c.set(59, 73, 'emb')
    return c


def draw_room_overlays():
    """Ambient loop drawn over the room: stars twinkle, lantern glow breathes, incense smoke rises."""
    frames = []
    stars_a = [(22, 38), (27, 33), (20, 47), (35, 55), (25, 58)]
    stars_b = [(24, 36), (29, 40), (19, 52), (38, 51), (28, 56)]
    smoke = [(59, 71), (60, 69), (59, 67), (58, 65), (59, 63), (60, 61)]
    for i in range(4):
        c = Canvas(BG_W, BG_H)
        for (x, y) in (stars_a if i % 2 == 0 else stars_b):
            c.set(x, y, 'sta')
        if i in (1, 2):
            c.set(7, 21, 'lag'); c.set(9, 26, 'lag')
        for k, (x, y) in enumerate(smoke):
            if (k + i) % 4 != 3:
                c.set(x + (1 if (k + i) % 3 == 0 else 0), y - (i % 2), 'smk')
        frames.append(c)
    return frames


# ── export ─────────────────────────────────────────────────────────────────────────────────────────

def to_image(canvas, pal, scale, bg=None):
    img = Image.new('RGBA', (canvas.w, canvas.h), (0, 0, 0, 0) if bg is None else bg)
    for y in range(canvas.h):
        for x in range(canvas.w):
            c = canvas.px[y][x]
            if c is not None:
                img.putpixel((x, y), _rgb(pal[c]) + (255,))
    return img.resize((canvas.w * scale, canvas.h * scale), Image.NEAREST)


def _rgb(h):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16))


def compose_room(cat_canvas, overlay=None):
    room = draw_background()
    if overlay is not None:
        room.paste(overlay)
    room.paste(cat_canvas, CAT_X, CAT_Y)
    return room


ALL_PAL = dict(BG_PAL)
ALL_PAL.update(PAL)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', help='write contact sheets here')
    ap.add_argument('--no-assets', action='store_true', help='skip the jpg card/strip exports')
    args = ap.parse_args()

    keys = list(ALL_PAL.keys())
    pal_index = {k: i for i, k in enumerate(keys)}

    anims = []
    for name, fps, loop, poses in ANIMS:
        frames = [render(p) for p in poses]
        anims.append((name, fps, loop, frames))

    bg = draw_background()
    overlays = draw_room_overlays()

    # ── TS module ──
    lines = [
        '/* eslint-disable */',
        '// GENERATED by tools/pixelcat/gen_pixel_cat.py — do not edit; change the script and re-run.',
        '//',
        '// Each image is a run-length string, row-major: a palette symbol (its index in ALPHA below; a dot = empty), then\n// the run length when it is more than 1. `pixelArt.ts` turns them into SVG paths once, on first use.',
        'import type { PixelArt } from "./types";',
        '',
        'export const CAT_ART: PixelArt = {',
        f'  palette: {keys_to_ts([ALL_PAL[k] for k in keys])},',
        f"  alphabet: '{ALPHA}',",
        f'  room: {{ w: {BG_W}, h: {BG_H}, catX: {CAT_X}, catY: {CAT_Y}, catSize: {W} }},',
        f'  background: {to_rle(bg, pal_index)},',
        f'  ambient: [{", ".join(to_rle(o, pal_index) for o in overlays)}],',
        '  anims: {',
    ]
    for name, fps, loop, frames in anims:
        fr = ', '.join(to_rle(f, pal_index) for f in frames)
        lines.append(f'    {name}: {{ fps: {fps}, loop: {"true" if loop else "false"}, frames: [{fr}] }},')
    lines += ['  },', '};', '']
    out_ts = os.path.join(ROOT, 'src/features/counseling/pixel/catArt.generated.ts')
    os.makedirs(os.path.dirname(out_ts), exist_ok=True)
    with open(out_ts, 'w') as f:
        f.write('\n'.join(lines))
    print('wrote', os.path.relpath(out_ts, ROOT), f'{os.path.getsize(out_ts) // 1024}KB')

    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        S = 8
        for name, fps, loop, frames in anims:
            sheet = Image.new('RGBA', (len(frames) * (W * S + S), H * S), (40, 32, 70, 255))
            for i, f in enumerate(frames):
                sheet.paste(to_image(f, ALL_PAL, S), (i * (W * S + S), 0), to_image(f, ALL_PAL, S))
            sheet.save(os.path.join(args.preview, f'{name}.png'))
        room = compose_room(anims[0][3][0], overlays[0])
        to_image(room, ALL_PAL, 6).save(os.path.join(args.preview, 'room.png'))
        print('previews in', args.preview)

    if not args.no_assets:
        export_assets(anims, overlays)


ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-/:;<=>?@[]^_{|}~'


def to_rle(canvas, pal_index):
    """Row-major run-length string: a palette letter ('.' = empty), then the run length if > 1."""
    out = []
    flat = [c for row in canvas.px for c in row]
    i = 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i]:
            j += 1
        ch = '.' if flat[i] is None else ALPHA[pal_index[flat[i]]]
        out.append(ch + (str(j - i) if j - i > 1 else ''))
        i = j
    return "'" + ''.join(out) + "'"


def keys_to_ts(vals):
    return '[' + ', '.join(f"'{v}'" for v in vals) + ']'


def export_assets(anims, overlays):
    """Card and avatar as PNG at a large whole-number scale.

    PNG, not JPEG: JPEG rings around every hard edge, and pixel art is nothing but hard edges. And
    big, because RN scales images linearly — shrinking a sharp bitmap stays sharp, enlarging one
    blurs it. At 20x the card is wider than any phone shows it, so it is only ever shrunk.
    (The detail-screen previews are not exported at all: PixelCatClip draws them live.)
    """
    by = {name: frames for name, _, _, frames in anims}
    assets = os.path.join(ROOT, 'src/features/counselors/assets')
    s = 20
    room = compose_room(by['idle_happy'][0], overlays[0])
    big = to_image(room, ALL_PAL, s).convert('RGB')             # 1280 x 2000
    # Tight on him — the card is small in the feed, and the room is the detail screen's to show.
    cw = 44 * s
    ch = int(round(cw / 0.82))
    left, top = (CAT_X + 2) * s, (CAT_Y - 5) * s
    big.crop((left, top, left + cw, top + ch)).save(os.path.join(assets, 'nabi.png'), optimize=True)

    ax0, ay0 = (CAT_X + 5) * s, (CAT_Y - 1) * s
    big.crop((ax0, ay0, ax0 + 38 * s, ay0 + 38 * s)).save(os.path.join(assets, 'nabi_avatar.png'), optimize=True)
    print('wrote card and avatar')


if __name__ == '__main__':
    main()
