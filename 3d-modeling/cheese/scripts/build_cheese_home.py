"""Chapter 1 set of the story "수호신 치즈냥이": the player's living room, front door and the
communal hallway, with Cheese — modelled, textured and rendered from the PLAYER'S eyes.

Blender -b --python-exit-code 1 --python 3d-modeling/cheese/scripts/build_cheese_home.py -- <out_dir> [fast] [only=<plate>]

Layout follows references/01_Scene_Layout.png (overhead, metres, Z up):
  room       x 0..7, y 0..4.6 (front wall with the door at y=0, window wall at y=4.6), ceiling 2.5
  front door x 2.45..3.35, hinge on the right, swings OUT into the hallway (up to 90°)
  doorbell   hallway side, left of the door
  window     back wall x 2.9..4.5 over a wide wooden window seat with a green cat cushion
  sofa       back-right, three seats; coffee table in front of it
  hallway    y -2.2..0, grey tiles

"Camera = player = protagonist" (references/Animation_Reference_KO.md): every plate is what the
player sees, and Cheese looks into the lens. Plates (portrait 9:16) and their expression variants:

  door      cut 01 — the door opened, Cheese below the doorbell looking up
  room      cut 03 — from the doorway, Cheese on the sofa: "문부터 닫아라."
  sofa      the conversation framing (S02/S04 free talk)
  doorstep  the refusal branch — Cheese waiting outside the open door
  nap       S05 — the door clicks shut, Cheese settles in for a very serious nap

For each plate with a face the script renders the base image (idle) plus face-only crops for
blink / talk / smug, written with a JSON of where each crop sits (fractions of the plate), so the
app can swap expressions without shipping whole frames.
"""
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cheese_cat  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/cheese_home"
FAST = "fast" in argv
ONLY = next((a.split("=", 1)[1] for a in argv if a.startswith("only=")), None)
NO_RENDER = "norender" in argv
os.makedirs(OUT, exist_ok=True)

RES = (540, 960) if FAST else (1170, 2080)
SAMPLES = 24 if FAST else 128

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
ROOT = sc.collection
SET = bpy.data.collections.new("Set")
ROOT.children.link(SET)

W, D, H = 7.0, 4.6, 2.5      # room
T = 0.12                     # wall thickness
DOOR_X0, DOOR_X1, DOOR_H = 2.45, 3.35, 2.1
WIN_X0, WIN_X1, WIN_Z0, WIN_Z1 = 2.75, 4.55, 0.95, 2.05
HALL_Y = -2.2


# ---------------------------------------------------------------- materials

def principled(name, rgb=(0.8, 0.8, 0.8), rough=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m, m.node_tree, b


def wood_planks(name, c1, c2, plank=(1.2, 0.15), rough=0.32, gap=(0.12, 0.05, 0.02)):
    """Floor boards: a brick texture laid as long planks, per-plank tone, wavy grain on top."""
    m, nt, b = principled(name, c1, rough)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.offset = 0.37
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Brick Width"].default_value = plank[0]
    br.inputs["Row Height"].default_value = plank[1]
    br.inputs["Mortar Size"].default_value = 0.0035
    br.inputs["Mortar Smooth"].default_value = 0.3
    br.inputs["Bias"].default_value = 0.0
    br.inputs["Color1"].default_value = (*c1, 1)
    br.inputs["Color2"].default_value = (*c2, 1)
    br.inputs["Mortar"].default_value = (*gap, 1)
    nt.links.new(mp.outputs["Vector"], br.inputs["Vector"])
    # grain: stretched wave texture, multiplied in softly
    wv = nt.nodes.new("ShaderNodeTexWave")
    wv.wave_type = 'BANDS'
    wv.bands_direction = 'Y'
    wv.inputs["Scale"].default_value = 3.0
    wv.inputs["Distortion"].default_value = 9.0
    wv.inputs["Detail"].default_value = 3.0
    sm = nt.nodes.new("ShaderNodeMapping")
    sm.inputs["Scale"].default_value = (0.25, 4.0, 1.0)
    nt.links.new(tc.outputs["Object"], sm.inputs["Vector"])
    nt.links.new(sm.outputs["Vector"], wv.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["To Min"].default_value = 0.82
    ramp.inputs["To Max"].default_value = 1.0
    nt.links.new(wv.outputs["Fac"], ramp.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(br.outputs["Color"], mul.inputs[6])
    nt.links.new(ramp.outputs["Result"], mul.inputs[7])
    nt.links.new(mul.outputs[2], b.inputs["Base Color"])
    # gaps a little rougher
    rr = nt.nodes.new("ShaderNodeMapRange")
    rr.inputs["To Min"].default_value = 0.8
    rr.inputs["To Max"].default_value = rough
    nt.links.new(br.outputs["Fac"], rr.inputs["Value"])
    nt.links.new(rr.outputs["Result"], b.inputs["Roughness"])
    return m


def tiles(name, c1, c2, size=0.6, grout=(0.55, 0.56, 0.56)):
    m, nt, b = principled(name, c1, 0.45)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.offset = 0.0
    br.inputs["Brick Width"].default_value = size
    br.inputs["Row Height"].default_value = size
    br.inputs["Mortar Size"].default_value = 0.004
    br.inputs["Color1"].default_value = (*c1, 1)
    br.inputs["Color2"].default_value = (*c2, 1)
    br.inputs["Mortar"].default_value = (*grout, 1)
    nt.links.new(tc.outputs["Object"], br.inputs["Vector"])
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 18.0
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = 'RGBA'
    mix.blend_type = 'OVERLAY'
    mix.inputs["Factor"].default_value = 0.12
    nt.links.new(br.outputs["Color"], mix.inputs[6])
    nt.links.new(nz.outputs["Color"], mix.inputs[7])
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    return m


def fabric(name, rgb, rough=0.95):
    m, nt, b = principled(name, rgb, rough)
    if "Sheen Weight" in b.inputs:
        b.inputs["Sheen Weight"].default_value = 0.35
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 220.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def plaster(name, rgb):
    m, nt, b = principled(name, rgb, 0.9)
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 60.0
    nz.inputs["Detail"].default_value = 6.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.03
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


FLOOR = wood_planks("Home_Floor", (0.50, 0.22, 0.075), (0.42, 0.17, 0.05))
WALL = plaster("Home_Wall", (0.66, 0.55, 0.42))
CEIL = plaster("Home_Ceiling", (0.82, 0.78, 0.70))
WOOD = wood_planks("Home_Wood", (0.30, 0.12, 0.04), (0.26, 0.10, 0.035), plank=(3.0, 0.5), rough=0.45)
DOORWOOD = wood_planks("Home_DoorWood", (0.32, 0.14, 0.05), (0.30, 0.13, 0.045), plank=(5.0, 3.0), rough=0.5)
TRIM = principled("Home_Trim", (0.86, 0.83, 0.78), 0.5)[0]
HALL_FLOOR = tiles("Hall_Tile", (0.30, 0.32, 0.36), (0.27, 0.29, 0.33))
HALL_WALL = plaster("Hall_Wall", (0.55, 0.55, 0.53))
SOFA = fabric("Home_Sofa", (0.62, 0.53, 0.41))
CUSHION = fabric("Home_SeatCushion", (0.17, 0.24, 0.16))
METAL = principled("Home_Metal", (0.75, 0.72, 0.66), 0.25)[0]
METAL.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 1.0
DARK = principled("Home_Dark", (0.03, 0.03, 0.035), 0.4)[0]
POT = principled("Home_Pot", (0.55, 0.25, 0.13), 0.7)[0]
LEAF = principled("Home_Leaf", (0.06, 0.20, 0.05), 0.55)[0]
SOIL = principled("Home_Soil", (0.06, 0.035, 0.02), 1.0)[0]
LAMP = principled("Home_LampShade", (1.0, 0.9, 0.75), 0.6)[0]
_lb = LAMP.node_tree.nodes["Principled BSDF"]
_lb.inputs["Emission Color"].default_value = (1.0, 0.85, 0.65, 1)
_lb.inputs["Emission Strength"].default_value = 3.0
FRAMEPIC = None  # set in build_room: the painted view, unlit


def outside_view():
    """The view out of the window: sunny sky and soft yellow-green trees (painted with numpy)."""
    w, h = 1024, 640
    img = bpy.data.images.new("Home_Outside", w, h, alpha=False)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = yy / h  # 0 bottom, 1 top (Blender images are bottom-up)
    sky = np.stack([0.55 + 0.25 * v, 0.75 + 0.15 * v, 0.95 + 0.0 * v], -1)
    px = sky.copy()
    rng = np.random.default_rng(7)
    # foliage blobs: back layer darker, front layer brighter (sunlit), mostly in the lower 75%
    for layer, (count, rmin, rmax, base) in enumerate(((140, 30, 70, (0.35, 0.55, 0.16)),
                                                        (220, 18, 46, (0.62, 0.78, 0.25)),
                                                        (160, 10, 26, (0.85, 0.92, 0.42)))):
        for _ in range(count):
            cx = rng.uniform(-40, w + 40)
            top = h * (0.62 + 0.18 * math.sin(cx / w * 6.0 + layer))
            cy = rng.uniform(-30, top)
            r = rng.uniform(rmin, rmax)
            d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
            a = np.clip((r - d) / 6.0, 0, 1)[..., None]
            shade = 0.85 + 0.3 * ((yy - cy) / r)[..., None].clip(-1, 1) * 0.5
            col = np.array(base, np.float32) * rng.uniform(0.85, 1.1)
            px = px * (1 - a) + (col * shade) * a
    rgba = np.concatenate([px.clip(0, 1) ** 2.2, np.ones((h, w, 1), np.float32)], -1)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    m, nt, b = principled("Home_OutsideView", (1, 1, 1), 1.0)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 2.2
    nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    out = nt.nodes["Material Output"]
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


# ---------------------------------------------------------------- geometry helpers

def box(name, x0, y0, z0, x1, y1, z1, mat, bevel=0.0, segs=3, coll=SET):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
                        @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1)), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    if bevel:
        mod = o.modifiers.new("Bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = segs
        mod.limit_method = 'NONE'
        for p in me.polygons:
            p.use_smooth = True
        mod.harden_normals = False
    return o


def cyl(name, c, r, h, mat, verts=32, scale=(1, 1, 1), bevel=0.0, coll=SET):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=h)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ Matrix.Diagonal((*scale, 1)), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    if bevel:
        mod = o.modifiers.new("Bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = 4
        mod.limit_method = 'ANGLE'
    return o


# ---------------------------------------------------------------- the room

def build_room():
    # floor and ceiling
    box("Floor", -T, -T, -0.05, W + T, D + T, 0.0, FLOOR)
    box("Ceiling", -T, -T, H, W + T, D + T, H + 0.05, CEIL)
    # threshold strip at the door
    box("Threshold", DOOR_X0, -T, 0.0, DOOR_X1, 0.02, 0.012, principled("Home_Stone", (0.45, 0.45, 0.46), 0.4)[0])
    # walls (front wall has the door gap, back wall the window gap)
    box("Wall_Left", -T, -T, 0, 0, D + T, H, WALL)
    box("Wall_Right", W, -T, 0, W + T, D + T, H, WALL)
    box("Wall_Front_L", -T - 1, -T, 0, DOOR_X0, 0, H, WALL)
    box("Wall_Front_R", DOOR_X1, -T, 0, W + T + 1, 0, H, WALL)
    box("Wall_Front_Top", DOOR_X0, -T, DOOR_H, DOOR_X1, 0, H, WALL)
    box("Wall_Back_L", -T, D, 0, WIN_X0, D + T, H, WALL)
    box("Wall_Back_R", WIN_X1, D, 0, W + T, D + T, H, WALL)
    box("Wall_Back_Bot", WIN_X0, D, 0, WIN_X1, D + T, WIN_Z0, WALL)
    box("Wall_Back_Top", WIN_X0, D, WIN_Z1, WIN_X1, D + T, H, WALL)
    # baseboards
    bb = 0.08
    box("Base_Left", 0, 0, 0, 0.015, D, bb, WOOD)
    box("Base_Right", W - 0.015, 0, 0, W, D, bb, WOOD)
    box("Base_Back_L", 0, D - 0.015, 0, WIN_X0, D, bb, WOOD)
    box("Base_Back_R", WIN_X1, D - 0.015, 0, W, D, bb, WOOD)
    box("Base_Back_M", WIN_X0, D - 0.015, 0, WIN_X1, D, bb, WOOD)
    box("Base_Front_L", 0, 0, 0, DOOR_X0 - 0.07, 0.015, bb, WOOD)
    box("Base_Front_R", DOOR_X1 + 0.07, 0, 0, W, 0.015, bb, WOOD)
    # door frame (casing) inside and out
    for y0, y1 in ((0.0, 0.02), (-T - 0.02, -T)):
        box("DoorCase_L", DOOR_X0 - 0.07, y0, 0, DOOR_X0, y1, DOOR_H + 0.07, WOOD, bevel=0.005)
        box("DoorCase_R", DOOR_X1, y0, 0, DOOR_X1 + 0.07, y1, DOOR_H + 0.07, WOOD, bevel=0.005)
        box("DoorCase_T", DOOR_X0 - 0.07, y0, DOOR_H, DOOR_X1 + 0.07, y1, DOOR_H + 0.07, WOOD, bevel=0.005)
    box("DoorJamb_L", DOOR_X0, -T, 0, DOOR_X0 + 0.02, 0, DOOR_H, WOOD)
    box("DoorJamb_R", DOOR_X1 - 0.02, -T, 0, DOOR_X1, 0, DOOR_H, WOOD)
    box("DoorJamb_T", DOOR_X0, -T, DOOR_H - 0.02, DOOR_X1, 0, DOOR_H, WOOD)

    # window: frame, sash bars, sill, the outside
    box("WinFrame_B", WIN_X0, D - 0.02, WIN_Z0 - 0.04, WIN_X1, D + T, WIN_Z0, TRIM, bevel=0.006)
    box("WinFrame_T", WIN_X0, D - 0.02, WIN_Z1, WIN_X1, D + T, WIN_Z1 + 0.04, TRIM, bevel=0.006)
    box("WinFrame_L", WIN_X0 - 0.04, D - 0.02, WIN_Z0 - 0.04, WIN_X0, D + T, WIN_Z1 + 0.04, TRIM, bevel=0.006)
    box("WinFrame_R", WIN_X1, D - 0.02, WIN_Z0 - 0.04, WIN_X1 + 0.04, D + T, WIN_Z1 + 0.04, TRIM, bevel=0.006)
    mid = (WIN_X0 + WIN_X1) / 2
    box("WinSash_M", mid - 0.025, D + 0.03, WIN_Z0, mid + 0.025, D + 0.07, WIN_Z1, TRIM)
    box("WinSill", WIN_X0 - 0.08, D - 0.07, WIN_Z0 - 0.06, WIN_X1 + 0.08, D, WIN_Z0 - 0.04, TRIM, bevel=0.008)
    glass = principled("Home_Glass", (1, 1, 1), 0.02)[0]
    gb = glass.node_tree.nodes["Principled BSDF"]
    gb.inputs["Transmission Weight"].default_value = 1.0
    gb.inputs["IOR"].default_value = 1.05
    box("WinGlass", WIN_X0, D + 0.045, WIN_Z0, WIN_X1, D + 0.05, WIN_Z1, glass)
    view = outside_view()
    o = box("Outside", WIN_X0 - 2.2, D + 2.2, WIN_Z0 - 1.4, WIN_X1 + 2.2, D + 2.25, WIN_Z1 + 1.2, view)
    o.visible_shadow = False
    # UV the outside plane 0..1 on its front face
    me = o.data
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((co.x - (WIN_X0 - 2.2)) / (WIN_X1 - WIN_X0 + 4.4),
                              (co.z - (WIN_Z0 - 1.4)) / (WIN_Z1 - WIN_Z0 + 2.6))

    # window seat: wide wooden bench + green oval cushion (the cat's later spot)
    sx0, sx1, sy0, sy1, sz = 2.55, 4.75, 4.0, 4.58, 0.42
    box("Seat_Top", sx0, sy0, sz - 0.05, sx1, sy1, sz, WOOD, bevel=0.012)
    for x in (sx0 + 0.06, sx1 - 0.10):
        box("Seat_Leg", x, sy0 + 0.04, 0, x + 0.05, sy1 - 0.04, sz - 0.05, WOOD, bevel=0.006)
    box("Seat_Apron", sx0 + 0.05, sy0 + 0.02, sz - 0.12, sx1 - 0.05, sy0 + 0.05, sz - 0.05, WOOD, bevel=0.004)
    cyl("Seat_Cushion", Vector(((sx0 + sx1) / 2, (sy0 + sy1) / 2 - 0.01, sz + 0.035)), 1.0, 0.06, CUSHION,
        verts=48, scale=(0.62, 0.24, 1.0), bevel=0.025)

    # the potted plant (the player's "초록이") on the floor beside the window seat
    cyl("Plant_Pot", Vector((2.22, 4.3, 0.17)), 0.15, 0.34, POT, bevel=0.01)
    cyl("Plant_Soil", Vector((2.22, 4.3, 0.33)), 0.135, 0.02, SOIL)
    rng = np.random.default_rng(3)
    for i in range(16):
        a = i / 16 * 2 * math.pi + rng.uniform(-0.2, 0.2)
        ln = rng.uniform(0.35, 0.6)
        tilt = rng.uniform(0.35, 0.8)
        base = Vector((2.22, 4.3, 0.34))
        tip = base + Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt))) * ln
        midp = base.lerp(tip, 0.55) + Vector((0, 0, 0.05))
        leaf = cheese_cat._tube(f"Plant_Leaf_{i}", [base, base.lerp(midp, 0.5), midp, midp.lerp(tip, 0.5), tip],
                                lambda t: 0.032 * math.sin(math.pi * min(1.0, 0.1 + t)) + 0.002, LEAF, SET,
                                sides=6, cap=False)
        leaf.scale = (1, 1, 1)
        sol = leaf.modifiers.new("Flat", 'SIMPLE_DEFORM')  # leave round; reads fine at distance
        leaf.modifiers.remove(sol)

    # sofa: three seats against the back wall, right side
    x0, x1, y0, y1 = 4.75, 6.85, 3.62, 4.55
    arm = 0.17
    box("Sofa_Base", x0 + arm - 0.02, y0 + 0.02, 0.10, x1 - arm + 0.02, y1 - 0.05, 0.30, SOFA, bevel=0.03)
    box("Sofa_Back", x0 + 0.02, y1 - 0.24, 0.10, x1 - 0.02, y1 - 0.02, 0.62, SOFA, bevel=0.05, segs=4)
    for sx, ex in ((x0, x0 + arm), (x1 - arm, x1)):
        box("Sofa_Arm", sx, y0, 0.10, ex, y1 - 0.02, 0.58, SOFA, bevel=0.06, segs=5)
    seat_w = (x1 - x0 - 2 * arm) / 3
    for i in range(3):
        cx0 = x0 + arm + i * seat_w
        box(f"Sofa_Seat_{i}", cx0 + 0.005, y0 + 0.01, 0.30, cx0 + seat_w - 0.005, y1 - 0.22, 0.46, SOFA,
            bevel=0.05, segs=5)
        box(f"Sofa_BackCushion_{i}", cx0 + 0.01, y1 - 0.40, 0.44, cx0 + seat_w - 0.01, y1 - 0.18, 0.86, SOFA,
            bevel=0.07, segs=5).rotation_euler = (0, 0, 0)
    for x in (x0 + 0.08, x1 - 0.12):
        for y in (y0 + 0.08, y1 - 0.12):
            cyl("Sofa_Foot", Vector((x + 0.02, y + 0.02, 0.05)), 0.025, 0.10, WOOD)

    # coffee table
    tx0, tx1, ty0, ty1, tz = 5.05, 6.55, 2.2, 2.95, 0.40
    box("Table_Top", tx0, ty0, tz - 0.05, tx1, ty1, tz, WOOD, bevel=0.015)
    box("Table_Apron", tx0 + 0.06, ty0 + 0.06, tz - 0.12, tx1 - 0.06, ty1 - 0.06, tz - 0.05, WOOD, bevel=0.005)
    for x in (tx0 + 0.08, tx1 - 0.13):
        for y in (ty0 + 0.08, ty1 - 0.13):
            box("Table_Leg", x, y, 0, x + 0.05, y + 0.05, tz - 0.05, WOOD, bevel=0.008)
    # a mug and a book on it — lived-in, not a showroom
    mug = principled("Home_Mug", (0.85, 0.82, 0.75), 0.3)[0]
    cyl("Mug", Vector((6.38, 2.82, tz + 0.05)), 0.04, 0.1, mug)
    box("Book", 6.12, 2.26, tz, 6.42, 2.48, tz + 0.03, principled("Home_Book", (0.25, 0.32, 0.45), 0.6)[0],
        bevel=0.004)

    # floor lamp in the left back corner, warm
    cyl("Lamp_Base", Vector((0.4, 4.2, 0.015)), 0.16, 0.03, METAL)
    cyl("Lamp_Pole", Vector((0.4, 4.2, 0.75)), 0.012, 1.5, METAL)
    cyl("Lamp_Shade", Vector((0.4, 4.2, 1.55)), 0.2, 0.3, LAMP, verts=32, scale=(1, 1, 1))

    # a picture above the sofa
    box("Pic_Frame", 5.4, D - 0.03, 1.3, 6.2, D, 1.85, WOOD, bevel=0.006)
    pm, pnt, pb = principled("Home_Picture", (1, 1, 1), 0.7)
    ptex = pnt.nodes.new("ShaderNodeTexImage")
    ptex.image = bpy.data.images["Home_Outside"]
    pnt.links.new(ptex.outputs["Color"], pb.inputs["Base Color"])
    pic = box("Pic", 5.45, D - 0.035, 1.35, 6.15, D - 0.03, 1.8, pm)
    uv = pic.data.uv_layers.new(name="UVMap")
    for poly in pic.data.polygons:
        for li in poly.loop_indices:
            co = pic.data.vertices[pic.data.loops[li].vertex_index].co
            uv.data[li].uv = ((co.x - 5.45) / 0.7 * 0.6 + 0.2, (co.z - 1.35) / 0.45 * 0.5 + 0.1)

    # ceiling light (flat round)
    cyl("CeilLight", Vector((3.6, 2.3, H - 0.03)), 0.28, 0.05, LAMP)

    # light switch + intercom by the door, inside
    box("Switch", DOOR_X0 - 0.25, 0.0, 1.15, DOOR_X0 - 0.17, 0.012, 1.27, TRIM, bevel=0.003)


def build_hallway():
    box("Hall_Floor", -1.5, HALL_Y, -0.05, W + 1.5, -T, 0.0, HALL_FLOOR)
    box("Hall_Ceiling", -1.5, HALL_Y, H + 0.1, W + 1.5, -T, H + 0.15, HALL_WALL)
    box("Hall_FarWall", -1.5, HALL_Y - 0.1, 0, W + 1.5, HALL_Y, H + 0.1, HALL_WALL)
    box("Hall_Skirt", -1.5, HALL_Y, 0, W + 1.5, HALL_Y + 0.015, 0.1, principled("Hall_Skirt", (0.2, 0.2, 0.21), 0.5)[0])
    # door bell panel, hallway side, left of the door (cat waits under it)
    box("Doorbell_Plate", DOOR_X0 - 0.36, -T - 0.025, 1.22, DOOR_X0 - 0.24, -T, 1.42, TRIM, bevel=0.004)
    cyl("Doorbell_Button", Vector((DOOR_X0 - 0.30, -T - 0.03, 1.29)), 0.018, 0.012, METAL, verts=24)
    box("Doorbell_Lens", DOOR_X0 - 0.32, -T - 0.03, 1.36, DOOR_X0 - 0.28, -T - 0.025, 1.39, DARK)
    # unit number plate
    box("UnitPlate", DOOR_X1 + 0.14, -T - 0.015, 1.65, DOOR_X1 + 0.34, -T, 1.75, METAL, bevel=0.003)


def build_door(open_deg):
    """The front door, hinged at DOOR_X1 on the hallway side, swinging out into the hallway."""
    hinge = bpy.data.objects.new("Door_Hinge", None)
    SET.objects.link(hinge)
    hinge.location = (DOOR_X1 - 0.02, -T - 0.005, 0)
    w = DOOR_X1 - DOOR_X0 - 0.04
    leaf = box("Door_Leaf", -w, -0.05, 0.005, 0, 0, DOOR_H - 0.025, DOORWOOD, bevel=0.006)
    leaf.parent = hinge
    # recessed panels, both faces
    for y in (-0.052, 0.002):
        box("Door_Panel", -w + 0.12, y - 0.002, 0.25, -0.12, y + 0.002, 0.95, WOOD, bevel=0.003).parent = hinge
        box("Door_Panel", -w + 0.12, y - 0.002, 1.1, -0.12, y + 0.002, 1.85, WOOD, bevel=0.003).parent = hinge
    # lever handles and a door closer
    for y, s in ((0.03, 1), (-0.08, -1)):
        cyl("Door_Rose", Vector((-w + 0.07, y - s * 0.012, 1.0)), 0.03, 0.02, METAL).parent = hinge
        box("Door_Lever", -w + 0.07, y - 0.012, 0.99, -w + 0.20, y + 0.012, 1.01, METAL, bevel=0.005).parent = hinge
    box("Door_Closer", -0.45, -0.1, DOOR_H - 0.12, -0.12, -0.05, DOOR_H - 0.06, METAL, bevel=0.01).parent = hinge
    hinge.rotation_euler = (0, 0, math.radians(open_deg))
    return hinge


# ---------------------------------------------------------------- lights, world, render

def setup_lighting():
    w = bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.75, 0.82, 1.0, 1)
    bg.inputs[1].default_value = 0.4
    # morning sun through the window: from behind the back wall, high, a little from the left
    sun = bpy.data.lights.new("Sun", 'SUN')
    sun.energy = 4.2
    sun.angle = math.radians(1.5)
    sun.color = (1.0, 0.88, 0.70)
    so = bpy.data.objects.new("Sun", sun)
    SET.objects.link(so)
    so.rotation_euler = (math.radians(-52), math.radians(-14), math.radians(8))
    # sky bounce entering the window
    win = bpy.data.lights.new("WindowFill", 'AREA')
    win.shape = 'RECTANGLE'
    win.size = WIN_X1 - WIN_X0
    win.size_y = WIN_Z1 - WIN_Z0
    win.energy = 260
    win.color = (0.85, 0.92, 1.0)
    wo = bpy.data.objects.new("WindowFill", win)
    SET.objects.link(wo)
    wo.location = ((WIN_X0 + WIN_X1) / 2, D + 0.06, (WIN_Z0 + WIN_Z1) / 2)
    wo.rotation_euler = (math.radians(90), 0, 0)  # faces -Y into the room
    # warm ceiling fill
    ce = bpy.data.lights.new("CeilingFill", 'AREA')
    ce.shape = 'RECTANGLE'
    ce.size, ce.size_y = 4.0, 2.6
    ce.energy = 150
    ce.color = (1.0, 0.86, 0.68)
    co = bpy.data.objects.new("CeilingFill", ce)
    SET.objects.link(co)
    co.location = (3.6, 2.3, H - 0.08)
    # the lamp's glow
    lp = bpy.data.lights.new("LampGlow", 'POINT')
    lp.energy = 40
    lp.color = (1.0, 0.75, 0.5)
    lp.shadow_soft_size = 0.15
    lo = bpy.data.objects.new("LampGlow", lp)
    SET.objects.link(lo)
    lo.location = (0.4, 4.2, 1.5)
    # hallway: cool flat light
    hl = bpy.data.lights.new("HallLight", 'AREA')
    hl.shape = 'RECTANGLE'
    hl.size, hl.size_y = 3.0, 1.2
    hl.energy = 160
    hl.color = (0.92, 0.95, 1.0)
    ho = bpy.data.objects.new("HallLight", hl)
    SET.objects.link(ho)
    ho.location = (2.6, -1.2, H)


def setup_render():
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.seed = 11
    sc.cycles.max_bounces = 8
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 3
    sc.cycles.transmission_bounces = 6
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e:  # noqa: BLE001
        print("[cheese] GPU unavailable, CPU render:", e)
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    sc.view_settings.exposure = 0.0
    # Illustrated edge: a thin warm-brown outline like the reference panels.
    # Freestyle outlines were tried (alpha .55): barely visible at phone size and they made the
    # renders CPU-bound (~6 min for five fast plates). Off.
    sc.render.use_freestyle = False
    sc.render.line_thickness_mode = 'ABSOLUTE'
    sc.render.line_thickness = 1.1 * RES[0] / 1170
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(120)
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new("Lines")
    ls.select_by_visibility = True
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("CheeseLine")
    ls.linestyle.color = (0.16, 0.08, 0.04)
    ls.linestyle.alpha = 0.55
    ls.linestyle.thickness = 1.0


# ---------------------------------------------------------------- shots

CAT_COLL = bpy.data.collections.new("Cat")
ROOT.children.link(CAT_COLL)
CAM = bpy.data.objects.new("PlayerCam", bpy.data.cameras.new("PlayerCam"))
ROOT.objects.link(CAM)
sc.camera = CAM
CAM.data.sensor_fit = 'VERTICAL'


def clear_cat():
    for o in list(CAT_COLL.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def place_cat(pose, expr, at, face_to, scale=0.95):
    clear_cat()
    root = cheese_cat.build_cat(CAT_COLL, pose, expr)
    root.location = at
    root.scale = (scale, scale, scale)
    d = Vector(face_to) - Vector(at)
    root.rotation_euler = (0, 0, math.atan2(d.x, -d.y))  # cat faces local -Y
    return root


def aim(loc, target, vfov_deg):
    CAM.location = loc
    CAM.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    CAM.data.angle = math.radians(vfov_deg)


SOFA_SPOT = Vector((5.80, 3.98, 0.46))
SHOTS = {
    # name: (camera, target, vfov, cat pose, cat spot, door angle, expression variants)
    "door": ((3.05, 0.7, 1.55), (2.55, -0.9, 0.0), 60, 'sit', (2.58, -0.5, 0.0), 80, []),
    "room": ((2.95, 0.35, 1.58), (5.3, 3.6, 0.35), 58, 'sit', SOFA_SPOT, 80, ['blink', 'talk']),
    "sofa": ((5.35, 1.35, 1.12), (5.76, 3.6, 0.52), 52, 'sit', SOFA_SPOT, 0, ['blink', 'talk', 'smug']),
    "doorstep": ((2.88, 0.95, 1.52), (2.86, -0.85, 0.0), 58, 'sit', (2.9, -0.62, 0.0), 82, ['blink', 'talk']),
    "nap": ((5.35, 1.35, 1.12), (5.76, 3.6, 0.52), 52, 'loaf', SOFA_SPOT, 0, []),
}


def head_rect(root, pad=0.075):
    """The cat's head (incl. ears/whiskers) as a rect in plate fractions (x0,y0,x1,y1; y from top)."""
    pts = []
    for o in root.children:
        if o.name.startswith(("Cheese_Body", "Cheese_Tail")):
            continue
        for v in o.data.vertices:
            pts.append(o.matrix_world @ v.co)
    head = root.matrix_world @ Vector(root["head_local"])
    # body verts near the head too (cheeks/muzzle are part of the body mesh)
    body = next(o for o in root.children if o.name.startswith("Cheese_Body"))
    for v in body.data.vertices:
        w = body.matrix_world @ v.co
        if (w - head).length < 0.17 * root.scale.x:
            pts.append(w)
    uv = [world_to_camera_view(sc, CAM, p) for p in pts]
    xs = [u.x for u in uv]
    ys = [1 - u.y for u in uv]
    x0, x1 = max(0.0, min(xs) - pad * 0.5), min(1.0, max(xs) + pad * 0.5)
    y0, y1 = max(0.0, min(ys) - pad * 0.5), min(1.0, max(ys) + pad * 0.5)
    return [x0, y0, x1, y1]


def render_to(path, border=None):
    r = sc.render
    if border:
        x0, y0, x1, y1 = border
        r.use_border = True
        r.use_crop_to_border = True
        r.border_min_x, r.border_max_x = x0, x1
        r.border_min_y, r.border_max_y = 1 - y1, 1 - y0
    else:
        r.use_border = False
    r.filepath = path
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGB'
    bpy.ops.render.render(write_still=True)


def main():
    build_room()
    build_hallway()
    setup_lighting()
    setup_render()
    manifest = {}
    door = None
    for name, (cam, target, vfov, pose, spot, door_deg, variants) in SHOTS.items():
        if ONLY and name != ONLY:
            continue
        if door:
            for c in list(door.children):
                bpy.data.objects.remove(c, do_unlink=True)
            bpy.data.objects.remove(door, do_unlink=True)
        door = build_door(door_deg)  # +Z rotation takes the leaf (-X from the hinge) to -Y: out into the hallway
        aim(cam, target, vfov)
        face_to = Vector(cam)
        root = place_cat(pose, 'blink' if pose == 'loaf' else 'idle', Vector(spot), face_to)
        bpy.context.view_layer.update()
        entry = {"file": f"{name}.png"}
        if NO_RENDER:
            continue
        render_to(os.path.join(OUT, f"{name}.png"))
        if variants:
            rect = head_rect(root)
            entry["face"] = rect
            entry["variants"] = {}
            for expr in ['idle'] + variants:
                place_cat(pose, expr, Vector(spot), face_to)
                bpy.context.view_layer.update()
                f = f"{name}__{expr}.png"
                render_to(os.path.join(OUT, f), border=rect)
                entry["variants"][expr] = f
        manifest[name] = entry
        print("[cheese] rendered", name, entry)
    with open(os.path.join(OUT, "manifest.json" if not ONLY else f"manifest_{ONLY}.json"), "w") as fh:
        json.dump({"resolution": RES, "plates": manifest}, fh, indent=2)
    # keep the editable set (with the sofa-framing cat) next to the renders
    if not ONLY:
        place_cat('sit', 'idle', SOFA_SPOT, Vector(SHOTS["sofa"][0]))
        aim(*SHOTS["sofa"][:3])
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "cheese_home.blend"), compress=True)


main()
print("CHEESE_HOME_DONE", OUT)
