"""Build Luna (루나, luna_01) -- the Celestial Starlight-Temple Oracle (별빛 신전의 천상 오라클) -- on Yunjung's rig.

Outputs assets/celestial-oracle/luna.blend, luna.fbx, textures/, previews/ (+ celestial_oracle_wip.blend checkpoints).

Base: f_char_003 (Yunjung) -- Female_char03_Outfit01_Avatar.fbx. Her face, hands, legs,
eyebrows, mouth and top hair are reused unchanged and stay skinned to her original
176-bone armature (bone names, hierarchy and object transforms untouched, so the
Unity Generic clips of f_char_003 keep binding). Her FBX body only has hands, legs
and a bust patch, so the missing neck base / torso / shoulders / arms are grafted
from f_char_001's nude body (same bone names) after retargeting it onto Yunjung's
skeleton. Long hair, outfit, jewellery and the lantern prop are generated here.

    Blender -b --python tools/blender/build_celestial_oracle.py
    env CO_STAGE=body   stop after the body graft (debug)
    env CO_FAST=1       EEVEE previews at low samples
"""
import bpy, bmesh, math, os, random, shutil, json
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc
from math import sin, cos, pi
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/celestial-oracle'
TEXOUT = OUT / 'textures'
PREV = OUT / 'previews'
CHARS = Path('/Users/namaste/git/saju_fullstack/saju_world_unity_hall/Assets/Art/1.character')
Y_SRC = CHARS / 'f_char_003'
F1_SRC = CHARS / 'f_char_001'
STAGE = os.environ.get('CO_STAGE', 'all')
FAST = os.environ.get('CO_FAST') == '1'
for d in (OUT, TEXOUT, PREV): d.mkdir(parents=True, exist_ok=True)
random.seed(7)
WIP = OUT / 'celestial_oracle_wip.blend'
bpy.context.preferences.filepaths.save_version = 0
def checkpoint(tag):
    """Save a copy for the live-reloading GUI viewer after every build stage."""
    bpy.ops.wm.save_as_mainfile(filepath=str(WIP), copy=True)
    print('CHECKPOINT', tag, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30

def select_only(*objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

def smooth01(x):
    x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)

# =============================================================================== Yunjung
bpy.ops.import_scene.fbx(filepath=str(Y_SRC / '0.model/Female_char03_Outfit01_Avatar.fbx'))
for img in bpy.data.images:                                  # FBX points at a missing Texture/ folder
    hit = Y_SRC / '1.textures' / Path(img.filepath).name
    if hit.exists(): img.filepath = str(hit); img.reload()
rig = bpy.data.objects['Armature']
rig.pose.bones['Glasses_Jnt'].matrix_basis = Matrix.Identity(4)   # only posed bone (glasses in hand)
RW = rig.matrix_world.copy(); RWI = RW.inverted()
for n in ('Outfit_Geo', 'Outfit1_Geo', 'Outfit2_Geo', 'Glasses_Geo'):
    bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
for o in list(scene.objects):
    if o.type == 'EMPTY' and not o.children: bpy.data.objects.remove(o, do_unlink=True)
body = bpy.data.objects['Body_Geo']; face = bpy.data.objects['Face_Geo']
hairF = bpy.data.objects['HairF_Geo']; hairB = bpy.data.objects['HairB_Geo']

def bone_w(name, tail=False):
    b = rig.data.bones[name]; return RW @ (b.tail_local if tail else b.head_local)

def world_verts(o):
    return [o.matrix_world @ v.co for v in o.data.vertices]

def to_rig_space(o):
    """Bake a world-space object into armature-local data, parented with identity (like the FBX meshes)."""
    if o.type != 'MESH':
        select_only(o); bpy.ops.object.convert(target='MESH'); o = bpy.context.object
    mw = o.matrix_world.copy(); o.parent = None
    o.data.transform(RWI @ mw); o.matrix_world = Matrix.Identity(4)
    o.parent = rig; o.matrix_parent_inverse = Matrix.Identity(4); o.matrix_basis = Matrix.Identity(4)
    return o

def add_armature_mod(o):
    for m in list(o.modifiers):
        if m.type == 'ARMATURE': o.modifiers.remove(m)
    m = o.modifiers.new('Armature', 'ARMATURE'); m.object = rig
    return m

# remove Yunjung's bust patch (replaced by the grafted torso, which the bodice covers)
bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
seen = set(); kill = []
for v in bm.verts:
    if v.index in seen: continue
    comp = []; st = [v]; seen.add(v.index)
    while st:
        x = st.pop(); comp.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen: seen.add(y.index); st.append(y)
    ps = [RW @ x.co for x in comp]
    if min(p.z for p in ps) > 1.25 and max(abs(p.x) for p in ps) < .2: kill += comp
bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(body.data); bm.free()

# =============================================================================== f_char_001 graft
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=str(F1_SRC / '0.model/girl_base_v03.fbx'))
f1_objs = set(bpy.data.objects) - before
rigF = next(o for o in f1_objs if o.type == 'ARMATURE'); rigF.animation_data_clear()
for pb in rigF.pose.bones: pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
graft = next(o for o in f1_objs if o.name.startswith('body_Geo'))
graft.name = 'Skin_Graft'
mw = graft.matrix_world.copy(); graft.parent = None; graft.data.transform(mw); graft.matrix_world = Matrix.Identity(4)
for m in list(graft.modifiers): graft.modifiers.remove(m)
FW = rigF.matrix_world
def bone_f(name): return FW @ rigF.data.bones[name].head_local
# uniform scale from the torso, then per-bone rotation + stretch along each bone
s_glob = (bone_w('Neck00_Jnt') - bone_w('Hip_Jnt')).length / (bone_f('Neck00_Jnt') - bone_f('Hip_Jnt')).length
CHAIN = {'Hip_Jnt': 'Spine01_Jnt', 'Spine01_Jnt': 'Chest_Jnt', 'Chest_Jnt': 'Neck00_Jnt', 'Neck00_Jnt': 'Head_Jnt',
         'Head_Jnt': 'Head_End'}
for s in 'LR':
    CHAIN.update({f'shoulder_Jnt_{s}': f'Arm_Jnt_{s}', f'Arm_Jnt_{s}': f'Elbow_Jnt_{s}', f'Elbow_Jnt_{s}': f'Hand_Jnt_{s}',
                  f'Hand_Jnt_{s}': f'Finger_{s}_Middle_01', f'Thigh_Jnt_{s}': f'Shin_Jnt_{s}', f'Shin_Jnt_{s}': f'Foot_Jnt_{s}',
                  f'Foot_Jnt_{s}': f'Ball_Jnt_{s}'})
STRETCH = {n for n in CHAIN if n.split('_Jnt')[0] in ('Arm', 'Elbow', 'Thigh', 'Shin')}
MB = {}
for b, c in CHAIN.items():
    hf, cf, hy, cy = bone_f(b), bone_f(c), bone_w(b), bone_w(c)
    df = cf - hf; dy = cy - hy
    R = df.normalized().rotation_difference(dy.normalized()).to_matrix().to_4x4()
    k = dy.length / (df.length * s_glob) if b in STRETCH else 1.0
    d = df.normalized(); St = Matrix.Identity(3) + (k - 1) * Matrix([[d.x * d.x, d.x * d.y, d.x * d.z], [d.y * d.x, d.y * d.y, d.y * d.z], [d.z * d.x, d.z * d.y, d.z * d.z]])
    MB[b] = Matrix.Translation(hy) @ R @ Matrix.Scale(s_glob, 4) @ St.to_4x4() @ Matrix.Translation(-hf)
def map_of(name):
    b = rigF.data.bones.get(name)
    while b is not None and b.name not in MB: b = b.parent
    return MB[b.name] if b else MB['Hip_Jnt']
gi = {vg.index: vg.name for vg in graft.vertex_groups}
GRAFT_DOM = []
for v in graft.data.vertices:
    acc = Vector(); tot = 0; best = (0, 'Hip_Jnt')
    for g in v.groups:
        if g.weight <= 0: continue
        acc += g.weight * (map_of(gi[g.group]) @ v.co); tot += g.weight
        best = max(best, (g.weight, gi[g.group]))
    v.co = acc / tot if tot else MB['Hip_Jnt'] @ v.co
    GRAFT_DOM.append(best[1])
missing = {vg.name for vg in graft.vertex_groups} - set(rig.data.bones.keys())
print('GRAFT scale', round(s_glob, 3), 'missing bones', missing)
for o in f1_objs:
    if o != graft: bpy.data.objects.remove(o, do_unlink=True)

def subtree_names(arm, root):
    out = set(); st = [arm.data.bones[root]]
    while st:
        b = st.pop(); out.add(b.name); st += list(b.children)
    return out
DROP = subtree_names(rig, 'Head_Jnt') | subtree_names(rig, 'Hand_Jnt_L') | subtree_names(rig, 'Hand_Jnt_R')
for s in 'LR': DROP |= subtree_names(rig, f'Shin_Jnt_{s}')
bm = bmesh.new(); bm.from_mesh(graft.data); bm.verts.ensure_lookup_table()
DOM_NAMES = sorted(set(GRAFT_DOM)); dl = bm.verts.layers.int.new('dom')
for v in bm.verts: v[dl] = DOM_NAMES.index(GRAFT_DOM[v.index])
bmesh.ops.delete(bm, geom=[v for v in bm.verts if GRAFT_DOM[v.index] in DROP], context='VERTS')
def dom(v): return DOM_NAMES[v[dl]]

# seam targets on Yunjung: neck ring (bottom of Face_Geo), forearm rings and thigh tops (Body_Geo boundaries)
def boundary_loops(o):
    bm = bmesh.new(); bm.from_mesh(o.data)
    edges = [e for e in bm.edges if e.is_boundary]; adj = {}
    for e in edges:
        a, b = e.verts; adj.setdefault(a.index, []).append(b.index); adj.setdefault(b.index, []).append(a.index)
    co = {v.index: o.matrix_world @ v.co for v in bm.verts}; bm.free()
    loops = []; seen = set()
    for s0 in adj:
        if s0 in seen: continue
        comp = []; st = [s0]; seen.add(s0)
        while st:
            x = st.pop(); comp.append(co[x])
            for y in adj[x]:
                if y not in seen: seen.add(y); st.append(y)
        loops.append(comp)
    return loops
def ring_fit(pts):
    c = sum(pts, Vector()) / len(pts); r = sum((p - c).length for p in pts) / len(pts); return c, r
FACE_LOOPS = boundary_loops(face)
neck_ring = min(FACE_LOOPS, key=lambda L: sum(p.z for p in L) / len(L))
z_neck = sum(p.z for p in neck_ring) / len(neck_ring)
neck_c, neck_r = ring_fit(neck_ring)
BODY_LOOPS = boundary_loops(body)
arm_rings = {}
for s, sg in (('L', 1), ('R', -1)):
    el = bone_w(f'Elbow_Jnt_{s}')
    loop = min(BODY_LOOPS, key=lambda L: min((p - el).length for p in L))
    c, r = ring_fit(loop); axis = (bone_w(f'Hand_Jnt_{s}') - bone_w(f'Elbow_Jnt_{s}')).normalized()
    arm_rings[s] = (c, r, axis)
leg_top = max(max(p.z for p in L) for L in BODY_LOOPS if max(p.z for p in L) < 1.0)
print('SEAMS neck z', round(z_neck, 3), 'r', round(neck_r, 3), 'arm', {k: (tuple(round(x, 3) for x in v[0]), round(v[1], 3)) for k, v in arm_rings.items()}, 'leg_top', round(leg_top, 3))

def cut_and_fit(bm, origin, normal, target_c, target_r, blend_len, overlap, bones=None):
    """Keep the side opposite to `normal`, cut `overlap` past the seam, and morph the ring near it to the target ring.
    `bones` limits the cut to vertices dominated by those bones (so an arm plane does not slice the hips)."""
    o = origin + normal * overlap
    sel = set(v for v in bm.verts if bones is None or dom(v) in bones)
    faces = [f for f in bm.faces if all(v in sel for v in f.verts)]
    edges = [e for e in bm.edges if all(v in sel for v in e.verts)]
    res = bmesh.ops.bisect_plane(bm, geom=list(sel) + edges + faces, plane_co=o, plane_no=normal)
    newv = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
    sel |= set(newv)
    bmesh.ops.delete(bm, geom=[v for v in sel if v.is_valid and (v.co - o).dot(normal) > 1e-5], context='VERTS')
    sel = set(v for v in sel if v.is_valid)
    ring = [v for v in sel if abs((v.co - o).dot(normal)) < 1e-4]
    if not ring: return
    c = sum((v.co for v in ring), Vector()) / len(ring)
    rad = sum(((v.co - c) - normal * (v.co - c).dot(normal)).length for v in ring) / len(ring)
    print('CUT ring', len(ring), 'rad', round(rad, 4), 'target', round(target_r, 4))
    for v in sel:
        dist = (o - v.co).dot(normal)                  # >= 0 on the kept side
        if dist > blend_len: continue
        w = smooth01(1 - dist / blend_len)
        rel = v.co - c; along = normal * rel.dot(normal); perp = rel - along
        f = 1 + (target_r * .985 / rad - 1) * w
        v.co = c + along + perp * f + (target_c - c - normal * (target_c - c).dot(normal)) * w
cut_and_fit(bm, neck_c, Vector((0, 0, 1)), neck_c, neck_r, .06, .006)
for s, (c, r, axis) in arm_rings.items():
    cut_and_fit(bm, c, axis, c, r, .07, .012, subtree_names(rig, f'Arm_Jnt_{s}'))
# hips: Yunjung's legs piece ends in one ring around both thighs; overlap 2 cm inside it (under the skirt)
loop = max((L for L in BODY_LOOPS if max(p.z for p in L) < 1.0), key=lambda L: sum(p.z for p in L) / len(L))
c, r = ring_fit(loop); print('HIP ring', tuple(round(x, 3) for x in c), round(r, 3), len(loop))
cut_and_fit(bm, c, Vector((0, 0, -1)), c, r, .07, .02, subtree_names(rig, 'Thigh_Jnt_L') | subtree_names(rig, 'Thigh_Jnt_R') | {'Hip_Jnt'})
bm.to_mesh(graft.data); bm.free()

# match the graft skin tone to Yunjung's body texture
def avg_tex(img, uvs):
    small = img.copy(); small.scale(64, 64); px = np.array(small.pixels[:]).reshape(64, 64, 4); bpy.data.images.remove(small)
    acc = np.zeros(3)
    for u, v in uvs: acc += px[int(v % 1 * 63), int(u % 1 * 63), :3]
    return acc / max(len(uvs), 1)
def sample_uvs(o, pred):
    uv = o.data.uv_layers.active.data; out = []
    for p in o.data.polygons:
        if pred(o.matrix_world @ p.center):
            for li in p.loop_indices: out.append(tuple(uv[li].uv))
    return out
y_mat = body.data.materials[0]; y_img = next(n.image for n in y_mat.node_tree.nodes if n.type == 'TEX_IMAGE')
g_mat = graft.data.materials[0]; g_img = bpy.data.images.load(str(F1_SRC / '1.textures/girl_body_BaseColor.png'), check_existing=True)
for n in g_mat.node_tree.nodes:
    if n.type == 'TEX_IMAGE': n.image = g_img
c_y = avg_tex(y_img, sample_uvs(body, lambda p: .5 < p.z < .9 and abs(p.x) < .2))
c_g = avg_tex(g_img, sample_uvs(graft, lambda p: 1.1 < p.z < 1.3 and abs(p.x) < .1))
tint = [min(2.0, max(.4, c_y[i] / max(c_g[i], .02))) for i in range(3)]
print('SKIN yunjung', c_y.round(3), 'graft', c_g.round(3), 'tint', [round(t, 3) for t in tint])
SKIN_TINT = tint

# join graft into Body_Geo (multi-material, all groups are Yunjung bone names)
graft.data.materials.clear(); graft.data.materials.append(g_mat)
graft.data.uv_layers.active.name = body.data.uv_layers.active.name
graft = to_rig_space(graft)
select_only(body, graft); bpy.ops.object.join()
body = bpy.data.objects['Body_Geo']
for p in body.data.polygons: p.use_smooth = True

add_armature_mod(body)
checkpoint('base body + graft')

# =============================================================================== preview rendering
def setup_render():
    sc = scene
    sc.render.engine = 'BLENDER_EEVEE'
    try: sc.eevee.taa_render_samples = 32 if FAST else 96
    except Exception: pass
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.film_transparent = False
    w = bpy.data.worlds.new('Starlight sky'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; bg = nt.nodes['Background']
    grad = nt.nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'LINEAR'
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, pi / 2, 0)
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (.42, .38, .58, 1); ramp.color_ramp.elements[1].color = (.12, .10, .24, 1)
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = .35
    def light(name, kind, energy, color, loc, target, size=1.0):
        d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
        if kind == 'AREA': d.size = size
        o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o
    light('Key (warm gold)', 'AREA', 260, (1.0, .87, .68), (-1.7, -2.5, 2.5), (0, 0, 1.1), 2.2)
    light('Fill (lavender)', 'AREA', 90, (.76, .72, 1.0), (2.3, -1.9, 1.3), (0, 0, 1.0), 2.5)
    light('Rim (violet)', 'AREA', 330, (.72, .58, 1.0), (1.3, 2.2, 2.3), (0, 0, 1.2), 1.2)
    light('Rim (gold)', 'AREA', 220, (1.0, .80, .52), (-1.5, 1.9, 1.7), (0, 0, 1.0), 1.2)
    light('Face fill', 'AREA', 25, (1.0, .92, .86), (0, -1.2, 1.65), (0, 0, 1.62), .6)
    fl = bpy.data.meshes.new('Temple floor'); bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=2.2); bm.to_mesh(fl); bm.free()
    fo = bpy.data.objects.new('Temple floor', fl); sc.collection.objects.link(fo)
    m = bpy.data.materials.new('Floor marble'); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (.10, .085, .17, 1); p.inputs['Roughness'].default_value = .45
    fl.materials.append(m)
    cam = bpy.data.cameras.new('Preview cam'); co = bpy.data.objects.new('Preview cam', cam); sc.collection.objects.link(co); sc.camera = co
    return co

def shoot(cam, name, loc, target, lens=50, w=1024, h=1365):
    cam.location = loc; cam.data.lens = lens
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x = w; scene.render.resolution_y = h
    scene.render.filepath = str(PREV / name); bpy.ops.render.render(write_still=True)

if STAGE == 'body':
    cam = setup_render()
    shoot(cam, 'debug_body_front.png', (0, -5.2, 1.0), (0, 0, .92), 50, 700, 930)
    shoot(cam, 'debug_body_34.png', (3.6, -3.6, 1.1), (0, 0, .92), 50, 700, 930)
    shoot(cam, 'debug_body_back.png', (0, 5.2, 1.0), (0, 0, .92), 50, 700, 930)
    shoot(cam, 'debug_body_neck.png', (0.6, -1.4, 1.5), (0, 0, 1.4), 50, 700, 700)
    raise SystemExit

# =============================================================================== textures (written as PNGs so Unity gets them)
def save_png(name, arr):
    """arr: HxWx4 float sRGB-ish values in 0..1 (row 0 = bottom, Blender convention)."""
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = str(TEXOUT / f'{name}.png'); img.file_format = 'PNG'; img.save()
    img.filepath = str(TEXOUT / f'{name}.png'); return img
def load_px(path, size=None):
    img = bpy.data.images.load(str(path), check_existing=False)
    if size: img.scale(*size)
    w, h = img.size; a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4); bpy.data.images.remove(img); return a

def star_stamp(arr, cx, cy, R, col, alpha=1.0):
    h, w = arr.shape[:2]; R = max(R, 1.5)
    x0, x1 = int(cx - R - 1), int(cx + R + 2); y0, y1 = int(cy - R - 1), int(cy + R + 2)
    ys, xs = np.mgrid[y0:y1, x0:x1]; dx = np.abs(xs - cx) / R; dy = np.abs(ys - cy) / R
    m = np.clip(1 - (np.sqrt(dx) + np.sqrt(dy)), 0, 1) * 2.2 + np.clip(1 - np.hypot(dx, dy) * 3, 0, 1)
    m = np.clip(m, 0, 1)
    xs %= w; ys = np.clip(ys, 0, h - 1)
    for k in range(3): arr[ys, xs, k] = arr[ys, xs, k] * (1 - m) + col[k] * m
    arr[ys, xs, 3] = np.maximum(arr[ys, xs, 3], m * alpha)
def line_stamp(arr, p, q, col, width=1.2, alpha=.9):
    h, w = arr.shape[:2]; n = int(max(abs(q[0] - p[0]), abs(q[1] - p[1])) * 1.5) + 1
    for t in np.linspace(0, 1, n):
        x = p[0] + (q[0] - p[0]) * t; y = p[1] + (q[1] - p[1]) * t
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                xi, yi = int(x + ox) % w, int(np.clip(y + oy, 0, h - 1))
                m = max(0, 1 - np.hypot(xi - x, yi - y) / width) * .9
                arr[yi, xi, :3] = arr[yi, xi, :3] * (1 - m) + np.array(col) * m; arr[yi, xi, 3] = max(arr[yi, xi, 3], m * alpha)
GOLD_SRGB = (.93, .76, .42)

def make_sheer_texture(name, top, hem, a_top, a_hem, n_stars=260, hem_band=True):
    W = H = 1024; v = np.linspace(0, 1, H)[:, None]        # v=0 hem, v=1 waist
    t = np.clip(v, 0, 1) ** .8
    arr = np.zeros((H, W, 4), np.float32)
    for k in range(3): arr[..., k] = hem[k] + (top[k] - hem[k]) * t
    arr[..., 3] = a_hem + (a_top - a_hem) * t
    # soft vertical gathers
    u = np.linspace(0, 1, W)[None, :]
    arr[..., 3] *= (1 + .10 * np.sin(u * 2 * pi * 24) * (1 - t * .5))
    rng = np.random.default_rng(3)
    for _ in range(n_stars):                                 # sparse sparkles, denser at the hem
        y = (rng.random() ** 2.2) * H * .75; x = rng.random() * W
        star_stamp(arr, x, y, 2 + rng.random() * 5 * (1 - y / H), GOLD_SRGB, .95)
    for c in range(14):                                      # constellations near the hem
        cx = rng.random() * W; cy = 60 + rng.random() * 200
        pts = [(cx + rng.normal() * 40, cy + rng.normal() * 30) for _ in range(4 + int(rng.random() * 3))]
        for p_, q_ in zip(pts, pts[1:]): line_stamp(arr, p_, q_, GOLD_SRGB, 1.3, .8)
        for p_ in pts: star_stamp(arr, p_[0], p_[1], 6 + rng.random() * 5, (1, .92, .7), 1)
    if hem_band:
        arr[:10, :, :3] = GOLD_SRGB; arr[:10, :, 3] = 1
        arr[16:20, :, :3] = GOLD_SRGB; arr[16:20, :, 3] = .95
        for i in range(0, W, 32): star_stamp(arr, i + 16, 34, 9, GOLD_SRGB, 1)
    return save_png(name, arr)

def make_navy_texture():
    W = H = 512; arr = np.zeros((H, W, 4), np.float32); v = np.linspace(0, 1, H)[:, None]
    base = np.array([.09, .07, .22]); deep = np.array([.16, .10, .34])
    for k in range(3): arr[..., k] = deep[k] + (base[k] - deep[k]) * v
    arr[..., 3] = 1
    rng = np.random.default_rng(11)
    for _ in range(90): star_stamp(arr, rng.random() * W, rng.random() * H, 1.5 + rng.random() * 3.5, (1, .9, .65), 1)
    arr[:6, :, :3] = GOLD_SRGB; arr[-4:, :, :3] = GOLD_SRGB
    arr[:, :3, :3] = GOLD_SRGB; arr[:, -3:, :3] = GOLD_SRGB
    return save_png('CO_NavyStarCloth_BaseColor', arr)

def make_hair_card_texture():
    W, H = 256, 1024; rng = np.random.default_rng(5)
    v = np.linspace(0, 1, H)[:, None]; xx = np.arange(W)[None, :]   # v=1 root, v=0 tip
    base = np.array([.17, .10, .065]); lo = np.array([.13, .075, .05]); hi = np.array([.42, .27, .18])   # = recolor_hair's palette
    col = np.zeros((H, W, 3)) + base; alpha = np.zeros((H, W))
    for i in range(140):
        x = rng.random() * W; wid = 1.0 + rng.random() * 2.2; tip = rng.random() * .3
        xs = x + 3 * np.sin(v[:, 0] * 2 * pi * (1 + rng.random()) + rng.random() * 6)
        m = np.clip(1 - np.abs(xx - xs[:, None]) / wid, 0, 1) * np.clip((v - tip) / .1, 0, 1)
        shade = lo + (hi - lo) * rng.random() ** 2.5
        col = col * (1 - m[..., None]) + shade * m[..., None]; alpha = np.maximum(alpha, m)
    edge = np.clip(np.minimum(np.arange(W), W - 1 - np.arange(W)) / 30, 0, 1)[None, :]
    core = np.clip(1 - np.abs(np.arange(W) - W / 2) / (W * .42), 0, 1)[None, :] ** .5 * np.clip((v - .08) / .3, 0, 1)
    arr = np.zeros((H, W, 4), np.float32); arr[..., :3] = col
    # OPAQUE body, only the outer edge and the last few % of the tip cut out (alpha-tested, not blended)
    solid = np.clip(1 - np.abs(np.arange(W) - W / 2) / (W * .47), 0, 1)[None, :] ** .25 * np.clip((v - .03) / .08, 0, 1)
    arr[..., 3] = np.clip(np.maximum(alpha, solid), 0, 1)
    return save_png('CO_HairCards_BaseColor', arr)

def recolor_hair():
    a = load_px(Y_SRC / '1.textures/Hair2.jpg')
    lum = a[..., :3].mean(axis=2, keepdims=True)
    brown_dark = np.array([.13, .075, .05]); brown_hi = np.array([.58, .38, .25])   # warm dark brown (17-10), not near-black
    a[..., :3] = brown_dark + (brown_hi - brown_dark) * np.clip(lum * 1.9 + .06, 0, 1) ** .9
    a[..., 3] = 1
    return save_png('CO_Hair_Brown_BaseColor', a)

def tint_graft_skin():
    a = load_px(F1_SRC / '1.textures/girl_body_BaseColor.png')
    for k in range(3): a[..., k] *= SKIN_TINT[k]
    return save_png('CO_SkinGraft_BaseColor', a)

def gen_textures():
    T = {}
    T['sheer_white'] = make_sheer_texture('CO_SheerIvory_BaseColor', (.98, .96, .99), (.86, .80, .97), .34, .56)
    T['sheer_lav'] = make_sheer_texture('CO_SheerLavender_BaseColor', (.93, .90, 1.0), (.62, .50, .88), .24, .58, 320)
    T['navy'] = make_navy_texture(); T['hair_cards'] = make_hair_card_texture()
    T['hair'] = recolor_hair(); T['skin_graft'] = tint_graft_skin()
    return T
TEX = gen_textures()

# =============================================================================== materials
def mat(name, col, metal=0.0, rough=.5, alpha=1.0, emit=None, tex=None, sheen=0.0, method=None, alpha_from_tex=False, spec=.5, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; m.diffuse_color = (*col, 1)
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*col, 1); p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough; p.inputs['Alpha'].default_value = alpha
    p.inputs['Sheen Weight'].default_value = sheen; p.inputs['Specular IOR Level'].default_value = spec
    p.inputs['Coat Weight'].default_value = coat
    if emit:
        p.inputs['Emission Color'].default_value = (*emit[0], 1); p.inputs['Emission Strength'].default_value = emit[1]
    if tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = tex; t.location = (-400, 200)
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
        if alpha_from_tex: nt.links.new(t.outputs['Alpha'], p.inputs['Alpha'])
    if alpha < 1 or alpha_from_tex:
        m.surface_render_method = method or 'BLENDED'; m.use_backface_culling = False
        try: m.use_transparency_overlap = True
        except Exception: pass
    return m
M = {
    'gold': mat('CO_Gold', (1.0, .72, .36), 1.0, .26),
    'gold_dark': mat('CO_GoldAntique', (.80, .55, .25), 1.0, .38),
    'bodice': mat('CO_Bodice_IvorySatin', (.93, .90, .88), 0, .42, sheen=.4, coat=.15),
    'corset': mat('CO_Corset_NavyVelvet', (1, 1, 1), 0, .55, tex=TEX['navy'], sheen=.15),
    'panel': mat('CO_Panel_NavyStar', (1, 1, 1), 0, .6, tex=TEX['navy'], sheen=.15),
    'sheer_white': mat('CO_Sheer_Ivory', (1, 1, 1), 0, .45, tex=TEX['sheer_white'], alpha_from_tex=True, sheen=.2),
    'sheer_lav': mat('CO_Sheer_Lavender', (1, 1, 1), 0, .45, tex=TEX['sheer_lav'], alpha_from_tex=True, sheen=.2),
    'amethyst': mat('CO_Amethyst', (.45, .25, .95), 0, .08, emit=((.55, .35, 1.0), 1.5), spec=.9),
    'tassel': mat('CO_Tassel_Violet', (.42, .30, .78), 0, .6, sheen=.7),
    'petal': mat('CO_Flower_White', (.97, .96, .95), 0, .45, sheen=.3),
    'hair_cards': mat('CO_HairCards', (1, 1, 1), 0, .45, tex=TEX['hair_cards'], alpha_from_tex=True, method='DITHERED', spec=.5),
    'core': mat('CO_Lantern_Core', (.55, .35, 1.0), 0, .1, emit=((.62, .42, 1.0), 12.0)),
    'pearl': mat('CO_Pearl', (.95, .93, .97), 0, .2, coat=.6),
}
# Yunjung's imported materials: FBX gives metallic 0.5 everywhere; make them proper dielectrics
for m in list(bpy.data.materials):
    if not m.name.startswith('_') and m.name not in ('Girl_mtl', 'Mouth_Mrt'): continue
    if not (m.use_nodes and 'Principled BSDF' in m.node_tree.nodes): continue
    p = m.node_tree.nodes['Principled BSDF']; p.inputs['Metallic'].default_value = 0
    p.inputs['Roughness'].default_value = .5; p.inputs['Specular IOR Level'].default_value = .35
hm = bpy.data.materials['_Material_012']; hm.name = 'CO_Hair_Brown'
for n in hm.node_tree.nodes:
    if n.type == 'TEX_IMAGE': n.image = TEX['hair']
hm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .38
for o in (hairF, hairB): o.data.materials[0] = hm
bpy.data.materials['_Material_018'].name = 'CO_Brows'
mm = bpy.data.materials['Mouth_Mrt']; mm.name = 'CO_Mouth'
for n in mm.node_tree.nodes:
    if n.type == 'TEX_IMAGE': n.image = bpy.data.images.load(str(Y_SRC / '1.textures/anime1_face_M_BaseColor.png'), check_existing=True)
g = bpy.data.materials['Girl_mtl']; g.name = 'CO_Skin_Graft'
for n in g.node_tree.nodes:
    if n.type == 'TEX_IMAGE': n.image = TEX['skin_graft']
for m in (g, bpy.data.materials['_Base_M3']):
    p = m.node_tree.nodes['Principled BSDF']; p.inputs['Roughness'].default_value = .55; p.inputs['Specular IOR Level'].default_value = .3
    for l in list(p.inputs['Normal'].links): m.node_tree.links.remove(l)     # graft has no normal map; keep both matte-equal
bpy.data.materials['_Base_M3'].name = 'CO_Skin_Yunjung'
bpy.data.materials['_face_M3'].name = 'CO_Face_Yunjung'

# =============================================================================== body sampling helpers
VG = {vg.index: vg.name for vg in body.vertex_groups}
BODY_W = world_verts(body)
BODY_WEIGHTS = [{VG[g.group]: g.weight for g in v.groups if g.weight > 1e-4} for v in body.data.vertices]
BODY_DOM = [max(w.items(), key=lambda kv: kv[1])[0] if w else 'Hip_Jnt' for w in BODY_WEIGHTS]
ARM_BONES = subtree_names(rig, 'Arm_Jnt_L') | subtree_names(rig, 'Arm_Jnt_R')
LEG_LOW = set()
for s_ in 'LR': LEG_LOW |= subtree_names(rig, f'Shin_Jnt_{s_}')
def bvh_of(verts, polys, keep=lambda poly: True):
    ps = [tuple(p.vertices) for p in polys if keep(p)]
    return BVHTree.FromPolygons(verts, ps)
BVH_ALL = bvh_of(BODY_W, body.data.polygons)
BVH_TORSO = bvh_of(BODY_W, body.data.polygons, lambda p: all(BODY_DOM[i] not in ARM_BONES for i in p.vertices))
FACE_BVH = bvh_of(world_verts(face), face.data.polygons)
COLLIDE = BVHTree.FromPolygons(BODY_W + world_verts(face), [tuple(p.vertices) for p in body.data.polygons] + [tuple(i + len(BODY_W) for i in p.vertices) for p in face.data.polygons])

def ray_first(bvh, o, d, maxd=1.0):
    hit = bvh.ray_cast(Vector(o), Vector(d).normalized(), maxd); return hit[0], hit[1]
def ray_far(bvh, o, d, maxd=1.0):
    o = Vector(o); d = Vector(d).normalized(); last = None; travelled = 0
    while travelled < maxd:
        loc, nrm, idx, dist = bvh.ray_cast(o, d, maxd - travelled)
        if loc is None: break
        last = loc; travelled += dist + 1e-4; o = loc + d * 1e-4
    return last

def weights_at(p, bvh=BVH_ALL, polys=None):
    loc, nrm, idx, dist = bvh.find_nearest(Vector(p))
    if idx is None: return {'Hip_Jnt': 1.0}
    poly = (polys or BVH_POLYS)[idx]; vs = [BODY_W[i] for i in poly]
    bw = poly_3d_calc(vs, loc); out = {}
    for i, b in zip(poly, bw):
        for k, w in BODY_WEIGHTS[i].items(): out[k] = out.get(k, 0) + w * b
    return out
BVH_POLYS = [tuple(p.vertices) for p in body.data.polygons]

def assign_weights(o, wfun):
    """wfun(world_pos, vertex_index) -> {bone: weight}; keeps the 4 largest, normalised (Unity default)."""
    for vg in list(o.vertex_groups): o.vertex_groups.remove(vg)
    groups = {}
    mw = o.matrix_world
    for v in o.data.vertices:
        w = wfun(mw @ v.co, v.index)
        items = sorted(((k, x) for k, x in w.items() if x > 1e-3 and k in rig.data.bones), key=lambda kv: -kv[1])[:4]
        tot = sum(x for _, x in items) or 1
        for k, x in items:
            if k not in groups: groups[k] = o.vertex_groups.new(name=k)
            groups[k].add([v.index], x / tot, 'REPLACE')
def transfer(o): assign_weights(o, lambda p, i: weights_at(p))
LEG_TO_HIP = set()
for s_ in 'LR': LEG_TO_HIP |= subtree_names(rig, f'Thigh_Jnt_{s_}')
LEG_TO_HIP |= {b.name for b in rig.data.bones if b.name.startswith('LapSpine')}
def torso_weights(p, i):
    """Body weights with leg influence folded into the hip (fitted torso garments must not follow the thighs)."""
    out = {}
    for k, w in weights_at(p).items():
        k = 'Hip_Jnt' if k in LEG_TO_HIP else k; out[k] = out.get(k, 0) + w
    return out
def rigid(o, bone): assign_weights(o, lambda p, i: {bone: 1.0})

CHAR_PARTS = []
def finish(o, wmode, *args):
    """Weights (in world space), then move into armature space with an Armature modifier."""
    if o.type != 'MESH':
        select_only(o); bpy.ops.object.convert(target='MESH'); o = bpy.context.object
    for p in o.data.polygons: p.use_smooth = True
    if wmode == 'transfer': transfer(o)
    elif wmode == 'rigid': rigid(o, args[0])
    else: assign_weights(o, wmode)
    o = to_rig_space(o); add_armature_mod(o); CHAR_PARTS.append(o); return o

def mesh_obj(name, verts, faces, m, uvs=None):
    d = bpy.data.meshes.new(name); d.from_pydata([tuple(v) for v in verts], [], faces); d.update()
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); d.materials.append(m)
    if uvs is not None:
        uv = d.uv_layers.new(name='UVMap')
        for poly in d.polygons:
            for li in poly.loop_indices: uv.data[li].uv = uvs[d.loops[li].vertex_index]
    for p in d.polygons: p.use_smooth = True
    return o

def grid_obj(name, P, m, wrap=True):
    """P: list of columns (u) of rows (v) of world points."""
    nu = len(P); nv = len(P[0]); verts = [p for col in P for p in col]; faces = []
    for i in range(nu if wrap else nu - 1):
        i2 = (i + 1) % nu
        for j in range(nv - 1):
            faces.append((i * nv + j, i2 * nv + j, i2 * nv + j + 1, i * nv + j + 1))
    if wrap:   # duplicate seam column for clean UVs
        verts += P[0]; faces = [f if i < nu - 1 else (f[0], nu * nv + (f[1] - 0) % nv if False else nu * nv + j, nu * nv + j + 1, f[3]) for i in range(nu) for j, f in [(jj, faces[i * (nv - 1) + jj]) for jj in range(nv - 1)]]
    uvs = [(i / nu, j / (nv - 1)) for i in range(nu) for j in range(nv)] + ([(1.0, j / (nv - 1)) for j in range(nv)] if wrap else [])
    if not wrap: uvs = [(i / (nu - 1), j / (nv - 1)) for i in range(nu) for j in range(nv)]
    return mesh_obj(name, verts, faces, m, uvs)

def tube_obj(name, path, radius, m, sides=8, cap=False):
    """path: list of points, radius: float or fn(t)."""
    verts = []; faces = []; n = len(path)
    for i, p in enumerate(path):
        tg = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        a = tg.cross(Vector((0, 0, 1)) if abs(tg.z) < .9 else Vector((1, 0, 0))).normalized(); b = tg.cross(a)
        r = radius(i / (n - 1)) if callable(radius) else radius
        for k in range(sides):
            th = 2 * pi * k / sides; verts.append(p + r * (a * cos(th) + b * sin(th)))
    for i in range(n - 1):
        for k in range(sides):
            faces.append((i * sides + k, i * sides + (k + 1) % sides, (i + 1) * sides + (k + 1) % sides, (i + 1) * sides + k))
    if cap: faces.append(tuple(range(sides))[::-1]); faces.append(tuple((n - 1) * sides + k for k in range(sides)))
    return mesh_obj(name, verts, faces, m)

def ring_obj(name, center, normal, R, r, m, seg=24, sides=6, squash=1.0):
    c = Vector(center); nz = Vector(normal).normalized()
    a = nz.cross(Vector((0, 0, 1)) if abs(nz.z) < .9 else Vector((1, 0, 0))).normalized(); b = nz.cross(a)
    path = [c + R * (a * cos(2 * pi * i / seg) + b * sin(2 * pi * i / seg)) for i in range(seg)]
    verts = []; faces = []
    for i, p in enumerate(path):
        out = (p - c).normalized()
        for k in range(sides):
            th = 2 * pi * k / sides; verts.append(p + r * (out * cos(th) + nz * sin(th) * squash))
    for i in range(seg):
        for k in range(sides):
            i2 = (i + 1) % seg; faces.append((i * sides + k, i2 * sides + k, i2 * sides + (k + 1) % sides, i * sides + (k + 1) % sides))
    return mesh_obj(name, verts, faces, m)

def gem_obj(name, center, size, m, elong=1.6, axis=(0, 0, -1), seg=8):
    """Faceted teardrop gem pointing along axis."""
    c = Vector(center); ax = Vector(axis).normalized()
    a = ax.cross(Vector((1, 0, 0)) if abs(ax.x) < .9 else Vector((0, 1, 0))).normalized(); b = ax.cross(a)
    verts = [c - ax * size * .6]
    for k in range(seg):
        th = 2 * pi * k / seg; verts.append(c + size * (a * cos(th) + b * sin(th)))
    verts.append(c + ax * size * elong)
    faces = [(0, 1 + (k + 1) % seg, 1 + k) for k in range(seg)] + [(1 + k, 1 + (k + 1) % seg, seg + 1) for k in range(seg)]
    o = mesh_obj(name, verts, faces, m)
    for p in o.data.polygons: p.use_smooth = False
    return o

def star_obj(name, center, normal, R, r_in, points, depth, m, up=(0, 0, 1)):
    c = Vector(center); nz = Vector(normal).normalized(); upv = Vector(up)
    a = (upv - nz * upv.dot(nz)).normalized(); b = a.cross(nz)
    outline = []
    for k in range(points * 2):
        th = pi * k / points; rr = R if k % 2 == 0 else r_in
        outline.append(c + rr * (a * cos(th) + b * sin(th)))
    verts = outline + [p + nz * depth for p in outline] + [c + nz * depth * 1.6, c]
    n = len(outline); faces = []
    for k in range(n):
        k2 = (k + 1) % n; faces.append((k, k2, n + k2, n + k)); faces.append((n + k, n + k2, 2 * n))
        faces.append((k2, k, 2 * n + 1))
    o = mesh_obj(name, verts, faces, m)
    for p in o.data.polygons: p.use_smooth = False
    return o

def join(objs, name):
    select_only(*objs); bpy.ops.object.join(); o = bpy.context.object; o.name = name; o.data.name = name; return o

def catenary(p, q, sag, n=12):
    p = Vector(p); q = Vector(q)
    return [p.lerp(q, t) - Vector((0, 0, sag * 4 * t * (1 - t))) for t in np.linspace(0, 1, n)]

# =============================================================================== torso radius field (for fitted pieces)
TH_N = 64
Z_LO, Z_HI, Z_N = .90, 1.44, 55
ZS = [Z_LO + (Z_HI - Z_LO) * j / (Z_N - 1) for j in range(Z_N)]
YC = -.005
def theta_dir(th): return Vector((sin(th), -cos(th), 0))       # th=0 front (-Y), +pi/2 her left (+X)
RF = []
for i in range(TH_N):
    th = 2 * pi * i / TH_N; col = []
    for z in ZS:
        loc, _ = ray_first(BVH_TORSO, (0, YC, z), theta_dir(th), .5)
        col.append((Vector(loc) - Vector((0, YC, z))).length if loc else None)
    # fill gaps, then bridge concavities vertically (fabric spans under the bust / small of the back)
    good = [x for x in col if x]; fill = sum(good) / len(good)
    col = [x if x else fill for x in col]
    k = .55
    col = [max(col[jj] - k * abs(ZS[jj] - ZS[j]) for jj in range(Z_N)) for j in range(Z_N)]
    RF.append(col)
def torso_r(th, z):
    u = (th / (2 * pi)) % 1 * TH_N; i0 = int(u) % TH_N; i1 = (i0 + 1) % TH_N; fu = u - int(u)
    v = (z - Z_LO) / (Z_HI - Z_LO) * (Z_N - 1); v = max(0, min(Z_N - 1.001, v)); j0 = int(v); fv = v - j0
    a = RF[i0][j0] * (1 - fv) + RF[i0][j0 + 1] * fv; b = RF[i1][j0] * (1 - fv) + RF[i1][j0 + 1] * fv
    return a * (1 - fu) + b * fu
def torso_pt(th, z, off): return Vector((0, YC, z)) + theta_dir(th) * (torso_r(th, z) + off)

# =============================================================================== bodice (off-shoulder, ivory)
def bodice_top(th):
    c = cos(th); front = max(0, c)
    return 1.392 - .016 * max(0, 1 - abs(((th + pi) % (2 * pi)) - pi) / .35) + .006 * front - .02 * max(0, -c)
NB_U, NB_V = 64, 12
P = []
for i in range(NB_U):
    th = 2 * pi * i / NB_U; zt = bodice_top(th); zb = 1.09
    P.append([torso_pt(th, zb + (zt - zb) * j / (NB_V - 1), .0045) for j in range(NB_V)])
bodice = grid_obj('CO_Bodice', P, M['bodice'])
# ruched top edge + gold piping
top_edge = [torso_pt(2 * pi * i / 64, bodice_top(2 * pi * i / 64), .007) for i in range(64)]
piping = tube_obj('CO_Bodice_Piping', top_edge + [top_edge[0]], .0028, M['gold'], 5)
# centre-front gold strap from neckline to corset (as in the reference)
bodice = finish(bodice, torso_weights); finish(piping, torso_weights)
checkpoint('bodice')

# =============================================================================== corset waist panel (navy, gold trim, medallion)
def corset_bot(th):
    return .985 - .035 * max(0, 1 - abs(((th + pi) % (2 * pi)) - pi) / .5)
def corset_top(th):
    return 1.215 + .03 * max(0, 1 - abs(((th + pi) % (2 * pi)) - pi) / .45)
P = []
for i in range(NB_U):
    th = 2 * pi * i / NB_U; zb = corset_bot(th); zt = corset_top(th)
    P.append([torso_pt(th, zb + (zt - zb) * j / 10, .011 + .004 * (1 - j / 10)) for j in range(11)])
corset = grid_obj('CO_Corset', P, M['corset'])
corset = finish(corset, torso_weights)
trim = []
for fz, off in ((corset_top, .0155), (corset_bot, .0195)):
    pts = [torso_pt(2 * pi * i / 64, fz(2 * pi * i / 64), off) for i in range(64)]
    trim.append(tube_obj('CO_Corset_Trim', pts + [pts[0]], .0032, M['gold'], 5))
for th in (-.62, -.28, .28, .62, pi - .3, pi + .3):           # vertical boning lines in gold
    pts = [torso_pt(th, corset_bot(th) + (corset_top(th) - corset_bot(th)) * t, .0165) for t in np.linspace(.05, .95, 8)]
    trim.append(tube_obj('CO_Corset_Bone', pts, .0016, M['gold'], 4))
finish(join(trim, 'CO_Corset_GoldTrim'), torso_weights)
# medallion: gold sun with 12 rays, ring and an amethyst cabochon
mz = 1.135; mc = torso_pt(0, mz, .02); mn = Vector((0, -1, 0))
med = [star_obj('m_sun', mc, mn, .052, .024, 12, .006, M['gold']),
       ring_obj('m_ring', mc + mn * .007, mn, .027, .0035, M['gold'], 24, 5),
       star_obj('m_star', mc + mn * .006, mn, .03, .012, 4, .005, M['gold_dark'])]
gem = gem_obj('CO_Medallion_Gem', mc + mn * .016, .014, M['amethyst'], .6, (0, -1, 0), 10)
finish(join(med, 'CO_Medallion'), 'rigid', 'Spine01_Jnt'); finish(gem, 'rigid', 'Spine01_Jnt')
checkpoint('corset')

# =============================================================================== skirt layers
legs_bvh = bvh_of(BODY_W, body.data.polygons, lambda p: all(BODY_DOM[i] not in ARM_BONES for i in p.vertices))
SK_TOP = 1.03; SK_U = 72
SK_Z = [SK_TOP - (SK_TOP - .0) * (j / 15) ** 1.15 for j in range(16)]      # top -> floor
BODY_EXT = []
for i in range(SK_U):
    th = 2 * pi * i / SK_U; col = []
    for z in SK_Z:
        loc = ray_far(legs_bvh, (0, YC, max(z, .02)), theta_dir(th), .6)
        col.append((Vector(loc) - Vector((0, YC, max(z, .02)))).length if loc else 0)
    BODY_EXT.append(col)
# angular max-filter so the cloth spans the legs
BODY_EXT = [[max(BODY_EXT[(i + d) % SK_U][j] for d in range(-4, 5)) for j in range(16)] for i in range(SK_U)]
def body_ext(th, j):
    u = (th / (2 * pi)) % 1 * SK_U; i0 = int(u) % SK_U; f = u - int(u)
    return BODY_EXT[i0][j] * (1 - f) + BODY_EXT[(i0 + 1) % SK_U][j] * f
def skirt_layer(name, m, r_hem, hem_z, clear, wave_amp, wave_n, train=0.0, gap=None, slit=None, phase=0.0, nu=SK_U):
    """Cone of cloth from under the corset to the floor. The columns are laid out between the
    edges of an opening (gap=(centre, half) widening toward the hem, or slit=(centre, half, top_z)),
    so cut edges are clean instead of stair-stepped."""
    cols = []
    for i in range(nu + 1):
        u = i / nu; col = []
        for j, z0 in enumerate(SK_Z):
            t = j / 15
            if gap: c, h = gap[0], gap[1] * (.3 + .7 * t ** .7)
            elif slit: c, h = slit[0], slit[1] * smooth01((slit[2] - z0) / .3)
            else: c, h = 0, 0
            th = c + h + u * (2 * pi - 2 * h)
            back = max(0, -cos(th))
            r0 = torso_r(th, SK_TOP) + .006
            flare = r0 + (r_hem + train * back ** 2 - r0) * t ** 1.35
            r = max(flare, body_ext(th, j) + clear * (.3 + t))
            r *= 1 + wave_amp * smooth01(t * 3) * t ** .8 * sin(wave_n * th + phase + 1.7 * t)
            z = z0
            if j == 15: z = hem_z + (.004 - hem_z) * (back if train else 0)
            col.append(Vector((0, YC, z)) + theta_dir(th) * r)
        cols.append(col)
    return grid_obj(name, cols, m, wrap=False)
KNEE_Z = bone_w('Shin_Jnt_L').z
def skirt_weights(p, i):
    """Hip at the waist -> thighs down to the knee -> shins below it, mostly on the front of the skirt:
    seated clips lay the front over the lap and let it hang from the knees; the back stays on the hip."""
    rel = Vector((p.x, p.y - YC, 0)); front = smooth01((-rel.y / max(rel.length, 1e-4) + .25) / 1.0)
    t_leg = smooth01((SK_TOP - p.z) / (SK_TOP - KNEE_Z))
    s_shin = smooth01((KNEE_Z - p.z) / (KNEE_Z - .15))
    leg = t_leg * (.30 + .60 * front)
    shin = leg * .85 * s_shin * front; thigh = leg - shin
    side = smooth01((p.x + .09) / .18)                        # 0 = her right (-X), 1 = her left
    return {'Hip_Jnt': 1 - leg, 'Thigh_Jnt_L': thigh * side, 'Thigh_Jnt_R': thigh * (1 - side),
            'Shin_Jnt_L': shin * side, 'Shin_Jnt_R': shin * (1 - side)}
SLIT = (-.42, .26, .74)                                        # her right leg, front
under = skirt_layer('CO_Skirt_Under', M['sheer_white'], .30, .07, .02, .05, 11, slit=SLIT)
panels = skirt_layer('CO_Skirt_NavyPanels', M['panel'], .36, .03, .035, .07, 7, train=.06, gap=(.05, 1.0), phase=.6)
outer = skirt_layer('CO_Skirt_Outer', M['sheer_lav'], .46, .015, .05, .09, 9, train=.16, gap=(-.15, .55), phase=1.3)
front_panel = None
# narrow navy panel down the centre front (left of the slit), as in the reference
cols = []
for th in np.linspace(.05, .42, 5):
    col = []
    for j, z in enumerate(SK_Z):
        t = j / 15; r0 = torso_r(th, SK_TOP) + .009
        r = max(r0 + (.33 - r0) * t ** 1.35, body_ext(th, j) + .03 * (.3 + t))
        col.append(Vector((0, YC, max(z, .06))) + theta_dir(th) * r)
    cols.append(col)
front_panel = grid_obj('CO_Skirt_FrontPanel', cols, M['panel'], wrap=False)
for o in (under, panels, outer, front_panel): finish(o, skirt_weights)
checkpoint('skirt layers')

# =============================================================================== belt: chains, tassels, star pendants
belt_parts = []; tassels = []
def tassel(top, length, m=M['tassel']):
    top = Vector(top)
    parts = [tube_obj('t_cord', [top, top - Vector((0, 0, length * .45))], .0018, m, 4),
             ring_obj('t_cap', top - Vector((0, 0, length * .45)), (0, 0, 1), .006, .004, M['gold'], 10, 4)]
    a = top - Vector((0, 0, length * .45)); b = top - Vector((0, 0, length))
    parts.append(tube_obj('t_body', [a, a.lerp(b, .25), b], lambda t: .006 + .009 * t, m, 10, cap=True))
    return parts
for th, L in ((-.30, .26), (.30, .30), (.62, .22), (-.66, .2), (pi - .4, .24), (pi + .4, .24)):
    p = torso_pt(th, corset_bot(th) + .01, .03); tassels += tassel(p, L)
for th0, th1, sag in ((-.9, .05, .07), (.05, .95, .08), (-.6, .5, .16)):
    pts = catenary(torso_pt(th0, corset_bot(th0) + .006, .022), torso_pt(th1, corset_bot(th1) + .006, .022), sag, 14)
    # push the chain out of the skirt top
    pts = [Vector((0, YC, p.z)) + (p - Vector((0, YC, p.z))).normalized() * max((p - Vector((0, YC, p.z))).length, torso_r(atan2_th, min(p.z, Z_HI)) + .03) if False else p for p in pts]
    belt_parts.append(tube_obj('chain', pts, .0022, M['gold'], 4))
    for k in (4, 9):
        belt_parts.append(gem_obj('bead', pts[k], .004, M['amethyst'], 1.0, (0, 0, -1), 6))
# long chains with star / crescent pendants down the front (over the outer skirt)
for th, L in ((.22, .52), (-.12, .44), (.48, .36)):
    p0 = torso_pt(th, corset_bot(th) + .004, .024); pts = []
    for t in np.linspace(0, 1, 10):
        z = p0.z - L * t; r = torso_r(th, min(max(z, Z_LO), Z_HI)) if z > Z_LO else 0
        rr = max((p0 - Vector((0, YC, p0.z))).length + .05 * t, (BODY_EXT[int(th / (2 * pi) * SK_U) % SK_U][min(15, int((SK_TOP - z) / SK_TOP * 15))] + .06) if z < SK_TOP else 0)
        pts.append(Vector((0, YC, z)) + theta_dir(th) * rr)
    belt_parts.append(tube_obj('long_chain', pts, .0016, M['gold'], 4))
    end = pts[-1]
    belt_parts.append(star_obj('pend_star', end - Vector((0, 0, .02)), theta_dir(th), .022, .007, 4, .004, M['gold']))
    belt_parts.append(gem_obj('pend_gem', end - Vector((0, 0, .055)), .007, M['amethyst'], 1.6, (0, 0, -1), 6))
finish(join(belt_parts, 'CO_Belt_Chains'), skirt_weights)
finish(join(tassels, 'CO_Belt_Tassels'), skirt_weights)
checkpoint('belt chains + tassels')


# =============================================================================== long wavy hair (cards)
HEAD_C = bone_w('Head_Jnt') + Vector((0, 0, .05))
HAIR_W = world_verts(hairF) + world_verts(hairB)
HAIR_BVH = BVHTree.FromPolygons(HAIR_W, [tuple(p.vertices) for p in hairF.data.polygons] + [tuple(i + len(hairF.data.vertices) for i in p.vertices) for p in hairB.data.polygons])
def push_out(p, clearance, bvh=COLLIDE):
    loc, nrm, idx, dist = bvh.find_nearest(p)
    if loc is None: return p
    d = p - loc
    if d.dot(nrm) < 0 or d.length < clearance: return loc + nrm * clearance
    return p
def strand(root, out_dir, length, clearance, step=.028):
    pts = [root]; d = (Vector((0, 0, -1)) * .6 + out_dir * .4).normalized(); travelled = 0
    while travelled < length:
        d = (d * .55 + Vector((0, 0, -1)) * .45 + out_dir * .04).normalized()
        p = pts[-1] + d * step
        p = push_out(p, clearance)
        if p.z > 1.45: p = push_out(p, clearance * .6 + .004, HAIR_BVH)
        d = (p - pts[-1]).normalized(); pts.append(p); travelled += step
    for _ in range(4):                                        # relax kinks from collision pushes
        pts = [pts[0]] + [(pts[i - 1] + pts[i] * 2 + pts[i + 1]) / 4 for i in range(1, len(pts) - 1)] + [pts[-1]]
        pts = [pts[0]] + [push_out(p, clearance) for p in pts[1:]]
    return pts
def card(pts, out_dir, width, amp, wl, phase, twist=0.0):
    n = len(pts); verts = []; uvs = []; faces = []; L = 0; acc = [0]
    for i in range(1, n): L += (pts[i] - pts[i - 1]).length; acc.append(L)
    for i, p in enumerate(pts):
        t = acc[i] / L; tg = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        side = tg.cross(out_dir).normalized(); nrm = side.cross(tg).normalized()
        wv = amp * smooth01(t * 2.5) * sin(2 * pi * acc[i] / wl + phase)
        c = p + side * wv + nrm * .006 * sin(2 * pi * acc[i] / wl + phase + 1.3)
        w = width * (1 - .45 * t ** 1.5)
        rot = side * cos(twist * t) + nrm * sin(twist * t)
        verts += [c - rot * w / 2, c + rot * w / 2]; uvs += [(0, 1 - t), (1, 1 - t)]
    for i in range(n - 1): faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    return verts, faces, uvs
hair_v, hair_f, hair_uv, hair_t = [], [], [], []
rng = random.Random(21)
def add_card(pts, out_dir, width, amp, wl, phase, twist=0.0):
    v, f, uv = card(pts, out_dir, width, amp, wl, phase, twist); o = len(hair_v)
    hair_v.extend(v); hair_uv.extend(uv); hair_f.extend(tuple(i + o for i in q) for q in f)
for layer, (clear, zr, count) in enumerate(((.008, 1.66, 34), (.020, 1.70, 32), (.032, 1.72, 26), (.044, 1.69, 18))):
    for k in range(count):
        th = pi / 2 + .28 + (pi - .56) * (k + rng.random() * .6) / count     # behind the ears, across the back
        direc = Vector((sin(th), -cos(th), 0))
        loc, _ = ray_first(HAIR_BVH, HEAD_C + Vector((0, 0, zr - HEAD_C.z)), direc + Vector((0, 0, -.15)), .3)
        root = (loc - direc * .012) if loc else HEAD_C + direc * .08
        length = .66 + .1 * rng.random() - .08 * abs(cos(th)) - layer * .03
        pts = strand(root, direc, length, clear)
        add_card(pts, direc, .075 + .025 * rng.random(), .012 + .005 * rng.random(), .16 + .04 * rng.random(), rng.random() * 6.28)
# front locks falling over the shoulders and chest (both sides)
for sg in (1, -1):
    for k in range(6):
        th = sg * (1.50 + .30 * k / 5); direc = Vector((sin(th), -cos(th), 0))
        loc, _ = ray_first(HAIR_BVH, Vector((0, .04, 1.64)), direc + Vector((0, 0, -.2)), .3)
        root = (loc - direc * .012) if loc else HEAD_C + direc * .08
        out = (direc + Vector((0, -.35, 0))).normalized()
        pts = strand(root, out, .50 + .08 * rng.random(), .016 + .008 * (k % 2))
        add_card(pts, out, .055, .02, .16, rng.random() * 6.28, .2)
long_hair = mesh_obj('CO_Hair_Long', hair_v, hair_f, M['hair_cards'], hair_uv)
def hair_weights(p, i):
    z = p.z
    if z > 1.60: return {'Head_Jnt': 1}
    if z > 1.50: t = (1.60 - z) / .10; return {'Head_Jnt': 1 - t * .6, 'Neck00_Jnt': t * .6}
    if z > 1.36: t = (1.50 - z) / .14; return {'Head_Jnt': .4 * (1 - t), 'Neck00_Jnt': .6 * (1 - t) + .2 * t, 'Chest_Jnt': .8 * t}
    if z > 1.15: t = (1.36 - z) / .21; return {'Chest_Jnt': 1 - .5 * t, 'Spine01_Jnt': .5 * t}
    return {'Chest_Jnt': .5, 'Spine01_Jnt': .5}
finish(long_hair, hair_weights)
for o in (hairF, hairB): CHAR_PARTS.append(o)
checkpoint('long hair')

# =============================================================================== hair ornament: gold crescent moon + white flower
orn = []
def crescent(center, normal, up, R, thick, depth, m):
    c = Vector(center); nz = Vector(normal).normalized(); a = (Vector(up) - nz * Vector(up).dot(nz)).normalized(); b = a.cross(nz)
    outline = []
    for k in range(17):                                     # outer arc
        t = -pi * .85 + 1.7 * pi * k / 16; outline.append(c + R * (a * cos(t) + b * sin(t)))
    for k in range(16, -1, -1):                             # inner arc, shifted toward the opening
        t = -pi * .85 + 1.7 * pi * k / 16; outline.append(c + a * R * .38 + R * .72 * (a * cos(t) + b * sin(t)))
    n = len(outline); verts = outline + [p + nz * depth for p in outline]; faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for k in range(n): faces.append((k, (k + 1) % n, n + (k + 1) % n, n + k))
    o = mesh_obj('crescent', verts, faces, m)
    for p in o.data.polygons: p.use_smooth = False
    return o
dirc = Vector((sin(1.05), -cos(1.05), .75)).normalized()
loc, nrm = ray_first(HAIR_BVH, HEAD_C, dirc, .3)
orn.append(crescent(loc + nrm * .010, nrm, (0, 0, 1), .046, .02, .006, M['gold']))
orn.append(star_obj('orn_star', loc + nrm * .018 + Vector((0, 0, .022)), nrm, .014, .004, 4, .003, M['gold']))
orn_gems = [gem_obj('orn_drop', loc + nrm * .006 + Vector((.0, -.004, -.03)), .006, M['amethyst'], 1.8, (0, 0, -1), 6)]
fl_dir = Vector((sin(1.35), -cos(1.35), .35)).normalized()
floc, fn = ray_first(HAIR_BVH, HEAD_C, fl_dir, .3)
fc = floc + fn * .014
a_ = (Vector((0, 0, 1)) - fn * fn.z).normalized(); b_ = a_.cross(fn)
petals = []
for k in range(6):
    t = 2 * pi * k / 6; d = a_ * cos(t) + b_ * sin(t); side = fn.cross(d)
    tip = fc + d * .036 + fn * .004; mid = fc + d * .019 + fn * .008
    petals.append(mesh_obj('petal', [fc, mid + side * .011, tip, mid - side * .011, mid + fn * .002], [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], M['petal']))
petals.append(gem_obj('flower_core', fc + fn * .008, .005, M['gold'], .6, tuple(fn), 6))
orn.append(join(petals, 'flower'))
finish(join(orn, 'CO_Hair_Ornament'), 'rigid', 'Head_Jnt'); finish(join(orn_gems, 'CO_Hair_Ornament_Gem'), 'rigid', 'Head_Jnt')
checkpoint('hair ornament')

# =============================================================================== sheer sleeves (off-shoulder band, bell sleeve hanging long)
sleeves = []; bands = []; arm_gold = []
for s_, sg in (('L', 1), ('R', -1)):
    A, E, H = bone_w(f'Arm_Jnt_{s_}'), bone_w(f'Elbow_Jnt_{s_}'), bone_w(f'Hand_Jnt_{s_}')
    start = A.lerp(E, .30)
    # ends a third of the way down the forearm: every seated clip of Yunjung's that brings a hand to the
    # face (talking, chin-on-hand travel poses, laugh) carried a full-length sleeve up over the mouth
    path = [start.lerp(E, t) for t in np.linspace(0, 1, 6)] + [E.lerp(H, t) for t in np.linspace(.1, .34, 4)]
    n = len(path); SIDES = 20; verts = []; uvs = []; ring_t = []; ring_h = []
    seglen = [0]
    for i in range(1, n): seglen.append(seglen[-1] + (path[i] - path[i - 1]).length)
    for i, c in enumerate(path):
        t = seglen[i] / seglen[-1]; tg = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        down = (Vector((0, 0, -1)) - tg * tg.z * -1).normalized(); a = down; b = tg.cross(a).normalized()
        # bell sleeve: kept fairly narrow with a moderate drape, so the talking/gesture clips (forearm raised
        # to the face) cannot swing a long panel up over her head (was .09 flare / .50 drape)
        r = .054 + .03 * t + .05 * t ** 2
        for k in range(SIDES + 1):
            th = 2 * pi * k / SIDES; d = a * cos(th) + b * sin(th)
            p = c + d * r
            hang = max(0, cos(th)) ** 1.6                    # 1 at the underside
            p = p + Vector((0, 0, -1)) * (.13 * t ** 1.4) * hang + Vector((sg * .008, 0, 0)) * hang * t
            p.z += .010 * sin(7 * th) * t
            verts.append(p); uvs.append((k / SIDES, 1 - t)); ring_t.append(t); ring_h.append(hang * t ** 1.4)
    faces = []
    for i in range(n - 1):
        for k in range(SIDES):
            faces.append((i * (SIDES + 1) + k, i * (SIDES + 1) + k + 1, (i + 1) * (SIDES + 1) + k + 1, (i + 1) * (SIDES + 1) + k))
    sl = mesh_obj(f'CO_Sleeve_{s_}', verts, faces, M['sheer_lav'], uvs)
    tE = (E - start).length / seglen[-1]
    def w_sleeve(p, i, s_=s_, tE=tE, rt=ring_t, rh=ring_h):
        t = rt[i]; arm, elb = f'Arm_Jnt_{s_}', f'Elbow_Jnt_{s_}'
        # The part past the elbow is split between upper arm and forearm (never more than 55 % forearm),
        # so a raised forearm folds the flare at the elbow instead of carrying it up to the face.
        x = smooth01((t - tE + .12) / .30) * .55
        w = {arm: 1 - x, elb: x}
        h = smooth01(rh[i] / .5) * .25                       # the hanging underside lags further still
        if h > 0 and t > tE:
            w = {k: v * (1 - h) for k, v in w.items()}; w[arm] = w.get(arm, 0) + h
        return w
    finish(sl, w_sleeve)
    ax = (E - A).normalized()
    bands.append(ring_obj('band', start, ax, .054, .009, M['bodice'], 18, 6))
    arm_gold.append(ring_obj('armlet', A.lerp(E, .42), ax, .047, .0045, M['gold'], 20, 5))
    arm_gold.append(ring_obj('armlet2', A.lerp(E, .46), ax, .045, .003, M['gold'], 20, 4))
    arm_gold.append(gem_obj('armlet_gem', A.lerp(E, .44) + Vector((0, -.05, 0)), .006, M['amethyst'], .7, (0, -1, 0), 6))
    c_, r_, axf = arm_rings[s_]
    cuff = tube_obj('cuff', [c_ - axf * .018, c_ + axf * .018], lambda t: r_ + .007, M['gold'], 16)
    arm_gold.append(cuff)
    arm_gold.append(ring_obj('cuff_lip', c_ - axf * .018, axf, r_ + .007, .0025, M['gold'], 16, 4))
    arm_gold.append(ring_obj('cuff_lip', c_ + axf * .018, axf, r_ + .007, .0025, M['gold'], 16, 4))
    arm_gold.append(ring_obj('bracelet', H - axf * .012, axf, r_ * .95, .0025, M['gold'], 16, 4))
finish(join(bands, 'CO_Sleeve_Bands'), 'transfer')
finish(join(arm_gold, 'CO_Arm_Gold'), 'transfer')
checkpoint('sleeves + arm jewellery')

# =============================================================================== neck jewellery + earrings
neck_pts = {}
for zz in (1.523, 1.537):
    ring = []
    for k in range(24):
        th = 2 * pi * k / 24; o_ = Vector((0, .02, zz))
        loc, _ = ray_first(FACE_BVH, o_, theta_dir(th), .2)
        ring.append((loc if loc else o_ + theta_dir(th) * .05) + theta_dir(th) * .0035)
    neck_pts[zz] = ring
choker = grid_obj('choker', [[neck_pts[1.523][k], neck_pts[1.537][k]] for k in range(24)], M['gold'])
jew = [choker]
for zz in neck_pts: jew.append(tube_obj('choker_lip', neck_pts[zz] + [neck_pts[zz][0]], .0018, M['gold'], 4))
front = neck_pts[1.523][0]
jew.append(gem_obj('choker_gem', front + Vector((0, -.004, -.004)), .006, M['amethyst'], 1.4, (0, -.3, -1), 6))
# pendant necklace lying on the chest
def on_skin(p, off=.004): return push_out(Vector(p), off)
L_ = [on_skin(neck_pts[1.523][k] + Vector((0, 0, -.004))) for k in (3, 2, 1)]
chain = [L_[0], L_[1], L_[2]] + [on_skin(Vector((.03 * (1 - t), -.08, 1.50 - .045 * t))) for t in (.25, .6, 1)]
chain_r = [on_skin(Vector((-p.x, p.y, p.z))) for p in reversed(chain[:-1])]
jew.append(tube_obj('pendant_chain', chain + chain_r, .0014, M['gold'], 4))
pc = chain[-1] + Vector((0, -.006, -.018))
jew.append(crescent(pc, (0, -1, 0), (0, 0, 1), .014, .008, .003, M['gold']))
jew.append(gem_obj('CO_Pendant_Gem', pc + Vector((0, -.006, -.012)), .007, M['amethyst'], 1.7, (0, 0, -1), 8))
ring = sorted(neck_ring, key=lambda p: math.atan2(p.x - neck_c.x, -(p.y - neck_c.y)))
ring = [ring[int(i * len(ring) / 32)] for i in range(32)]
def collar_pt(p, dz):
    q = Vector((p.x, p.y, p.z + dz)); return push_out(q, .0032)
jew.insert(0, grid_obj('collar', [[collar_pt(p, -.007), collar_pt(p, .007)] for p in ring], M['gold']))
for dz in (-.007, .007):
    pts = [collar_pt(p, dz) for p in ring]; jew.insert(0, tube_obj('collar_lip', pts + [pts[0]], .0015, M['gold'], 4))
finish(join(jew[:-1], 'CO_Necklace_Choker'), 'transfer'); finish(jew[-1], 'transfer')
# earrings: hoop + amethyst drop + small tassel at each lobe
FW_ = world_verts(face)
ear_parts = []
for sg in (1, -1):
    cand = [p for p in FW_ if sg * p.x > .066 and 1.58 < p.z < 1.68]
    lobe = min(cand, key=lambda p: p.z) if cand else Vector((sg * .075, .03, 1.62))
    top = lobe + Vector((sg * .002, 0, -.004))
    ear_parts.append(ring_obj('hoop', top + Vector((0, 0, -.013)), (1, 0, 0), .013, .0016, M['gold'], 16, 4))
    ear_parts.append(gem_obj('ear_gem', top + Vector((0, 0, -.031)), .005, M['amethyst'], 1.8, (0, 0, -1), 6))
    ear_parts += tassel(top + Vector((0, 0, -.042)), .03)
finish(join(ear_parts, 'CO_Earrings'), 'rigid', 'Head_Jnt')
checkpoint('necklace + earrings')

# =============================================================================== sandals: Yunjung's heels re-materialled gold + ankle bands
body.data.materials.append(M['gold']); gold_idx = len(body.data.materials) - 1
skin_slot = [i for i, m_ in enumerate(body.data.materials) if m_.name == 'CO_Skin_Yunjung'][0]
small = y_img.copy(); small.scale(256, 256); px = np.array(small.pixels[:]).reshape(256, 256, 4); bpy.data.images.remove(small)
uvl = body.data.uv_layers.active.data; n_shoe = 0
for poly in body.data.polygons:
    if poly.material_index != skin_slot: continue
    if (body.matrix_world @ poly.center).z > .24: continue
    u, v = [sum(x) / len(poly.loop_indices) for x in zip(*[uvl[li].uv for li in poly.loop_indices])]
    r, g_, b, _ = px[int(v % 1 * 255), int(u % 1 * 255)]
    if r - b < .12: poly.material_index = gold_idx; n_shoe += 1
print('SANDAL faces', n_shoe)
ank = []
for s_ in 'LR':
    F = bone_w(f'Foot_Jnt_{s_}'); zc = F.z + .012
    pts = []
    for k in range(16):
        th = 2 * pi * k / 16; o_ = Vector((F.x, F.y, zc)); loc, _ = ray_first(BVH_ALL, o_, theta_dir(th), .15)
        pts.append((loc if loc else o_ + theta_dir(th) * .03) + theta_dir(th) * .004)
    ank.append(tube_obj('anklet', pts + [pts[0]], .0028, M['gold'], 5))
    ank.append(crescent(pts[0] + Vector((0, -.003, -.012)), (0, -1, 0), (0, 0, 1), .008, .005, .002, M['gold']))
    ank.append(star_obj('ank_star', pts[0] + Vector((0, -.004, -.024)), (0, -1, 0), .007, .0025, 4, .002, M['gold']))
finish(join(ank, 'CO_Anklets'), 'transfer')
checkpoint('sandals + anklets')

# =============================================================================== prop: armillary-sphere lantern in the right hand
HR = bone_w('Hand_Jnt_R'); HE = bone_w('Handend_Jnt_R')
grip = HE + (HE - HR).normalized() * .03
lc = grip + Vector((0, 0, -.16))
lp = [ring_obj('ring_a', lc, (0, 0, 1), .058, .0028, M['gold'], 28, 5), ring_obj('ring_b', lc, (1, 0, 0), .058, .0028, M['gold'], 28, 5),
      ring_obj('ring_c', lc, (0, 1, 0), .058, .0028, M['gold'], 28, 5), ring_obj('ring_d', lc, (1, 0, 1), .05, .0022, M['gold'], 24, 4),
      ring_obj('ring_e', lc, (-1, 0, 1), .05, .0022, M['gold'], 24, 4),
      tube_obj('axis', [lc + Vector((0, 0, .075)), lc - Vector((0, 0, .075))], .003, M['gold'], 6),
      gem_obj('finial_b', lc - Vector((0, 0, .08)), .008, M['gold'], 2.2, (0, 0, -1), 6),
      ring_obj('loop', lc + Vector((0, 0, .085)), (1, 0, 0), .009, .002, M['gold'], 12, 4),
      tube_obj('chain', [grip, lc + Vector((0, 0, .094))], .0018, M['gold'], 4),
      crescent(lc - Vector((0, 0, .1)), (0, -1, 0), (0, 0, 1), .014, .008, .003, M['gold'])]
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.024, location=lc); core = bpy.context.object; core.data.materials.append(M['core'])
lantern = join(lp, 'CO_Lantern_Prop'); lantern_core = core; lantern_core.name = 'CO_Lantern_Core'
for o in (lantern, lantern_core):
    for p in o.data.polygons: p.use_smooth = True
    mw_ = o.matrix_world.copy(); pb = rig.pose.bones['Hand_Jnt_R']
    o.parent = rig; o.parent_type = 'BONE'; o.parent_bone = 'Hand_Jnt_R'
    o.matrix_parent_inverse = (rig.matrix_world @ pb.matrix @ Matrix.Translation((0, pb.bone.length, 0))).inverted()
    o.matrix_basis = mw_
PROPS = [lantern, lantern_core]
checkpoint('lantern prop')

if STAGE in ('outfit1', 'outfit2'):
    cam = setup_render()
    shoot(cam, 'debug_outfit_front.png', (0, -4.6, 1.0), (0, 0, .9), 50, 700, 930)
    shoot(cam, 'debug_outfit_34.png', (3.2, -3.2, 1.1), (0, 0, .9), 50, 700, 930)
    raise SystemExit

# =============================================================================== finalize, previews, export
for o in list(scene.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o, do_unlink=True)
CHAR_MESHES = [o for o in rig.children if o.type == 'MESH' and o not in PROPS]
def tris(o):
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); m = ev.to_mesh(); m.calc_loop_triangles(); n = len(m.loop_triangles); ev.to_mesh_clear(); return n
TRI = {o.name: tris(o) for o in CHAR_MESHES}; TRI_PROP = sum(tris(o) for o in PROPS)
print('TRIS', sum(TRI.values()), 'prop', TRI_PROP, json.dumps(TRI))
# all character meshes: exactly <= 4 influences, every group is a rig bone
bad = [(o.name, vg.name) for o in CHAR_MESHES for vg in o.vertex_groups if vg.name not in rig.data.bones]
print('NON_BONE_GROUPS', bad[:10])
for o in CHAR_MESHES:
    select_only(o); bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
checkpoint('weights normalised')

# collect every texture used by the character into textures/
def collect_textures():
    for img in bpy.data.images:
        if img.source != 'FILE' or not img.users: continue
        src = Path(bpy.path.abspath(img.filepath))
        if not src.exists(): continue
        dst = TEXOUT / src.name
        if src.resolve() != dst.resolve(): shutil.copy2(src, dst)
        img.filepath = str(dst)
for o in list(scene.objects):                                # FBX metadata empties are not needed
    pass
bpy.data.orphans_purge(do_recursive=True)
collect_textures()
missing = [i.name for i in bpy.data.images if i.source == 'FILE' and i.users and not Path(bpy.path.abspath(i.filepath)).exists()]
print('MISSING_IMAGES', missing)
cam = setup_render()
checkpoint('lighting')
def rot_world(name, axis, deg):
    pb = rig.pose.bones[name]; bpy.context.view_layer.update()
    ax = (RWI.to_3x3() @ Vector(axis)).normalized(); h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, ax) @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()
def reset_pose():
    for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
if not FAST:
    try: scene.eevee.taa_render_samples = 128
    except Exception: pass
shoot(cam, 'front_full.png', (0, -4.7, 1.0), (0, 0, .92), 50, 1024, 1365)
shoot(cam, 'three_quarter.png', (3.25, -3.35, 1.15), (0, 0, .92), 50, 1024, 1365)
shoot(cam, 'back.png', (0, 4.7, 1.0), (0, 0, .92), 50, 1024, 1365)
shoot(cam, 'face_closeup.png', (.32, -1.05, 1.66), (0, 0, 1.6), 85, 1024, 1024)
# weight test pose: step forward, reach out with the left hand (like the reference), lantern hand raised, head turn
rot_world('Spine01_Jnt', (0, 0, 1), 10)
rot_world('Head_Jnt', (0, 0, 1), -15); rot_world('Head_Jnt', (0, 1, 0), 6)
rot_world('Arm_Jnt_L', (1, 0, 0), 55); rot_world('Arm_Jnt_L', (0, 1, 0), -15); rot_world('Elbow_Jnt_L', (1, 0, 0), 15)
rot_world('Arm_Jnt_R', (0, 1, 0), 25); rot_world('Elbow_Jnt_R', (1, 0, 0), 50)
rot_world('Thigh_Jnt_R', (1, 0, 0), 32); rot_world('Shin_Jnt_R', (1, 0, 0), -38)
rot_world('Thigh_Jnt_L', (1, 0, 0), -10)
shoot(cam, 'pose_test_front.png', (0, -4.7, 1.0), (0, 0, .92), 50, 1024, 1365)
shoot(cam, 'pose_test_34.png', (-3.3, -3.3, 1.15), (0, 0, .92), 50, 1024, 1365)
reset_pose()
shoot(cam, 'a_pose_side.png', (4.7, 0, 1.0), (0, 0, .92), 50, 1024, 1365)

# save the .blend (stage lights/camera/floor are kept in the file for previews; FBX excludes them)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'luna.blend'))
checkpoint('final')
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in CHAR_MESHES + PROPS: o.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.fbx(filepath=str(OUT / 'luna.fbx'), use_selection=True, object_types={'ARMATURE', 'MESH'},
                         axis_forward='-Z', axis_up='Y', global_scale=1.0, apply_unit_scale=True, apply_scale_options='FBX_SCALE_NONE',
                         use_mesh_modifiers=True, mesh_smooth_type='FACE', add_leaf_bones=False, primary_bone_axis='Y', secondary_bone_axis='X',
                         armature_nodetype='NULL', bake_anim=False, path_mode='COPY', embed_textures=False, use_custom_props=False)
report = {'triangles_character': sum(TRI.values()), 'triangles_prop': TRI_PROP, 'per_object': TRI, 'bones': len(rig.data.bones),
          'materials': sorted({m.name for o in CHAR_MESHES + PROPS for m in o.data.materials if m}),
          'textures': sorted(p.name for p in TEXOUT.iterdir())}
(OUT / 'build_report.json').write_text(json.dumps(report, indent=2))
print('REPORT', json.dumps(report))
for f in OUT.glob('*.blend1'): f.unlink()
