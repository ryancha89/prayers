"""Generate the reference-led texture pass without changing the original temple assets.

Run with Python + numpy + Pillow; see assets/mountain-temple/TEXTURING.md.
    Imagegen assets in textures-v2 are retained verbatim.
"""
import ast
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/mountain-temple/textures-v2'
OUT.mkdir(parents=True, exist_ok=True)
RNG = np.random.default_rng(430)


def save(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 1) * 255)).save(OUT / (name + '.png'))


def periodic(w, h, gx=12, gy=12):
    a = RNG.random((gy, gx))
    # Three repeated tiles, crop the centre: interpolation wraps at every edge.
    im = Image.fromarray(np.uint8(np.tile(a, (3, 3)) * 255))
    return np.asarray(im.resize((w * 3, h * 3), Image.Resampling.BICUBIC), dtype=float)[h:h*2, w:w*2] / 255


def maps(name, height, roughness, strength=1):
    save(name + '_height', height)
    save(name + '_roughness', roughness)
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    normal = np.stack((-dx, -dy, np.ones_like(dx)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    save(name + '_normal', normal * .5 + .5)


def painted_patterns():
    # Reuse the editable original drawing functions with a mineral-pigment palette.
    # Do not execute the original top-level batch or replace the imagegen assets.
    source = ROOT / 'tools/gen_mountain_temple_textures.py'
    tree = ast.parse(source.read_text())
    tree.body = [n for n in tree.body if not isinstance(n, ast.For)]
    namespace = {'__name__': 'temple_pattern_source'}
    old_args = sys.argv
    sys.argv = [str(source), str(OUT)]
    exec(compile(tree, str(source), 'exec'), namespace)
    sys.argv = old_args
    namespace.update(GREEN=(37, 75, 61), DKGREEN=(22, 42, 34), BLUE=(28, 48, 66),
                     SKY=(63, 99, 103), RED=(91, 37, 29), VERMIL=(144, 63, 39),
                     YELLOW=(179, 129, 57), WHITE=(182, 167, 127), PINK=(154, 83, 75))
    original_save = namespace['save']

    def weather(a, name):
        h, w = a.shape[:2]
        patina = .82 + .18 * periodic(w, h, 24, 12)
        a = a * patina[..., None]
        original_save(a, name)

    namespace['save'] = weather
    for name in ('beam', 'bracket', 'rafter', 'coffer', 'lattice_door', 'plaster', 'paper'):
        namespace[name]()


def wood():
    w = h = 2048
    y, x = np.mgrid[0:h, 0:w] / w
    field = periodic(w, h, 7, 50)
    grain = periodic(w, h, 8, 800)
    fine = periodic(w, h, 36, 1800)
    ring = .5 + .5 * np.sin(y * 1000 + field * 5 + np.sin(x * math.tau) * 2)
    courses = np.floor(y * 16).astype(int)
    tones = RNG.uniform(.84, 1.15, 16)[courses]
    along = (x + (courses % 3) / 3) % 1
    seams = ((y * 16) % 1 < .012) | (along < .0018)
    a = np.array([.48, .265, .125]) * (tones * (.80 + .14*grain + .07*ring + .06*field))[..., None]
    a[seams] *= .36
    save('wood_floor', a)
    height = .58 + .045*grain + .016*fine + .008*ring
    height[seams] = .28
    maps('wood_floor', height, np.clip(.245 + .09*grain + .06*field + seams*.16, 0, 1), 2)
    w, h = 1024, 2048
    field = periodic(w, h, 80, 6)
    grain = periodic(w, h, 640, 8)
    pores = periodic(w, h, 1000, 60)
    a = np.array([.345, .142, .080]) * (.75 + .25*field + .15*grain)[..., None]
    save('wood_red', a)
    maps('wood_red', .52+.05*grain+.025*field+.009*pores, .32+.14*field+.05*pores, 1.2)
    save('wood_brown', a * np.array([.72, .83, .92]))
    maps('wood_brown', .52+.05*grain+.025*field, .40+.15*field, 1)


def surfaces():
    w = h = 1024
    y, x = np.mgrid[0:h, 0:w] / w
    coarse, medium, fine = periodic(w,h,12,12), periodic(w,h,120,120), RNG.random((h,w))
    save('plaster', np.array([.43,.35,.265]) * (.94+.06*coarse)[...,None])
    crystal = (fine > .985).astype(float)
    save('granite', np.array([.58,.55,.49]) * (.87+.18*coarse+.09*medium)[...,None] + crystal[...,None]*.1)
    maps('granite', .4+.09*medium+.035*fine, .78+.12*coarse, 1.5)
    save('roof_tile', np.array([.12,.14,.16]) * (.75+.35*coarse+.15*medium)[...,None])
    maps('roof_tile', .48+.09*medium+.02*fine, .48+.22*coarse, 1)
    # Fine gold-leaf squares with irregular boundaries, never deep black seams.
    gold = .84+.1*coarse+.04*medium
    seams = ((x*8 + coarse*.04)%1<.014) | ((y*8+coarse*.04)%1<.014)
    gold[seams] *= .94
    save('gold_leaf', np.array([.83,.565,.23])*gold[...,None])
    maps('gold_leaf', .5+.013*medium+.004*fine-seams*.006, .25+.11*coarse+.035*medium, .65)
    maps('paint', .48+.012*medium+.005*fine, .55+.2*coarse, 1)
    # Crossed warp/weft, deliberately shallow to avoid an inflated fabric surface.
    weave = .5+.2*np.sin(x*math.tau*256)*np.sin(y*math.tau*256)
    maps('fabric', .48+.035*weave+.005*fine, .76+.12*coarse, 1.1)
    maps('paper', .5+.018*medium+.006*fine, .86+.07*coarse, 1)
    maps('plaster', .5+.05*coarse+.018*medium, .83+.12*coarse, 1)


if __name__ == '__main__':
    painted_patterns()
    wood()
    surfaces()
    print('Generated PBR textures:', OUT, flush=True)
