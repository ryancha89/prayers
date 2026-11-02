"""Mountain Temple (산사 대웅전) — the hall the players sit in together, and its courtyard.

    Blender -b --python tools/blender/build_mountain_temple.py -- assets/mountain-temple [fast]
    textures first:  python3 tools/gen_mountain_temple_textures.py assets/mountain-temple/textures

Outputs <out>/mountain_temple.blend, mountain_temple.fbx, previews/{exterior,interior,aerial}.png, seats.json.

The style follows the concept (assets/mountain-temple/concepts/exterior_sunset.png) and the Prayers
environments: warm sunset light, a painterly-clean finish, 단청 colour on dark slate tiles and pale
granite. Everything is built here from the real structure of a Korean Buddhist hall — the parts are
named the way a carpenter would name them, because that is what makes it read as a 대웅전:

  기단 (raised granite platform) · 초석 (column bases) · 배흘림 기둥 (columns swelling at a third of
  their height) · 창방 / 평방 (lintels) · 다포 공포 (bracket clusters on and between the columns) ·
  도리 (purlins) · 서까래 / 부연 (round and square rafters) · 팔작지붕 (hip-and-gable roof) with 앙곡
  (corners lifted) and 안허리 (corners pushed out in plan), 기와 rows, 막새 end tiles, 용마루 /
  내림마루 / 추녀마루 ridges · 꽃살문 doors · 우물천장 coffered ceiling · 수미단 altar · 닫집 canopy.

Layout (metres, Z up). The hall's front faces -Y, toward the courtyard. The court is z = 0.
  hall columns   7 × 5 bays, x ∈ [-11, 11], y ∈ [-9, 9]
  hall floor     z = FLOOR_Z, 110 cushions in 10 columns × 11 rows with a 1.6 m middle aisle
  Buddha         on the altar at y ≈ 6.9, facing -Y
Empties the game reads: Seat_RR_CC (each cushion, facing the Buddha), Marker_Spawn (courtyard),
Marker_HallDoor, Marker_Buddha, Marker_BellPavilion, Marker_CameraHall.
Material names TEMPLE_* are the contract with Unity.
"""
import json
import math
import os
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = Path(argv[0] if argv else "assets/mountain-temple").resolve()
FAST = "fast" in argv
TEX = OUT / "textures"
PREV = OUT / "previews"
PREV.mkdir(parents=True, exist_ok=True)
random.seed(11)

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene

# ------------------------------------------------------------------------------------------ plan
BAYS_X = [3.0, 3.0, 3.2, 3.6, 3.2, 3.0, 3.0]
BAYS_Y = [3.0, 4.0, 4.0, 4.0, 3.0]
HX = sum(BAYS_X) / 2          # 11
HY = sum(BAYS_Y) / 2          # 9
XS = [-HX + sum(BAYS_X[:i]) for i in range(len(BAYS_X) + 1)]
YS = [-HY + sum(BAYS_Y[:i]) for i in range(len(BAYS_Y) + 1)]
TERR_Z = 1.2                  # 기단 top
FLOOR_Z = 1.45                # 마루
BASE_H = 0.35                 # 초석
COL_Z0 = TERR_Z + BASE_H
COL_H = 4.4
COL_TOP = COL_Z0 + COL_H      # 5.95
CHANG_H = 0.5                 # 창방
PYEONG_H = 0.25               # 평방
BRK_Z0 = COL_TOP + PYEONG_H   # brackets start
BRK_H = 1.15
EAVE_Z = 7.25                 # roof edge at the middle of a side
OVER = 2.5                    # 처마 내밀기 beyond the column line
RIDGE_H = 4.2                 # eave → ridge
CEIL_Z = FLOOR_Z + 5.0        # coffered ceiling

# ------------------------------------------------------------------------------------- materials
MATS = {}


def mat(name, color=(0.8, 0.8, 0.8), tex=None, rough=0.7, metal=0.0, emit=0.0, emit_color=None, alpha=False,
        scale=None):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if tex:
        img = bpy.data.images.load(str(TEX / tex), check_existing=True)
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        if alpha:
            nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
            m.blend_method = "CLIP" if hasattr(m, "blend_method") else None
            try:
                m.surface_render_method = "DITHERED"
            except Exception:
                pass
    if emit:
        b.inputs["Emission Color"].default_value = (*(emit_color or color), 1)
        b.inputs["Emission Strength"].default_value = emit
    MATS[name] = m
    return m


M = {
    "stone": mat("TEMPLE_Granite", tex="granite.png", rough=0.85),
    "paving": mat("TEMPLE_Paving", tex="paving.png", rough=0.9),
    "red": mat("TEMPLE_WoodRed", tex="wood_red.png", rough=0.45),
    "brown": mat("TEMPLE_WoodBrown", tex="wood_brown.png", rough=0.6),
    "beam": mat("TEMPLE_Dancheong", tex="dancheong_beam.png", rough=0.6),
    "bracket": mat("TEMPLE_Bracket", tex="dancheong_bracket.png", rough=0.6),
    "rafter_end": mat("TEMPLE_RafterEnd", tex="dancheong_rafter.png", rough=0.6),
    "green": mat("TEMPLE_Green", (0.17, 0.42, 0.31), rough=0.6),
    "soffit": mat("TEMPLE_Soffit", (0.14, 0.36, 0.28), rough=0.7),
    "tile": mat("TEMPLE_RoofTile", tex="roof_tile.png", rough=0.55),
    "ridge": mat("TEMPLE_Ridge", (0.16, 0.17, 0.2), rough=0.5),
    "lime": mat("TEMPLE_RidgeLime", (0.86, 0.84, 0.78), rough=0.8),
    "floor": mat("TEMPLE_Floor", tex="wood_floor.png", rough=0.32),
    "coffer": mat("TEMPLE_Coffer", tex="coffer.png", rough=0.7),
    "door": mat("TEMPLE_Lattice", tex="lattice_door.png", rough=0.6, alpha=True),
    "paper": mat("TEMPLE_Paper", tex="paper.png", rough=0.9, emit=0.15, emit_color=(1.0, 0.85, 0.6)),
    "plaster": mat("TEMPLE_Plaster", tex="plaster.png", rough=0.9),
    "gold": mat("TEMPLE_Gold", (1.0, 0.72, 0.30), rough=0.28, metal=1.0),
    "taenghwa": mat("TEMPLE_Taenghwa", tex="taenghwa.png", rough=0.8),
    "halo": mat("TEMPLE_Halo", tex="halo.png", rough=0.5, metal=0.0, alpha=True, emit=0.4, emit_color=(1.0, 0.75, 0.4)),
    "cushion": mat("TEMPLE_Cushion", tex="cushion.png", rough=0.85),
    "cushion_side": mat("TEMPLE_CushionSide", (0.42, 0.07, 0.09), rough=0.9),
    "bronze": mat("TEMPLE_Bronze", (0.32, 0.36, 0.30), rough=0.4, metal=0.9),
    "brass": mat("TEMPLE_Brass", (0.85, 0.62, 0.28), rough=0.3, metal=1.0),
    "candle": mat("TEMPLE_Candle", (0.95, 0.92, 0.84), rough=0.6),
    "flame": mat("TEMPLE_Flame", (1.0, 0.7, 0.3), emit=12.0),
    "lantern_pink": mat("TEMPLE_LanternPink", (1.0, 0.55, 0.62), emit=3.0),
    "lantern_white": mat("TEMPLE_LanternWhite", (1.0, 0.92, 0.80), emit=3.0),
    "lantern_gold": mat("TEMPLE_LanternGold", (1.0, 0.78, 0.40), emit=3.0),
    "stone_light": mat("TEMPLE_StoneLanternGlow", (1.0, 0.75, 0.42), emit=6.0),
    "lotus": mat("TEMPLE_LotusFlower", (0.98, 0.62, 0.68), rough=0.6),
    "leaf": mat("TEMPLE_LotusLeaf", (0.25, 0.48, 0.30), rough=0.6),
    "bark": mat("TEMPLE_Bark", (0.30, 0.20, 0.15), rough=0.9),
    "pine": mat("TEMPLE_Pine", tex="leaves_pine.png", rough=0.8, alpha=True, emit=0.08, emit_color=(0.3, 0.5, 0.25)),
    "maple": mat("TEMPLE_Maple", tex="leaves_maple.png", rough=0.8, alpha=True),
    "rock": mat("TEMPLE_Rock", tex="granite.png", rough=0.9),
    "ground": mat("TEMPLE_Ground", (0.30, 0.36, 0.17), rough=1.0),
    "sky": mat("TEMPLE_Sky", tex="sky_sunset.png", rough=1.0),
    "rope": mat("TEMPLE_Rope", (0.55, 0.20, 0.16), rough=0.8),
}
# the sky shows its painting as light, not as a lit surface
_sky = M["sky"].node_tree
_b = _sky.nodes["Principled BSDF"]
_t = [n for n in _sky.nodes if n.type == "TEX_IMAGE"][0]
_sky.links.new(_t.outputs["Color"], _b.inputs["Emission Color"])
_b.inputs["Emission Strength"].default_value = 1.0
_b.inputs["Base Color"].default_value = (0, 0, 0, 1)

# ----------------------------------------------------------------------------------- geometry kit
BATCH = {}   # (object name, material key) → bmesh


def bm_for(obj, mkey):
    key = (obj, mkey)
    if key not in BATCH:
        BATCH[key] = bmesh.new()
    return BATCH[key]


def T(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return (Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y")
            @ Matrix.Rotation(rot[0], 4, "X") @ Matrix.Diagonal((*scale, 1)))


def box(obj, mkey, center, size, rot=(0, 0, 0)):
    bmesh.ops.create_cube(bm_for(obj, mkey), size=1.0, matrix=T(center, rot, size))


def cyl(obj, mkey, center, r, depth, segs=12, rot=(0, 0, 0), r2=None):
    bmesh.ops.create_cone(bm_for(obj, mkey), cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                          radius2=r if r2 is None else r2, depth=depth, matrix=T(center, rot))


def between(obj, mkey, a, b, r, segs=8, r2=None):
    a, b = Vector(a), Vector(b)
    d = b - a
    q = d.to_track_quat("Z", "Y")
    m = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
    bmesh.ops.create_cone(bm_for(obj, mkey), cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                          radius2=r if r2 is None else r2, depth=d.length, matrix=m)


def sphere(obj, mkey, center, radius, scale=(1, 1, 1), segs=(12, 8), rot=(0, 0, 0)):
    bmesh.ops.create_uvsphere(bm_for(obj, mkey), u_segments=segs[0], v_segments=segs[1], radius=radius,
                              matrix=T(center, rot, scale))


def lathe(obj, mkey, center, profile, segs=16, rot=(0, 0, 0)):
    """profile: [(radius, z)] bottom to top; closed with caps."""
    bm = bm_for(obj, mkey)
    m = T(center, rot)
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring.append(bm.verts.new(m @ Vector((math.cos(a) * r, math.sin(a) * r, z))))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    for ring, flip in ((rings[0], True), (rings[-1], False)):
        if len({tuple(round(c, 5) for c in v.co) for v in ring}) > 2:
            bm.faces.new(list(reversed(ring)) if flip else ring)


def quad(obj, mkey, pts, uvs=None):
    bm = bm_for(obj, mkey)
    vs = [bm.verts.new(Vector(p)) for p in pts]
    f = bm.faces.new(vs)
    if uvs:
        uv = bm.loops.layers.uv.verify()
        for loop, (u, v) in zip(f.loops, uvs):
            loop[uv].uv = (u, v)
    return f


def sweep(obj, mkey, pts, w, h, up=Vector((0, 0, 1))):
    """A rectangular bar along a polyline (ridges)."""
    bm = bm_for(obj, mkey)
    pts = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = t.cross(up).normalized()
        u2 = side.cross(t).normalized()
        c = [p + side * (w / 2) + u2 * 0, p + side * (w / 2) + u2 * h, p - side * (w / 2) + u2 * h,
             p - side * (w / 2)]
        rings.append([bm.verts.new(v) for v in c])
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


# UV projection settings per object: (sx, sy, sz) metres per texture repeat. None → keep loops' UVs.
UVS = {}


def project_uv(o, s):
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers[0].data
    zmin = min(v.co.z for v in me.vertices) if me.vertices else 0
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 2:
                uv[li].uv = (co.x / s[0], co.y / s[1])
            elif ax == 1:
                uv[li].uv = (co.x / s[0], (co.z - zmin) / s[2])
            else:
                uv[li].uv = (co.y / s[1], (co.z - zmin) / s[2])


OBJECTS = []
COLL = {}


def coll(name):
    if name not in COLL:
        c = bpy.data.collections.new(name)
        SC.collection.children.link(c)
        COLL[name] = c
    return COLL[name]


def flush(group="Temple"):
    for (name, mkey), bm in list(BATCH.items()):
        if not bm.faces:
            bm.free()
            continue
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.validate()
        o = bpy.data.objects.new(name if mkey == "_" else f"{name}_{mkey}", me)
        coll(group).objects.link(o)
        o.data.materials.append(M[mkey])
        s = UVS.get(name, UVS.get(mkey))
        if s:
            project_uv(o, s)
        for p in me.polygons:
            p.use_smooth = mkey in ("gold", "red", "bronze", "brass", "lotus", "lantern_pink", "lantern_white",
                                    "lantern_gold", "cushion", "rock", "bark", "candle", "ground")
        OBJECTS.append(o)
    BATCH.clear()


def empty(name, loc, rot=(0, 0, 0), group="Markers"):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.rotation_euler = rot
    e.empty_display_size = 0.4
    coll(group).objects.link(e)
    return e


UVS.update({
    "stone": (3.0, 3.0, 3.0), "paving": (7.0, 7.0, 7.0), "red": (1.2, 1.2, 3.0), "brown": (1.0, 1.0, 1.0),
    "beam": (4.0, 4.0, 0.5), "bracket": (0.5, 0.5, 0.5), "floor": (4.0, 4.0, 4.0), "coffer": (1.5, 1.5, 1.5),
    "plaster": (2.0, 2.0, 2.0), "paper": (1.0, 1.0, 1.0), "cushion": (0.82, 0.82, 0.82), "tile": (3.0, 3.0, 3.0),
    "soffit": (2, 2, 2), "rock": (2, 2, 2), "ground": (8, 8, 8),
})

# ===================================================================================== the hall
def build_hall(cx=0.0, cy=0.0, bays_x=BAYS_X, bays_y=BAYS_Y, terr_z=TERR_Z, col_h=COL_H, over=OVER,
               ridge_h=RIDGE_H, gable=True, prefix="Hall", main=True):
    hx, hy = sum(bays_x) / 2, sum(bays_y) / 2
    xs = [cx - hx + sum(bays_x[:i]) for i in range(len(bays_x) + 1)]
    ys = [cy - hy + sum(bays_y[:i]) for i in range(len(bays_y) + 1)]
    col_z0 = terr_z + BASE_H
    col_top = col_z0 + col_h
    brk_z0 = col_top + PYEONG_H
    eave_z = brk_z0 + BRK_H - 0.1

    # -------- 초석 and 배흘림 columns on the perimeter
    perim = [(x, y) for x in xs for y in (ys[0], ys[-1])] + [(x, y) for y in ys[1:-1] for x in (xs[0], xs[-1])]
    prof = []
    for k in range(11):
        t = k / 10
        r = 0.27 + 0.045 * math.sin(math.pi * min(t / 0.66, 1.0) * (0.5 if t > 0.66 else 1.0)) * (1 - 0.25 * max(0, t - 0.66) / 0.34)
        prof.append((r if t < 0.33 else 0.27 + 0.045 * (1 - (t - 0.33) / 0.67 * 0.7), t * col_h))
    for (x, y) in perim:
        lathe(f"{prefix}_Bases", "stone", (x, y, terr_z), [(0.48, 0), (0.48, BASE_H * 0.6), (0.40, BASE_H), (0.0, BASE_H)], segs=12)
        lathe(f"{prefix}_Columns", "red", (x, y, col_z0), [(0, 0)] + prof + [(0, col_h)], segs=18)

    # -------- 창방 / 평방 lintels all round
    for (y0, y1, x0, x1) in ((ys[0], ys[0], xs[0], xs[-1]), (ys[-1], ys[-1], xs[0], xs[-1])):
        L = x1 - x0
        box(f"{prefix}_Beams", "beam", ((x0 + x1) / 2, y0, col_top - CHANG_H / 2), (L + 0.6, 0.32, CHANG_H))
        box(f"{prefix}_Beams", "beam", ((x0 + x1) / 2, y0, col_top + PYEONG_H / 2), (L + 0.9, 0.46, PYEONG_H))
    for x in (xs[0], xs[-1]):
        L = ys[-1] - ys[0]
        box(f"{prefix}_Beams", "beam", (x, (ys[0] + ys[-1]) / 2, col_top - CHANG_H / 2), (0.32, L + 0.6, CHANG_H))
        box(f"{prefix}_Beams", "beam", (x, (ys[0] + ys[-1]) / 2, col_top + PYEONG_H / 2), (0.46, L + 0.9, PYEONG_H))

    # -------- 다포 공포: a cluster on every column and between them
    def cluster(px, py, nx, ny):
        """nx, ny: outward normal in plan. Tiers of crossed arms grow outward and inward."""
        ang = math.atan2(ny, nx)
        rot = (0, 0, ang)
        R = Matrix.Rotation(ang, 3, "Z")

        def at(u, v, z):  # u outward, v along the wall
            return Vector((px, py, 0)) + R @ Vector((u, v, 0)) + Vector((0, 0, z))
        z = brk_z0
        box(f"{prefix}_Brackets", "bracket", at(0, 0, z + 0.11), (0.42, 0.42, 0.22), rot)          # 주두
        z += 0.22
        for tier in range(3):
            along = 0.75 + tier * 0.28
            out = 0.55 + tier * 0.42
            box(f"{prefix}_Brackets", "bracket", at(0, 0, z + 0.09), (0.16, along, 0.18), rot)      # 첨차 (along)
            box(f"{prefix}_Brackets", "bracket", at(out * 0.35, 0, z + 0.09), (out * 1.7, 0.16, 0.18), rot)  # 살미
            for s in (-1, 1):
                box(f"{prefix}_Brackets", "bracket", at(0, s * along / 2, z + 0.24), (0.2, 0.2, 0.12), rot)  # 소로
            box(f"{prefix}_Brackets", "bracket", at(out, 0, z + 0.24), (0.2, 0.2, 0.12), rot)
            box(f"{prefix}_Brackets", "bracket", at(-out * 0.6, 0, z + 0.24), (0.2, 0.2, 0.12), rot)
            z += 0.3
        # the projecting tongue (쇠서) under the eave purlin
        box(f"{prefix}_Brackets", "bracket", at(1.25, 0, z - 0.05), (0.9, 0.16, 0.14), (0, -0.25, ang))
        return z

    sides = [((ys[0]), 0, -1, xs), ((ys[-1]), 0, 1, xs)]
    for y, _, ny, line in sides:
        for i, x in enumerate(line):
            cluster(x, y, 0, ny)
            if i < len(line) - 1:
                n_mid = 2 if (line[i + 1] - x) > 3.3 else 1
                for k in range(1, n_mid + 1):
                    cluster(x + (line[i + 1] - x) * k / (n_mid + 1), y, 0, ny)
    for x, nx in ((xs[0], -1), (xs[-1], 1)):
        for i, y in enumerate(ys):
            if 0 < i < len(ys) - 1:
                cluster(x, y, nx, 0)
            if i < len(ys) - 1:
                n_mid = 2 if (ys[i + 1] - y) > 3.3 else 1
                for k in range(1, n_mid + 1):
                    cluster(x, y + (ys[i + 1] - y) * k / (n_mid + 1), nx, 0)
    for (x, y) in ((xs[0], ys[0]), (xs[-1], ys[0]), (xs[0], ys[-1]), (xs[-1], ys[-1])):
        cluster(x, y, math.copysign(0.7071, x - cx), math.copysign(0.7071, y - cy))   # corner, diagonal

    # 도리 (purlins): the outer one on the bracket tongues, the main one over the columns
    pz = brk_z0 + BRK_H - 0.12
    for off, r in ((1.55, 0.17), (0.0, 0.2)):
        for (a, b) in (((xs[0] - off, ys[0] - off), (xs[-1] + off, ys[0] - off)),
                       ((xs[0] - off, ys[-1] + off), (xs[-1] + off, ys[-1] + off)),
                       ((xs[0] - off, ys[0] - off), (xs[0] - off, ys[-1] + off)),
                       ((xs[-1] + off, ys[0] - off), (xs[-1] + off, ys[-1] + off))):
            between(f"{prefix}_Purlins", "green", (*a, pz), (*b, pz), r, segs=10)

    # -------- the roof
    roof(cx, cy, hx + over, hy + over, eave_z, ridge_h, gable, prefix, hx, hy)
    return xs, ys, col_z0, col_top


def roof(cx, cy, Xe, Ye, ze, H, gable, prefix, hx, hy):
    """팔작지붕 (gable=True) or 우진각/사모 (gable=False) over a rectangle, with 앙곡 and 안허리."""
    D = min(Xe, Ye)
    # The side (hip) slopes are steeper than the front ones (k): the hip line runs at an angle, the
    # ridge is about 60 % of the width and the gable (합각) sits high — the 팔작 proportion.
    k = 1.6 if gable else 1.0
    dj = 0.6 * Ye if gable else D             # front depth where the hip gives way to the gable
    Xg = Xe - dj / k
    P = 0.34                                  # tile pitch (one 수키와 + 암키와)
    A_LIFT = 0.95 * (Ye / 11.4) ** 0.5         # 앙곡
    B_PUSH = 0.75 * (Ye / 11.4) ** 0.5         # 안허리
    CREST = (0.0, 0.30, 0.41, 0.5, 0.59, 0.70)

    def F(d):
        return ze + H * (min(d, D) / D) ** 1.75

    def deform(x, y, z, d):
        t = min(1.0, d / D)
        ax, ay = abs(x - cx) / Xe, abs(y - cy) / Ye
        lift = A_LIFT * ax ** 4 * ay ** 4 * (1 - t) ** 1.2
        push = B_PUSH * ax ** 3 * ay ** 3 * (1 - t) ** 2
        sx, sy = math.copysign(1, x - cx), math.copysign(1, y - cy)
        return Vector((x + sx * push * 0.7071, y + sy * push * 0.7071, z + lift))

    def crest(s):
        s = s - math.floor(s)
        e = (s - 0.5) / 0.19
        return 0.1 * math.sqrt(max(0.0, 1 - e * e)) if abs(e) < 1 else -0.02 * math.sin(math.pi * s / 0.31) if s < 0.31 else -0.02 * math.sin(math.pi * (1 - s) / 0.31) if s > 0.69 else 0.0

    def samples(half):
        n = int(math.ceil(2 * half / P))
        out = []
        for kk in range(n):
            for c in CREST:
                out.append(-half + (kk + c) * P)
        out.append(-half + n * P)
        return [min(max(v, -half), half) for v in out]

    rows_hip = [0.0, 0.25, 0.6, 1.0, 1.5, 2.1, 2.8, 3.6, 4.5, 5.5]
    bmT = bm_for(f"{prefix}_Roof", "tile")
    bmS = bm_for(f"{prefix}_RoofUnder", "soffit")

    def patch(kind, sign):
        """kind 'fb' (front/back: rows inward along y) or 'side' (rows inward along x)."""
        long_half = Xe if kind == "fb" else Ye
        dmax = Ye if kind == "fb" else (dj / k if gable else Xe)
        rows = sorted({min(r, dmax) for r in rows_hip} | {dmax} | ({dj} if kind == "fb" and gable else set()))
        rows = [r for r in rows if r <= dmax] + ([] if rows[-1] >= dmax else [dmax])
        extra = [dj + (dmax - dj) * kk / 8 for kk in range(1, 8)] if kind == "fb" and gable else []
        rows = sorted(set(rows) | set(extra))
        us = samples(long_half)
        grid = []
        under = []
        for d in rows:
            if kind == "fb":
                w = (Xe - d / k) if (not gable or d <= dj) else Xg
                w = max(w, 0.0)
            else:
                w = max(Ye - d * k, 0.0)
            row, urow = [], []
            for u in us:
                uc = min(max(u, -w), w)
                c = crest((uc + long_half) / P) if abs(u) <= w + 1e-6 else crest((math.copysign(w, u) + long_half) / P)
                if kind == "fb":
                    x, y = cx + uc, cy + sign * (Ye - d)
                    dd = d
                else:
                    x, y = cx + sign * (Xe - d), cy + uc
                    dd = d * k
                z = F(dd)
                p = deform(x, y, z, dd)
                row.append(bmT.verts.new(p + Vector((0, 0, 0.12 + c))))
                urow.append(p - Vector((0, 0, 0.28 + 0.04 * (1 - min(1, dd / 2)))))
            grid.append(row)
            under.append(urow)
        for r0, r1 in zip(grid, grid[1:]):
            for i in range(len(us) - 1):
                f = (r0[i], r0[i + 1], r1[i + 1], r1[i])
                if len({v.co.to_tuple(4) for v in f}) >= 3:
                    try:
                        face = bmT.faces.new(f if (sign > 0) == (kind == "side") else tuple(reversed(f)))
                    except ValueError:
                        pass
        # underside (soffit) at a coarser step, and the fascia joining it to the tiles at the eave
        step = max(1, len(us) // 60)
        idx = list(range(0, len(us), step)) + ([len(us) - 1] if (len(us) - 1) % step else [])
        uv = [[bmS.verts.new(under[r][i]) for i in idx] for r in range(len(rows))]
        for r0, r1 in zip(uv, uv[1:]):
            for i in range(len(idx) - 1):
                f = (r0[i], r0[i + 1], r1[i + 1], r1[i])
                if len({v.co.to_tuple(4) for v in f}) >= 3:
                    try:
                        bmS.faces.new(tuple(reversed(f)) if (sign > 0) == (kind == "side") else f)
                    except ValueError:
                        pass
        fas = [bmS.verts.new(under[0][i]) for i in idx]
        top = [bmS.verts.new(grid[0][i].co.copy()) for i in idx]
        for i in range(len(idx) - 1):
            f = (fas[i], fas[i + 1], top[i + 1], top[i])
            if len({v.co.to_tuple(4) for v in f}) >= 3:
                try:
                    bmS.faces.new(f if (sign > 0) == (kind == "side") else tuple(reversed(f)))
                except ValueError:
                    pass
        return rows, us, grid

    for sgn in (-1, 1):
        rows, us, grid = patch("fb", sgn)
        # 막새 end tiles on every crest along the eave
        for kk in range(int(math.ceil(2 * Xe / P))):
            u = -Xe + (kk + 0.5) * P
            if abs(u) > Xe - 0.1:
                continue
            p = deform(cx + u, cy + sgn * Ye, F(0), 0) + Vector((0, 0, 0.14))
            cyl(f"{prefix}_RoofEnds", "ridge", p + Vector((0, sgn * 0.04, 0)), 0.095, 0.08, segs=10, rot=(math.pi / 2, 0, 0))
        patch("side", sgn)
        for kk in range(int(math.ceil(2 * Ye / P))):
            u = -Ye + (kk + 0.5) * P
            if abs(u) > Ye - 0.1:
                continue
            p = deform(cx + sgn * Xe, cy + u, F(0), 0) + Vector((0, 0, 0.14))
            cyl(f"{prefix}_RoofEnds", "ridge", p + Vector((sgn * 0.04, 0, 0)), 0.095, 0.08, segs=10, rot=(0, math.pi / 2, 0))

    # ridges: 용마루 along the top, 내림마루 down the gables, 추녀마루 down the hips
    zt = F(D) + 0.12
    if gable:
        sweep(f"{prefix}_Ridges", "ridge", [(cx - Xg - 0.4, cy, zt + 0.25), (cx - Xg * 0.6, cy, zt),
                                            (cx + Xg * 0.6, cy, zt), (cx + Xg + 0.4, cy, zt + 0.25)], 0.6, 0.62)
        sweep(f"{prefix}_Ridges", "lime", [(cx - Xg * 0.95, cy, zt + 0.25), (cx + Xg * 0.95, cy, zt + 0.25)], 0.64, 0.12)
        for sx in (-1, 1):
            box(f"{prefix}_Ridges", "ridge", (cx + sx * (Xg + 0.35), cy, zt + 0.85), (0.5, 0.62, 0.9))   # 취두
            for sy in (-1, 1):
                pts = []
                for kk in range(9):
                    d = D - (D - dj) * kk / 8
                    pts.append(deform(cx + sx * Xg, cy + sy * (Ye - d), F(d) + 0.12, d))
                sweep(f"{prefix}_Ridges", "ridge", pts, 0.4, 0.42)
            # 합각 gable wall (painted) and its 박공 boards
            bm = bm_for(f"{prefix}_Gable", "brown")
            prof = [deform(cx + sx * Xg, cy - (Ye - d), F(d), d) for d in [dj + (D - dj) * kk / 10 for kk in range(11)]]
            prof += [deform(cx + sx * Xg, cy + (Ye - d), F(d), d) for d in [D - (D - dj) * kk / 10 for kk in range(11)]]
            vs = [bm.verts.new(p - Vector((sx * 0.35, 0, 0))) for p in prof]
            try:
                bm.faces.new(vs if sx > 0 else list(reversed(vs)))
            except ValueError:
                pass
    else:
        box(f"{prefix}_Ridges", "ridge", (cx, cy, zt + 0.2), (0.6, 0.6, 0.6))
        lathe(f"{prefix}_Ridges", "brass", (cx, cy, zt + 0.5), [(0.18, 0), (0.25, 0.25), (0.08, 0.6), (0.14, 0.75), (0, 1.0)], segs=10)
    for sx in (-1, 1):
        for sy in (-1, 1):
            pts = []
            for j in range(11):
                d = dj * (1 - j / 10)
                pts.append(deform(cx + sx * (Xe - d / k), cy + sy * (Ye - d), F(d) + 0.12, d))
            pts.append(pts[-1] + Vector((sx * 0.35, sy * 0.35, 0.22)))
            sweep(f"{prefix}_Ridges", "ridge", pts, 0.42, 0.42)
            box(f"{prefix}_Ridges", "ridge", tuple(pts[-1] + Vector((0, 0, 0.3))), (0.34, 0.34, 0.5))      # 용두

    # 서까래 (round) and 부연 (square) under the eave, ends painted
    for sgn in (-1, 1):
        for axis in ("fb", "side"):
            half = (Xe if axis == "fb" else Ye) - 0.6
            n = int(2 * half / 0.38)
            for kk in range(n + 1):
                u = -half + 2 * half * kk / n
                for (d0, d1, rr, mk, z_off) in ((2.2, 0.55, 0.085, "green", -0.42), (0.75, -0.05, 0.07, "green", -0.30)):
                    if axis == "fb":
                        a = deform(cx + u, cy + sgn * (Ye - d0), F(d0), d0)
                        b = deform(cx + u, cy + sgn * (Ye - d1), F(max(d1, 0)), max(d1, 0))
                    else:
                        a = deform(cx + sgn * (Xe - d0 / k), cy + u, F(d0), d0)
                        b = deform(cx + sgn * (Xe - d1 / k), cy + u, F(max(d1, 0)), max(d1, 0))
                    a.z += z_off
                    b.z += z_off
                    if mk and rr > 0.08:
                        between(f"{prefix}_Rafters", "green", a, b, rr, segs=8)
                    else:
                        d = (b - a).normalized()
                        between(f"{prefix}_Rafters", "green", a, b, rr, segs=4)
                    cyl(f"{prefix}_RafterEnds", "rafter_end", b + (b - a).normalized() * 0.01, rr * 1.02, 0.02,
                        segs=8 if rr > 0.08 else 4, rot=(0, 0, 0))


# --------------------------------------------------------------------------- 기단, stairs, court
def platform():
    x0, x1 = -HX - 1.7, HX + 1.7
    y0, y1 = -HY - 3.4, HY + 1.7
    box("Terrace", "stone", (0, (y0 + y1) / 2, TERR_Z / 2), (x1 - x0, y1 - y0, TERR_Z))
    box("Terrace", "stone", (0, (y0 + y1) / 2, TERR_Z - 0.07), (x1 - x0 + 0.3, y1 - y0 + 0.3, 0.14))   # 갑석
    # front stairs (8 steps) with sloped cheek stones (소맷돌)
    sw = 6.4
    steps = 8
    rise = TERR_Z / steps
    tread = 0.36
    for i in range(steps):
        z = rise * (i + 0.5)
        y = y0 - (steps - i) * tread + tread / 2
        box("Terrace", "stone", (0, y - (steps - i) * 0 + 0, z), (sw, tread * (steps - i) * 0 + tread + 0.02, rise))
    for sx in (-1, 1):
        a = Vector((sx * (sw / 2 + 0.25), y0 - steps * tread - 0.2, 0.25))
        b = Vector((sx * (sw / 2 + 0.25), y0, TERR_Z + 0.35))
        sweep("Terrace", "stone", [a, b], 0.5, 0.35)
        box("Terrace", "stone", (sx * (sw / 2 + 0.25), y0 - steps * tread - 0.2, 0.3), (0.55, 0.55, 0.6))
    # balustrade along the platform edge (gap at the stairs): posts with lotus-bud tops, two rails
    def rail(a, b):
        a, b = Vector(a), Vector(b)
        L = (b - a).length
        n = max(1, int(L / 2.0))
        for k in range(n + 1):
            p = a + (b - a) * k / n
            box("Balustrade", "stone", (p.x, p.y, TERR_Z + 0.5), (0.24, 0.24, 1.0))
            sphere("Balustrade", "stone", (p.x, p.y, TERR_Z + 1.12), 0.15, (1, 1, 1.3), segs=(10, 6))
        for h in (0.42, 0.86):
            between("Balustrade", "stone", (a.x, a.y, TERR_Z + h), (b.x, b.y, TERR_Z + h), 0.06, segs=6)
    e = 0.05
    rail((x0 + e, y0 + e), (-sw / 2 - 0.5, y0 + e))
    rail((sw / 2 + 0.5, y0 + e), (x1 - e, y0 + e))
    rail((x0 + e, y0 + e), (x0 + e, y1 - e))
    rail((x1 - e, y0 + e), (x1 - e, y1 - e))
    # the paved court and the ground around it
    box("Court", "paving", (0, -24, -0.1), (52, 32, 0.2))
    box("Court", "paving", (0, 4, -0.1), (52, 24, 0.2))
    terrain()
    # 담장: low stone walls with tile copings on the court's sides
    for sx in (-1, 1):
        for (ya, yb) in ((-38, -6), (-4, 15)):
            box("CourtWalls", "stone", (sx * 26, (ya + yb) / 2, 0.8), (0.7, yb - ya, 1.6))
            sweep("CourtWalls", "tile", [(sx * 26, ya, 1.6), (sx * 26, yb, 1.6)], 1.2, 0.22)
            sweep("CourtWalls", "ridge", [(sx * 26, ya, 1.8), (sx * 26, yb, 1.8)], 0.36, 0.2)
    box("CourtWalls", "stone", (0, -40, -0.6), (56, 3, 1.4))   # the court's retaining edge
    return y0


def terrain_z(x, y):
    """The mountainside: flat where the court is, rising behind the hall, falling away in front to the
    valley the concept looks over, with soft noise everywhere else."""
    n = (math.sin(x * 0.11) * math.cos(y * 0.09) * 1.6 + math.sin(x * 0.27 + 1.3) * math.sin(y * 0.23) * 0.7
         + math.sin((x + y) * 0.05) * 2.0)
    inside = max(abs(x) - 27, 0.0) + max(y - 16, 0.0) + max(-42 - y, 0.0)
    if inside <= 0:
        return -0.3
    rise = max(0.0, y - 16) * 0.42 + max(0.0, abs(x) - 27) * 0.22
    fall = -max(0.0, -42 - y) * 0.55
    w = min(1.0, inside / 8.0)
    return -0.3 + w * (rise + fall + n)


def terrain():
    bm = bm_for("Terrain", "ground")
    N, S = 90, 240.0
    vs = [[bm.verts.new((-S / 2 + S * i / N, -S / 2 + S * j / N, 0)) for i in range(N + 1)] for j in range(N + 1)]
    for row in vs:
        for v in row:
            v.co.z = terrain_z(v.co.x, v.co.y)
    for j in range(N):
        for i in range(N):
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))


def stone_lantern(x, y):
    """석등: octagonal base, pillar, lotus, fire chamber (glowing), roof, finial."""
    o = "StoneLanterns"
    lathe(o, "stone", (x, y, 0), [(0.75, 0), (0.75, 0.3), (0.55, 0.36), (0.55, 0.5)], segs=8)
    lathe(o, "stone", (x, y, 0.5), [(0.2, 0), (0.2, 1.3)], segs=8)
    lathe(o, "stone", (x, y, 1.8), [(0.25, 0), (0.6, 0.25), (0.62, 0.35), (0, 0.35)], segs=8)
    box(o, "stone_light", (x, y, 2.45), (0.6, 0.6, 0.55))
    for a in range(4):
        ang = a * math.pi / 2 + math.pi / 4
        box(o, "stone", (x + math.cos(ang) * 0.36, y + math.sin(ang) * 0.36, 2.45), (0.14, 0.14, 0.6))
    lathe(o, "stone", (x, y, 2.75), [(0.0, 0), (0.85, 0.02), (0.8, 0.14), (0.3, 0.42), (0.12, 0.5), (0, 0.5)], segs=8)
    lathe(o, "stone", (x, y, 3.25), [(0.12, 0), (0.17, 0.12), (0.08, 0.3), (0.12, 0.4), (0, 0.55)], segs=8)


def bell_pavilion(cx, cy):
    """종각: four red columns on a low platform, a pyramid roof, and the bronze bell."""
    box("BellPavilion", "stone", (cx, cy, 0.3), (5.2, 5.2, 0.6))
    xs, ys, z0, ztop = build_hall(cx, cy, [3.4], [3.4], terr_z=0.6, col_h=3.3, over=1.5, ridge_h=3.0,
                                 gable=False, prefix="BellPavilion", main=False)
    lathe("BellPavilion", "bronze", (cx, cy, 1.4),
          [(0.0, 0.0), (0.82, 0.0), (0.84, 0.12), (0.74, 0.5), (0.66, 1.2), (0.62, 1.6), (0.46, 1.8), (0.0, 1.85)], segs=20)
    between("BellPavilion", "brown", (cx, cy, 3.25), (cx, cy, ztop - 0.2), 0.06)
    between("BellPavilion", "brown", (cx - 1.7, cy, ztop - 0.25), (cx + 1.7, cy, ztop - 0.25), 0.14)
    between("BellPavilion", "brown", (cx - 1.0, cy - 1.3, 1.9), (cx - 1.0, cy + 1.3, 1.9), 0.11)   # the striker log
    return (cx, cy)


# ------------------------------------------------------------------------------- hall: walls etc.
def hall_skin(xs, ys, col_z0, col_top):
    # floor
    box("HallFloor", "floor", (0, 0, (TERR_Z + FLOOR_Z) / 2), (2 * HX + 0.3, 2 * HY + 0.3, FLOOR_Z - TERR_Z))
    box("HallFloor", "brown", (0, YS[0], FLOOR_Z - 0.05), (2 * HX + 0.6, 0.42, 0.3))         # 하방 at the front
    # back wall (plaster between columns, 하방 below) and the side walls with lattice windows
    for i in range(len(xs) - 1):
        x0, x1 = xs[i] + 0.27, xs[i + 1] - 0.27
        box("HallWalls", "plaster", ((x0 + x1) / 2, ys[-1], (FLOOR_Z + col_top - CHANG_H) / 2), (x1 - x0, 0.22, col_top - CHANG_H - FLOOR_Z))
    for x in (xs[0], xs[-1]):
        for j in range(len(ys) - 1):
            y0, y1 = ys[j] + 0.27, ys[j + 1] - 0.27
            zb = FLOOR_Z + 1.0
            box("HallWalls", "plaster", (x, (y0 + y1) / 2, (FLOOR_Z + zb) / 2), (0.22, y1 - y0, zb - FLOOR_Z))
            box("HallWalls", "brown", (x, (y0 + y1) / 2, zb), (0.26, y1 - y0, 0.14))
            zt = col_top - CHANG_H
            n = 3 if (y1 - y0) > 3.0 else 2
            for k in range(n):
                ya = y0 + (y1 - y0) * k / n
                yb = y0 + (y1 - y0) * (k + 1) / n
                for side in (-1, 1):
                    xo = x + side * 0.06
                    pts = [(xo, ya, zb + 0.07), (xo, yb, zb + 0.07), (xo, yb, zt), (xo, ya, zt)]
                    quad("HallWindows", "door", pts if side * x > 0 else list(reversed(pts)),
                         [(0, 0), (1, 0), (1, 1), (0, 1)] if side * x > 0 else [(0, 1), (1, 1), (1, 0), (0, 0)])
    # the front: 꽃살문 in every bay — the middle five bays open (leaves swung in), the end bays shut
    zt = FLOOR_Z + 3.3
    for i in range(len(xs) - 1):
        x0, x1 = xs[i] + 0.27, xs[i + 1] - 0.27
        y = ys[0]
        box("HallWalls", "brown", ((x0 + x1) / 2, y, zt + 0.07), (x1 - x0, 0.24, 0.14))          # 상인방
        # 교창 transom above the doors
        zt2 = col_top - CHANG_H
        for side in (-1, 1):
            pts = [(x0, y + side * 0.05, zt + 0.14), (x1, y + side * 0.05, zt + 0.14), (x1, y + side * 0.05, zt2), (x0, y + side * 0.05, zt2)]
            quad("HallWindows", "door", pts if side < 0 else list(reversed(pts)),
                 [(0, 0.55), (1, 0.55), (1, 0.72), (0, 0.72)] if side < 0 else [(0, 0.72), (1, 0.72), (1, 0.55), (0, 0.55)])
        leaves = 4
        lw = (x1 - x0) / leaves
        open_bay = 0 < i < len(xs) - 2
        for k in range(leaves):
            if open_bay:
                hinge = x0 if k < 2 else x1
                sgn = 1 if k < 2 else -1
                ang = math.radians(78) * (1 if k % 2 == 0 else 0.9)
                off = (k % 2) * 0.09
                ox = hinge + sgn * (0.02 + off)
                dx, dy = sgn * lw * math.cos(ang), lw * math.sin(ang)
                for side in (-1, 1):
                    n = Vector((dy, -dx, 0)).normalized() * 0.03 * side
                    pts = [(ox + n.x, y + 0.15 + n.y, FLOOR_Z), (ox + dx + n.x, y + 0.15 + dy + n.y, FLOOR_Z),
                           (ox + dx + n.x, y + 0.15 + dy + n.y, zt), (ox + n.x, y + 0.15 + n.y, zt)]
                    quad("HallDoors", "door", pts if side * sgn > 0 else list(reversed(pts)),
                         [(0, 0), (1, 0), (1, 1), (0, 1)] if side * sgn > 0 else [(0, 1), (1, 1), (1, 0), (0, 0)])
            else:
                for side in (-1, 1):
                    xa, xb = x0 + k * lw, x0 + (k + 1) * lw
                    yy = y + side * 0.04
                    pts = [(xa, yy, FLOOR_Z), (xb, yy, FLOOR_Z), (xb, yy, zt), (xa, yy, zt)]
                    quad("HallDoors", "door", pts if side < 0 else list(reversed(pts)),
                         [(0, 0), (1, 0), (1, 1), (0, 1)] if side < 0 else [(1, 0), (0, 0), (0, 1), (1, 1)])


def hall_interior(xs, ys, col_top):
    # 고주: tall interior columns behind the cushions (and one pair at the front corners)
    for (x, y) in ((-5.0, 6.0), (5.0, 6.0), (-8.0, 6.0), (8.0, 6.0), (-8.0, -6.0), (8.0, -6.0)):
        lathe("HallColumnsInner", "stone", (x, y, FLOOR_Z), [(0.42, 0), (0.42, 0.18), (0.34, 0.26), (0, 0.26)], segs=12)
        lathe("HallColumnsInner", "red", (x, y, FLOOR_Z + 0.26), [(0, 0), (0.3, 0), (0.32, 1.6), (0.29, CEIL_Z - FLOOR_Z - 0.26), (0, CEIL_Z - FLOOR_Z - 0.26)], segs=16)
    # 대들보 across the hall over each column line, and the coffered ceiling
    for x in (-8.0, -5.0, 5.0, 8.0):
        box("HallBeamsInner", "beam", (x, 0, CEIL_Z - 0.35), (0.5, 2 * HY, 0.7))
    box("HallBeamsInner", "beam", (0, 6.0, CEIL_Z - 0.3), (2 * HX, 0.45, 0.6))
    box("HallBeamsInner", "beam", (0, -6.0, CEIL_Z - 0.3), (2 * HX, 0.45, 0.6))
    box("HallCeiling", "coffer", (0, 0, CEIL_Z + 0.06), (2 * HX + 0.5, 2 * HY + 0.5, 0.12))
    # a sloped board ceiling (빗반자) from the wall top up to the flat ceiling, painted green
    zt = col_top - CHANG_H
    for sy in (-1, 1):
        quad("HallCeiling", "soffit", [(-HX, sy * HY, zt + 0.5), (HX, sy * HY, zt + 0.5), (HX, sy * (HY - 2.2), CEIL_Z), (-HX, sy * (HY - 2.2), CEIL_Z)][::sy])
    for sx in (-1, 1):
        quad("HallCeiling", "soffit", [(sx * HX, -HY, zt + 0.5), (sx * HX, HY, zt + 0.5), (sx * (HX - 2.2), HY, CEIL_Z), (sx * (HX - 2.2), -HY, CEIL_Z)][::-sx])

    # ---- 수미단: three tiers with painted panels
    ay, aw, ad = 6.9, 7.4, 2.6
    box("Altar", "red", (0, ay, FLOOR_Z + 0.15), (aw, ad, 0.3))
    box("Altar", "bracket", (0, ay, FLOOR_Z + 0.58), (aw - 0.5, ad - 0.3, 0.56))
    box("Altar", "red", (0, ay, FLOOR_Z + 0.93), (aw + 0.1, ad + 0.1, 0.14))
    box("Altar", "beam", (0, ay - 0.05, FLOOR_Z + 1.04), (aw - 0.2, ad - 0.2, 0.08))
    top = FLOOR_Z + 1.08
    # ---- the Buddha on a lotus throne
    lathe("Buddha", "gold", (0, ay + 0.2, top), [(0.0, 0), (1.05, 0), (1.05, 0.12), (0.8, 0.22), (0.7, 0.42), (0.95, 0.5), (1.0, 0.62), (0.0, 0.62)], segs=28)
    for ring, (r, z, n, sc) in enumerate(((1.0, 0.55, 18, 0.22), (0.86, 0.62, 14, 0.2))):
        for k in range(n):
            a = 2 * math.pi * (k + 0.5 * ring) / n
            sphere("Buddha", "gold", (math.cos(a) * r, ay + 0.2 + math.sin(a) * r, top + z), 1.0,
                   (sc, sc * 0.55, sc * 1.25), segs=(8, 6), rot=(0.35, 0, a + math.pi / 2))
    b0 = top + 0.62
    by = ay + 0.25
    buddha_sculpt(Vector((0, by, b0)))
    # halo behind, and the painting on the back wall
    hz = b0 + 1.6
    quad("Halo", "halo", [(-1.7, ay + 1.0, hz - 2.0), (1.7, ay + 1.0, hz - 2.0), (1.7, ay + 1.0, hz + 1.7), (-1.7, ay + 1.0, hz + 1.7)],
         [(0, 0), (1, 0), (1, 1), (0, 1)])
    wy = HY - 0.13
    quad("Taenghwa", "taenghwa", [(-4.6, wy, FLOOR_Z + 1.1), (4.6, wy, FLOOR_Z + 1.1), (4.6, wy, FLOOR_Z + 4.85), (-4.6, wy, FLOOR_Z + 4.85)],
         [(0, 0), (1, 0), (1, 1), (0, 1)])
    # ---- 닫집: a painted canopy with its own little bracket row, hanging over the Buddha
    cz = CEIL_Z - 0.75
    box("Canopy", "beam", (0, ay + 0.2, cz), (3.8, 2.6, 0.5))
    for k in range(9):
        x = -1.7 + 3.4 * k / 8
        box("Canopy", "bracket", (x, ay - 1.1, cz - 0.38), (0.22, 0.3, 0.3))
    box("Canopy", "red", (0, ay + 0.2, cz - 0.6), (3.9, 2.7, 0.1))
    for k in range(13):
        x = -1.85 + 3.7 * k / 12
        sphere("Canopy", "brass", (x, ay - 1.15, cz - 0.82), 1.0, (0.05, 0.05, 0.14), segs=(8, 6))
    # ---- offerings on the altar
    for sx in (-1, 1):
        lathe("Offerings", "brass", (sx * 2.6, ay - 0.6, top), [(0.22, 0), (0.22, 0.05), (0.06, 0.12), (0.05, 0.9), (0.16, 0.98), (0.16, 1.02), (0, 1.02)], segs=12)
        cyl("Offerings", "candle", (sx * 2.6, ay - 0.6, top + 1.22), 0.07, 0.4, segs=10)
        sphere("Offerings", "flame", (sx * 2.6, ay - 0.6, top + 1.5), 1.0, (0.035, 0.035, 0.09), segs=(8, 6))
        lathe("Offerings", "bronze", (sx * 1.7, ay - 0.6, top), [(0.12, 0), (0.18, 0.1), (0.2, 0.35), (0.1, 0.5), (0.12, 0.6), (0, 0.6)], segs=12)
        for k in range(5):                                                                      # lotus flowers in the vase
            a = 2 * math.pi * k / 5
            p = Vector((sx * 1.7 + math.cos(a) * 0.2, ay - 0.6 + math.sin(a) * 0.15, top + 0.95 + (k % 2) * 0.15))
            between("Offerings", "leaf", (sx * 1.7, ay - 0.6, top + 0.55), p, 0.012, segs=4)
            for j in range(6):
                b = 2 * math.pi * j / 6
                sphere("Offerings", "lotus", p + Vector((math.cos(b) * 0.06, math.sin(b) * 0.06, 0.05)), 1.0, (0.05, 0.03, 0.09),
                       segs=(6, 4), rot=(0.4, 0, b + math.pi / 2))
    lathe("Offerings", "bronze", (0, ay - 0.75, top), [(0.0, 0), (0.12, 0), (0.12, 0.05), (0.3, 0.12), (0.34, 0.3), (0.28, 0.42), (0.0, 0.42)], segs=16)  # 향로
    for k in range(3):
        between("Offerings", "brass", (0, ay - 0.75, top + 0.4), (0.04 * (k - 1), ay - 0.75, top + 0.75), 0.006, segs=4)
    # a low table and 목탁 in front of the altar
    box("Offerings", "brown", (0, ay - 1.9, FLOOR_Z + 0.25), (1.6, 0.6, 0.06))
    for sx in (-1, 1):
        for sy in (-1, 1):
            box("Offerings", "brown", (sx * 0.7, ay - 1.9 + sy * 0.24, FLOOR_Z + 0.11), (0.06, 0.06, 0.22))
    sphere("Offerings", "red", (0.4, ay - 1.9, FLOOR_Z + 0.36), 1.0, (0.16, 0.13, 0.1), segs=(12, 8))

    # ---- lotus lanterns hanging in rows
    cols = ["lantern_pink", "lantern_white", "lantern_gold"]
    for iy, y in enumerate((-5.0, -1.4, 2.2)):
        for ix, x in enumerate((-7.2, -4.3, -1.45, 1.45, 4.3, 7.2)):
            z = CEIL_Z - 1.25 - 0.15 * ((ix + iy) % 2)
            mk = cols[(ix + iy) % 3]
            between("Lanterns", "rope", (x, y, z + 0.32), (x, y, CEIL_Z), 0.01, segs=4)
            sphere("Lanterns", mk, (x, y, z), 0.26, (1, 1, 0.86), segs=(12, 8))
            for k in range(10):
                a = 2 * math.pi * k / 10
                sphere("Lanterns", mk, (x + math.cos(a) * 0.22, y + math.sin(a) * 0.22, z + 0.04), 1.0, (0.1, 0.06, 0.16),
                       segs=(6, 4), rot=(0.5, 0, a + math.pi / 2))
            between("Lanterns", "rope", (x, y, z - 0.22), (x, y, z - 0.55), 0.03, segs=6, r2=0.06)

    # ---- 110 cushions: 10 across (a 1.6 m aisle in the middle) × 11 rows; each is a seat
    seats = []
    rows = 11
    for r in range(rows):
        y = 4.4 - r * 1.2
        for c in range(10):
            side = -1 if c < 5 else 1
            k = c if c < 5 else 9 - c
            x = side * (0.8 + 0.65 + (4 - k) * 1.3)
            box("Cushions", "cushion_side", (x, y, FLOOR_Z + 0.05), (0.84, 0.84, 0.1))
            hz = FLOOR_Z + 0.102
            quad("CushionTops", "cushion", [(x - 0.41, y - 0.41, hz), (x + 0.41, y - 0.41, hz), (x + 0.41, y + 0.41, hz), (x - 0.41, y + 0.41, hz)],
                 [(0, 0), (1, 0), (1, 1), (0, 1)])
            name = f"Seat_{r + 1:02d}_{c + 1:02d}"
            empty(name, (x, y, FLOOR_Z + 0.15), (0, 0, 0), group="Seats")
            seats.append({"name": name, "row": r + 1, "col": c + 1, "x": round(x, 3), "y": round(y, 3), "z": round(FLOOR_Z + 0.15, 3)})
    return seats


def buddha_sculpt(base):
    """The seated Buddha (항마촉지인), sculpted from metaballs so the forms melt into one another the way
    cast bronze does, then meshed, smoothed and gilded. Proportions of a Korean seated image: the head
    about a fifth of the seated height, broad shoulders, the lap as wide as the shoulders and a half."""
    mb = bpy.data.metaballs.new("BuddhaMB")
    mb.resolution = 0.035
    mb.render_resolution = 0.035
    mo = bpy.data.objects.new("BuddhaMB", mb)
    SC.collection.objects.link(mo)

    K = 0.575       # a metaball ellipsoid's half-axis is K · radius · size (threshold 0.6, stiffness 2)

    def el(loc, half, along=None):
        """An ellipsoid with these half-axes (m); `along` points its z axis (limbs)."""
        e = mb.elements.new()
        e.type = "ELLIPSOID"
        e.co = Vector(loc)
        e.radius = 1.0
        e.stiffness = 2.0
        e.size_x, e.size_y, e.size_z = (h / K for h in half)
        if along is not None:
            e.rotation = Vector((0, 0, 1)).rotation_difference(Vector(along).normalized())

    def limb(a, b, r):
        a, b = Vector(a), Vector(b)
        el((a + b) / 2, (r, r, (b - a).length / 2 + r * 0.3), b - a)
    # lap: crossed legs, the knees, the right sole turned up
    el((0, 0.0, 0.24), (0.95, 0.6, 0.25))
    for sx in (-1, 1):
        el((sx * 0.56, -0.22, 0.26), (0.38, 0.34, 0.2))
    el((0.24, -0.36, 0.42), (0.17, 0.1, 0.06))
    # torso: waist, chest, shoulders
    el((0, 0.05, 0.78), (0.4, 0.29, 0.38))
    el((0, 0.03, 1.13), (0.5, 0.31, 0.3))
    for sx in (-1, 1):
        el((sx * 0.5, 0.05, 1.3), (0.19, 0.19, 0.16))
        limb((sx * 0.62, 0.05, 1.28), (sx * 0.68, 0.0, 0.84), 0.12)          # upper arms
    limb((0.68, 0.0, 0.84), (0.52, -0.42, 0.42), 0.1)                          # right forearm to the earth
    limb((-0.68, 0.0, 0.84), (-0.1, -0.3, 0.55), 0.1)                          # left forearm to the lap
    el((0.5, -0.46, 0.36), (0.08, 0.11, 0.12))                                 # right hand, fingers down
    el((-0.04, -0.3, 0.53), (0.14, 0.12, 0.05))                                # left hand, palm up
    # neck, head, 육계, earlobes, nose
    el((0, 0.04, 1.48), (0.13, 0.13, 0.12))
    el((0, 0.03, 1.8), (0.25, 0.27, 0.31))
    el((0, 0.05, 2.1), (0.12, 0.12, 0.1))
    for sx in (-1, 1):
        el((sx * 0.25, 0.07, 1.76), (0.04, 0.07, 0.15))
    el((0, -0.24, 1.78), (0.035, 0.04, 0.07))
    mo.location = base
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(mo.evaluated_get(dg))
    bpy.data.objects.remove(mo)
    o = bpy.data.objects.new("Buddha_Body", me)
    coll("Hall").objects.link(o)
    o.matrix_world = Matrix.Translation(base)
    dec = o.modifiers.new("dec", "DECIMATE")
    dec.ratio = 0.35
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier="dec")
    o.data.materials.append(M["gold"])
    for p in o.data.polygons:
        p.use_smooth = True
    OBJECTS.append(o)
    # 나발: snail-shell curls over the crown (separate, small)
    hc = base + Vector((0, 0.03, 1.86))
    for i in range(110):
        a = random.uniform(0, 2 * math.pi)
        e = random.uniform(0.1, 1.45)
        dirv = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
        p = hc + Vector((dirv.x * 0.25, dirv.y * 0.27, dirv.z * 0.3))
        if dirv.y < -0.25 and dirv.z < 0.55:
            continue                                                            # leave the face bare
        bmesh.ops.create_icosphere(bm_for("Buddha", "gold"), subdivisions=1, radius=0.035, matrix=Matrix.Translation(p))
    # the robe's hem lines: a thin band round the neck and down the chest
    sweep("Buddha", "gold", [base + Vector((-0.32, -0.22, 1.36)), base + Vector((0, -0.29, 1.12)), base + Vector((0.12, -0.31, 0.92))], 0.04, 0.03)


# ------------------------------------------------------------------------------------- nature
def leaf_cluster(obj, mkey, center, radius, n, flat=0.55, size=(0.7, 0.9)):
    """Leaf cards in an ellipsoid; normals point out of the cluster (soft, painterly shading)."""
    bm = bm_for(obj, mkey)
    uvl = bm.loops.layers.uv.verify()
    c = Vector(center)
    for _ in range(n):
        d = Vector((random.gauss(0, 1), random.gauss(0, 1), random.gauss(0, 1) * flat)).normalized()
        p = c + d * radius * random.uniform(0.35, 1.0) * Vector((1, 1, flat))
        s = random.uniform(*size)
        a = random.uniform(0, math.pi)
        tilt = random.uniform(-0.4, 0.4)
        ax = Vector((math.cos(a), math.sin(a), tilt)).normalized() * s / 2
        ay = d.cross(ax).normalized() * s / 2 if d.cross(ax).length > 1e-3 else Vector((0, 0, s / 2))
        vs = [bm.verts.new(p - ax - ay), bm.verts.new(p + ax - ay), bm.verts.new(p + ax + ay), bm.verts.new(p - ax + ay)]
        f = bm.faces.new(vs)
        q = random.choice(((0, 0), (0.5, 0), (0, 0.5), (0.5, 0.5)))
        for loop, (u, v) in zip(f.loops, ((0, 0), (0.5, 0), (0.5, 0.5), (0, 0.5))):
            loop[uvl].uv = (q[0] + u, q[1] + v)
    return c


def pine(x, y, z, h, seed):
    random.seed(seed)
    lean = Vector((random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), 1)).normalized()
    pts = [Vector((x, y, z))]
    for k in range(1, 7):
        t = k / 6
        p = Vector((x, y, z)) + lean * h * t + Vector((math.sin(t * 3 + seed) * 0.4, math.cos(t * 2 + seed) * 0.3, 0)) * t
        pts.append(p)
    for a, b, k in zip(pts, pts[1:], range(6)):
        between("Pines", "bark", a, b, 0.32 * (1 - k / 7) + 0.06, segs=8, r2=0.32 * (1 - (k + 1) / 7) + 0.06)
    # flat cloud pads on the upper half, the classic Korean pine silhouette
    for k in range(6):
        t = 0.45 + 0.55 * k / 5
        base = pts[0].lerp(pts[-1], t)
        ang = random.uniform(0, 2 * math.pi)
        reach = (1 - t) * 3.2 + 1.2
        tip = base + Vector((math.cos(ang) * reach, math.sin(ang) * reach, random.uniform(-0.3, 0.4)))
        between("Pines", "bark", base, tip, 0.09, segs=5, r2=0.04)
        leaf_cluster("Pines", "pine", tip + Vector((0, 0, 0.25)), reach * 0.75 + 0.6, int(70 + reach * 30), flat=0.32, size=(0.9, 1.4))
    leaf_cluster("Pines", "pine", pts[-1] + Vector((0, 0, 0.3)), 1.6, 90, flat=0.4, size=(0.9, 1.4))


def maple(x, y, z, h, seed):
    random.seed(seed)
    top = Vector((x, y, z + h * 0.55))
    between("Maples", "bark", (x, y, z), top, 0.18, segs=8, r2=0.1)
    for k in range(5):
        a = 2 * math.pi * k / 5 + seed
        tip = top + Vector((math.cos(a) * h * 0.3, math.sin(a) * h * 0.3, h * random.uniform(0.15, 0.35)))
        between("Maples", "bark", top, tip, 0.07, segs=5, r2=0.03)
        leaf_cluster("Maples", "maple", tip, h * 0.28, 220, flat=0.7, size=(0.6, 0.95))
    leaf_cluster("Maples", "maple", top + Vector((0, 0, h * 0.35)), h * 0.34, 320, flat=0.7, size=(0.6, 0.95))


def rock(x, y, z, s, seed):
    """Voxel-remeshed, displaced boulders (the Tree of Mind cliff technique)."""
    random.seed(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=s, location=(x, y, z))
    o = bpy.context.active_object
    o.name = f"Rock_{seed}"
    o.scale = (1.0 + random.uniform(-0.2, 0.4), 1.0 + random.uniform(-0.2, 0.3), random.uniform(0.55, 0.85))
    tex = bpy.data.textures.new(f"RockTex{seed}", "VORONOI")
    tex.noise_scale = s * 0.6
    md = o.modifiers.new("disp", "DISPLACE")
    md.texture = tex
    md.strength = s * 0.35
    rm = o.modifiers.new("remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = s * 0.12
    dec = o.modifiers.new("dec", "DECIMATE")
    dec.ratio = 0.35
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    o.data.materials.append(M["rock"])
    for p in o.data.polygons:
        p.use_smooth = True
    for c in o.users_collection:
        c.objects.unlink(o)
    coll("Nature").objects.link(o)
    project_uv(o, (2, 2, 2))
    OBJECTS.append(o)


def backdrop():
    bm = bm_for("Sky", "sky")
    uvl = bm.loops.layers.uv.verify()
    R, H0, H1, n = 300.0, -25.0, 140.0, 64
    ring0 = [bm.verts.new((math.cos(2 * math.pi * i / n) * R, math.sin(2 * math.pi * i / n) * R, H0)) for i in range(n)]
    ring1 = [bm.verts.new((math.cos(2 * math.pi * i / n) * R, math.sin(2 * math.pi * i / n) * R, H1)) for i in range(n)]
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((ring0[j], ring0[i], ring1[i], ring1[j]))       # facing inward
        u0, u1 = i / n, (i + 1) / n
        for loop, uv in zip(f.loops, ((u1, 0.0), (u0, 0.0), (u0, 1.0), (u1, 1.0))):
            loop[uvl].uv = uv


# ======================================================================================== build
xs, ys, col_z0, col_top = build_hall()
hall_skin(xs, ys, col_z0, col_top)
seats = hall_interior(xs, ys, col_top)
flush("Hall")
front_y = platform()
for sx in (-1, 1):
    stone_lantern(sx * 5.4, front_y - 5.6)
flush("Court")
bell_pavilion(-20.0, -12.0)
flush("BellPavilion")
# a smaller side hall at the right edge of the court, for the silhouette (exterior only)
box("SideHall", "stone", (19.0, -1.0, 0.45), (8.8, 7.0, 0.9))
build_hall(19.0, -1.0, [2.6, 3.0, 2.6], [2.6, 2.6], terr_z=0.9, col_h=3.4, over=1.8, ridge_h=3.6, gable=True,
           prefix="SideHall", main=False)
for i in range(3):
    x0 = 19.0 - 4.1 + [0, 2.6, 5.6][i] + 0.25
    x1 = x0 + [2.6, 3.0, 2.6][i] - 0.5
    for side in (-1, 1):
        pts = [(x0, -3.6 + side * 0.05, 1.1), (x1, -3.6 + side * 0.05, 1.1), (x1, -3.6 + side * 0.05, 4.2), (x0, -3.6 + side * 0.05, 4.2)]
        quad("SideHallDoors", "door", pts if side < 0 else list(reversed(pts)),
             [(0, 0), (1, 0), (1, 1), (0, 1)] if side < 0 else [(1, 0), (0, 0), (0, 1), (1, 1)])
flush("SideHall")

# nature: pines behind and beside the hall, maples at the court's front corners, rocks along the edges
if not FAST:
    for i, (x, y) in enumerate(((-22, 16), (-15, 20), (-6, 22), (6, 21), (15, 19), (23, 15), (-30, -2), (31, -6),
                                (-34, 10), (34, 8), (-28, 24), (27, 26), (-40, 34), (-12, 34), (8, 36), (30, 38),
                                (44, 20), (-46, 18))):
        pine(x, y, terrain_z(x, y), random.uniform(11, 15), 100 + i)
    for i, (x, y) in enumerate(((-23, -33), (-24, -22), (21, -36), (24, -27), (-23, -4), (23, 8), (-8, -38.5))):
        maple(x, y, terrain_z(x, y), random.uniform(5.5, 7.5), 200 + i)
    flush("Nature")
    for i, (x, y, s) in enumerate(((-14.5, -13.8, 1.2), (14.0, -13.9, 1.0), (-20, -24, 1.4), (19.5, -21, 1.3),
                                   (-9, 15, 2.2), (10, 15.5, 2.0), (-25, 4, 1.8), (25, 2, 1.6), (0, 18, 2.6),
                                   (-18, 12, 2.4), (18, 11, 2.3))):
        rock(x, y, terrain_z(x, y) + 0.2, s, 300 + i)
backdrop()
flush("Sky")

empty("Marker_Spawn", (0, -30, 0), (0, 0, 0))
empty("Marker_HallDoor", (0, YS[0] - 0.6, TERR_Z), (0, 0, 0))
empty("Marker_Buddha", (0, 7.15, FLOOR_Z + 1.7), (0, 0, math.pi))
empty("Marker_BellPavilion", (-20.0, -12.0, 0.6), (0, 0, 0))
empty("Marker_CameraHall", (0, -8.0, FLOOR_Z + 2.4), (math.radians(84), 0, 0))
(OUT / "seats.json").write_text(json.dumps({"floor_z": FLOOR_Z, "facing": "+Y (toward the Buddha)", "seats": seats}, indent=1))

tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJECTS if o.type == "MESH")
print(f"TEMPLE objects={len(OBJECTS)} tris={tris} seats={len(seats)}", flush=True)

# ---------------------------------------------------------------------------- lights, previews
world = bpy.data.worlds.new("TempleWorld")
SC.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.46, 0.42, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 6.5
sun.data.color = (1.0, 0.74, 0.50)
sun.data.angle = math.radians(3)
sun.rotation_euler = Vector((0.5, 0.62, -0.6)).to_track_quat('-Z', 'Y').to_euler()
coll("Lights").objects.link(sun)
for (x, y, z, e, c) in ((0, 4.0, FLOOR_Z + 3.2, 900, (1, 0.72, 0.42)), (0, -3.0, FLOOR_Z + 3.5, 700, (1, 0.7, 0.45)),
                        (-6, 1, FLOOR_Z + 3.5, 400, (1, 0.62, 0.55)), (6, 1, FLOOR_Z + 3.5, 400, (1, 0.62, 0.55)),
                        (0, 6.4, FLOOR_Z + 2.4, 300, (1, 0.8, 0.5))):
    L = bpy.data.objects.new("HallLight", bpy.data.lights.new("HallLight", "POINT"))
    L.data.energy, L.data.color, L.data.shadow_soft_size = e, c, 1.5
    L.location = (x, y, z)
    coll("Lights").objects.link(L)
for sx in (-1, 1):
    L = bpy.data.objects.new("LanternLight", bpy.data.lights.new("LanternLight", "POINT"))
    L.data.energy, L.data.color = 120, (1, 0.7, 0.4)
    L.location = (sx * 5.4, front_y - 5.6, 2.45)
    coll("Lights").objects.link(L)

SC.render.engine = "BLENDER_EEVEE"
SC.render.resolution_x, SC.render.resolution_y = (1280, 720) if FAST else (1920, 1080)
SC.view_settings.view_transform = "AgX"
SC.view_settings.look = "AgX - Punchy" if "AgX - Punchy" in [i.identifier for i in type(SC.view_settings).bl_rna.properties["look"].enum_items_static] else "None"
try:
    SC.eevee.taa_render_samples = 16 if FAST else 64
    SC.eevee.use_shadows = True
    SC.eevee.use_raytracing = not FAST
except Exception:
    pass


def shoot(name, loc, look_at, lens=30):
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    cam.location = loc
    d = Vector(look_at) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    cam.data.clip_end = 900
    coll("Cameras").objects.link(cam)
    SC.camera = cam
    SC.render.filepath = str(PREV / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", name, flush=True)


shoot("exterior", (-15.0, -40.0, 8.5), (2.0, -3.0, 5.6), lens=27)
shoot("interior", (0.0, -8.4, FLOOR_Z + 1.75), (0.0, 6.0, FLOOR_Z + 2.4), lens=24)
if not FAST:
    shoot("aerial", (34.0, -46.0, 30.0), (0.0, -6.0, 3.0), lens=32)

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "mountain_temple.blend"))
bpy.ops.export_scene.fbx(filepath=str(OUT / "mountain_temple.fbx"), use_selection=False, apply_unit_scale=True,
                         object_types={"MESH", "EMPTY"}, mesh_smooth_type="FACE", path_mode="COPY", embed_textures=False)
print("DONE", OUT, flush=True)
