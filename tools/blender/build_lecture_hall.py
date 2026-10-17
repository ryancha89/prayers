"""19th-century university lecture hall for the Schopenhauer lecture room (Unity LectureRoom).

Blender -b --python tools/blender/build_lecture_hall.py -- <out.fbx> [preview.png]

Simple architecture only — no textures of its own. Material NAMES are the contract with Unity
(LectureRoomBuilder maps them onto URP materials that reuse the consultroom01 wood/floor maps):
  Hall_WoodDark  panelling, dais, lectern, benches, window frames
  Hall_Floor     floor boards
  Hall_Plaster   upper walls, ceiling
  Hall_Board     blackboards
  Hall_Window    the panes (UV 0..1 over each pane; Unity puts an unlit dusk sky on it)
  Hall_Brass     sconces, chandelier ring

Layout (metres, Z up). The SPEAKER stands at the origin on the dais and faces -Y, toward the
benches. Two empties tell Unity how to place the hall: `Marker_Speaker` (where his feet go, on
the dais top) and `Marker_Audience` (a point down the hall in front of him).
"""
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
PREVIEW = argv[1] if len(argv) > 1 else None

DAIS_H = 0.30
HALL_HALF_W = 7.5
BACK_Y = 2.6
FRONT_Y = -14.0
CEIL = 9.0

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
MATS = {}


def mat(name, rgb, emit=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = 0.6
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb, 1)
        b.inputs["Emission Strength"].default_value = emit
    MATS[name] = m
    return m


WOOD = mat("Hall_WoodDark", (0.16, 0.08, 0.04))
FLOOR = mat("Hall_Floor", (0.22, 0.13, 0.07))
PLASTER = mat("Hall_Plaster", (0.55, 0.45, 0.34))
BOARD = mat("Hall_Board", (0.05, 0.08, 0.06))
WINDOW = mat("Hall_Window", (0.9, 0.55, 0.3), emit=2.0)
BRASS = mat("Hall_Brass", (0.75, 0.55, 0.25))
OBJS = []


def obj_from_bm(name, bm, m, cube_uv=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    o.data.materials.append(m)
    if cube_uv:
        box_uv(o)
    OBJS.append(o)
    return o


def box_uv(o, scale=0.5, offset=Vector((0, 0, 0))):
    """World-scale box projection: wood grain the same size on every piece."""
    me = o.data
    uv = me.uv_layers.new(name="UVMap") if not me.uv_layers else me.uv_layers[0]
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co + offset
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            uv.data[li].uv = (u * scale, v * scale)


def box(name, m, cx, cy, cz, sx, sy, sz):
    """Axis-aligned box by centre and full size."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    o = obj_from_bm(name, bm, m, cube_uv=False)
    # Origin at the box's own centre, so a rotation (the lectern's slanted top) turns it in place.
    # (Before 16-10 the geometry sat at world coords round a world-origin pivot: the -18° top swung
    # into his chest.) UVs are projected from world coords so the grain still lines up.
    o.location = (cx, cy, cz)
    box_uv(o, offset=Vector((cx, cy, cz)))
    return o


def quad(name, m, pts, uv01=False):
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(vs)
    o = obj_from_bm(name, bm, m, cube_uv=not uv01)
    if uv01:
        uv = o.data.uv_layers.new(name="UVMap")
        for li, t in zip(o.data.polygons[0].loop_indices, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            uv.data[li].uv = t
    return o


def arch_pane(name, cx, y, z0, w, h, facing=-1, segs=16):
    """An arched window pane in the XZ plane at depth y (rectangle + semicircle head), facing ±Y,
    UV 0..1 over its bounding box — plus its wooden frame and mullions."""
    r = w / 2
    zs = z0 + h - r   # springing line
    outline = [(cx - r, z0), (cx + r, z0), (cx + r, zs)]
    for i in range(1, segs):
        a = math.pi * i / segs
        outline.append((cx + r * math.cos(a), zs + r * math.sin(a)))
    outline.append((cx - r, zs))
    if facing > 0:
        outline = outline[::-1]
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for x, z in outline]
    bm.faces.new(vs)
    o = obj_from_bm(name, bm, WINDOW, cube_uv=False)
    uv = o.data.uv_layers.new(name="UVMap")
    for li in o.data.polygons[0].loop_indices:
        co = o.data.vertices[o.data.loops[li].vertex_index].co
        uv.data[li].uv = ((co.x - (cx - r)) / w, (co.z - z0) / h)
    # frame: sill, jambs, arch (a bevelled curve), a mullion and two transoms
    t, d = 0.09, 0.12
    fy = y + facing * 0.03
    box(name + "_Sill", WOOD, cx, fy + facing * 0.04, z0 - 0.05, w + 0.3, 0.2, 0.1)
    box(name + "_JambL", WOOD, cx - r - t / 2, fy, (z0 + zs) / 2, t, d, zs - z0)
    box(name + "_JambR", WOOD, cx + r + t / 2, fy, (z0 + zs) / 2, t, d, zs - z0)
    box(name + "_Mullion", WOOD, cx, fy, (z0 + zs + r) / 2, 0.05, d * 0.8, zs + r - z0)
    for k in (0.33, 0.66):
        zz = z0 + (zs - z0) * k
        box(name + f"_Transom{int(k * 100)}", WOOD, cx, fy, zz, w, d * 0.8, 0.045)
    cu = bpy.data.curves.new(name + "_ArchC", "CURVE")
    cu.dimensions = "3D"
    sp = cu.splines.new("POLY")
    pts = [(cx + (r + t / 2) * math.cos(math.pi * i / segs), fy, zs + (r + t / 2) * math.sin(math.pi * i / segs))
           for i in range(segs + 1)]
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (*c, 1)
    cu.bevel_depth = t / 2
    cu.bevel_resolution = 1
    co = bpy.data.objects.new(name + "_Arch", cu)
    sc.collection.objects.link(co)
    bpy.context.view_layer.objects.active = co
    co.select_set(True)
    bpy.ops.object.convert(target="MESH")
    co = bpy.context.view_layer.objects.active
    co.data.materials.clear()
    co.data.materials.append(WOOD)
    box_uv(co)
    co.select_set(False)
    OBJS.append(co)
    return o


# ── shell ──────────────────────────────────────────────────────────────────────────────────────
W = HALL_HALF_W
quad("Floor", FLOOR, [(-W, FRONT_Y, 0), (W, FRONT_Y, 0), (W, BACK_Y, 0), (-W, BACK_Y, 0)])
quad("Ceiling", PLASTER, [(-W, FRONT_Y, CEIL), (-W, BACK_Y, CEIL), (W, BACK_Y, CEIL), (W, FRONT_Y, CEIL)])
quad("Wall_Back", PLASTER, [(-W, BACK_Y, 0), (W, BACK_Y, 0), (W, BACK_Y, CEIL), (-W, BACK_Y, CEIL)])
quad("Wall_L", PLASTER, [(-W, FRONT_Y, 0), (-W, BACK_Y, 0), (-W, BACK_Y, CEIL), (-W, FRONT_Y, CEIL)])
quad("Wall_R", PLASTER, [(W, FRONT_Y, 0), (W, FRONT_Y, CEIL), (W, BACK_Y, CEIL), (W, BACK_Y, 0)])
quad("Wall_Front", PLASTER, [(-W, FRONT_Y, 0), (-W, FRONT_Y, CEIL), (W, FRONT_Y, CEIL), (W, FRONT_Y, 0)])

# wainscot panelling (rail + panels) on the back and side walls
PANEL_H = 1.25
box("Wainscot_Back", WOOD, 0, BACK_Y - 0.03, PANEL_H / 2, 2 * W, 0.06, PANEL_H)
box("Wainscot_Rail_Back", WOOD, 0, BACK_Y - 0.07, PANEL_H, 2 * W, 0.08, 0.08)
for s in (-1, 1):
    box(f"Wainscot_{'L' if s < 0 else 'R'}", WOOD, s * (W - 0.03), (FRONT_Y + BACK_Y) / 2, PANEL_H / 2,
        0.06, BACK_Y - FRONT_Y, PANEL_H)
for i in range(-6, 7):
    box(f"Panel_Back_{i + 6:02d}", WOOD, i * 1.1, BACK_Y - 0.07, PANEL_H * 0.48, 0.9, 0.03, PANEL_H * 0.72)
# pilasters on the back wall between bays
for x in (-5.4, -2.95, 2.95, 5.4):
    box(f"Pilaster_{x:+.1f}", WOOD, x, BACK_Y - 0.12, CEIL / 2, 0.42, 0.24, CEIL)
box("Cornice_Back", WOOD, 0, BACK_Y - 0.15, CEIL - 0.25, 2 * W, 0.3, 0.3)

# ── the end wall behind him: a tall central arched window, blackboards either side, two more
#    windows in the outer bays ───────────────────────────────────────────────────────────────
arch_pane("Window_Centre", 0.0, BACK_Y - 0.02, 2.3, 1.9, 5.2)
arch_pane("Window_OuterL", -4.0, BACK_Y - 0.02, 2.4, 1.6, 4.6)
arch_pane("Window_OuterR", 4.0, BACK_Y - 0.02, 2.4, 1.6, 4.6)
# one long blackboard right behind him (it is what the phone sees behind his shoulders), in
# three leaves like a lecture-hall board
for k, cx in enumerate((-1.75, 0.0, 1.75)):
    box(f"Blackboard_{k}", BOARD, cx, BACK_Y - 0.06, 1.72, 1.66, 0.04, 0.8)
    box(f"Blackboard_Frame_{k}", WOOD, cx, BACK_Y - 0.045, 1.72, 1.74, 0.03, 0.88)
box("Blackboard_Ledge", WOOD, 0, BACK_Y - 0.12, 1.29, 5.3, 0.12, 0.04)
# side-wall windows down the hall
for k, yy in enumerate((-1.0, -5.0, -9.0)):
    for s in (-1, 1):
        arch_pane(f"Window_Side{'L' if s < 0 else 'R'}{k}", 0.0, 0.0, 2.6, 1.7, 4.4)
        # rotate the pane + frame into the side wall: built at x=0 in the XZ plane, so turn 90°
        rz = Matrix.Rotation(-s * math.pi / 2, 4, "Z")
        for o in OBJS[-8:]:   # the pane and its 7 frame pieces: turn round the WORLD origin, then move
            o.matrix_world = Matrix.Translation((s * (W - 0.02), yy, 0)) @ rz @ o.matrix_world

# ── the dais and the lectern ──────────────────────────────────────────────────────────────────
box("Dais", WOOD, 0, (BACK_Y - 1.2) / 2 + 0.0, DAIS_H / 2, 8.0, BACK_Y + 1.2, DAIS_H)
box("Dais_Nosing", WOOD, 0, -1.2 - 0.02, DAIS_H - 0.03, 8.1, 0.08, 0.06)
box("Dais_Step", WOOD, 0, -1.45, DAIS_H / 4, 3.0, 0.5, DAIS_H / 2)
lx, ly = 0.80, -0.25
box("Lectern_Base", WOOD, lx, ly, DAIS_H + 0.03, 0.55, 0.45, 0.06)
box("Lectern_Post", WOOD, lx, ly, DAIS_H + 0.52, 0.32, 0.28, 0.95)
top = box("Lectern_Top", WOOD, lx, ly - 0.02, DAIS_H + 1.07, 0.62, 0.48, 0.06)
top.rotation_euler = (math.radians(-18), 0, 0)
box("Lectern_Book", BOARD, lx, ly - 0.04, DAIS_H + 1.12, 0.42, 0.3, 0.03).rotation_euler = (math.radians(-18), 0, 0)
box("Table_Back", WOOD, -1.4, 0.9, DAIS_H + 0.38, 1.6, 0.7, 0.05)
for dx in (-0.7, 0.7):
    for dy in (-0.28, 0.28):
        box(f"Table_Leg_{dx:+.1f}{dy:+.1f}", WOOD, -1.4 + dx, 0.9 + dy, DAIS_H + 0.18, 0.06, 0.06, 0.36)

# ── raked benches: two full rows in front of the dais, then split rows with a centre aisle ────
def bench(name, x0, x1, y, z):
    box(name + "_Seat", WOOD, (x0 + x1) / 2, y, z + 0.45, x1 - x0, 0.42, 0.05)
    box(name + "_Back", WOOD, (x0 + x1) / 2, y - 0.23, z + 0.72, x1 - x0, 0.05, 0.55)
    box(name + "_Desk", WOOD, (x0 + x1) / 2, y - 0.38, z + 0.95, x1 - x0, 0.32, 0.04)
    for xx in (x0 + 0.05, x1 - 0.05):
        box(name + f"_End{xx:+.1f}", WOOD, xx, y - 0.15, z + 0.48, 0.06, 0.7, 0.96)


for r in range(8):
    y = -2.1 - r * 1.05
    z = r * 0.17
    if r > 0:
        box(f"Riser_{r}", WOOD, 0, y + 0.15, z / 2, 2 * W - 0.2, 1.05, z)
    if r < 2:
        bench(f"Bench_{r}", -5.5, 5.5, y, z)
    else:
        bench(f"Bench_{r}L", -5.5, -0.6, y, z)
        bench(f"Bench_{r}R", 0.6, 5.5, y, z)

# ── sconces and chandeliers (light comes from Unity; these are the fittings) ──────────────────
for x in (-3.3, 3.3):
    box(f"Sconce_{x:+.1f}", BRASS, x, BACK_Y - 0.12, 2.6, 0.12, 0.16, 0.3)
    box(f"Sconce_Candle_{x:+.1f}", PLASTER, x, BACK_Y - 0.2, 2.82, 0.04, 0.04, 0.16)
for k, (cx, cy) in enumerate(((0, -2.5), (0, -7.5))):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.7, minor_radius=0.04, location=(cx, cy, 5.2))
    t = bpy.context.object
    t.name = f"Chandelier_{k}"
    t.data.materials.append(BRASS)
    box_uv(t)
    OBJS.append(t)
    box(f"Chandelier_Rod_{k}", BRASS, cx, cy, 7.1, 0.03, 0.03, 3.8)

# markers
MARKERS = (("Marker_Speaker", (0, 0, DAIS_H)), ("Marker_Audience", (0, -6, DAIS_H)),
           ("Marker_Sconce_L", (-3.3, BACK_Y - 0.35, 2.9)), ("Marker_Sconce_R", (3.3, BACK_Y - 0.35, 2.9)),
           ("Marker_Chandelier_0", (0, -2.5, 5.0)), ("Marker_Chandelier_1", (0, -7.5, 5.0)),
           ("Marker_Window", (0, BACK_Y - 0.1, 3.4)))
for name, loc in MARKERS:
    e = bpy.data.objects.new(name, None)
    e.location = loc
    sc.collection.objects.link(e)

# One mesh per material: ~200 boxes would be ~200 draw calls on a phone.
for m in list(MATS.values()):
    group = [o for o in sc.objects if o.type == "MESH" and o.data.materials and o.data.materials[0] == m]
    if not group:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for o in group:
        o.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    if len(group) > 1:
        bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    j.name = j.data.name = m.name.replace("Hall_", "Hall_Geo_")
    print("[hall]", j.name, len(j.data.polygons), "faces")

# one root for Unity
root = bpy.data.objects.new("LectureHall", None)
sc.collection.objects.link(root)
for o in list(sc.collection.objects):
    if o is not root and o.parent is None:
        o.parent = root

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.fbx(filepath=OUT, use_selection=True, object_types={"EMPTY", "MESH"},
                         apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL",
                         axis_forward="-Z", axis_up="Y", mesh_smooth_type="FACE", path_mode="STRIP")
print("[hall] exported", OUT, len(OBJS), "objects")

if PREVIEW:
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 603, 1311
    w = bpy.data.worlds.new("w"); sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.3
    for loc, e in (((0, -3, 6), 600), ((0, 1.5, 3), 150)):
        l = bpy.data.lights.new("p", "POINT"); l.energy = e
        lo = bpy.data.objects.new("p", l); lo.location = loc; sc.collection.objects.link(lo)
    cd = bpy.data.cameras.new("c"); cd.angle_y = math.radians(34); cd.sensor_fit = "VERTICAL"
    cam = bpy.data.objects.new("c", cd); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (0, -4.1, DAIS_H + 1.15)
    cam.rotation_euler = (math.radians(90 - 1), 0, 0)
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
