"""Build the modern Meditation Master (crop top, open jacket, joggers, bun) in Blender.

Face, eyes, mouth and the bun hairstyle are the project's f_char_002 authored
meshes; the full body with bare feet is the f_char_001 base body. The head and
its facial bone hierarchy are transplanted onto the f_char_001 humanoid rig and
the neck is bridged into one mesh. All garments, the scrunchie, the necklace and
the lotus logo are constructed here. Run with Blender 5.1 in background mode.

    MM_PREVIEW=1  fast Workbench preview renders instead of Cycles
"""
import bpy, bmesh, math, os, json, statistics
from pathlib import Path
from mathutils import Vector, Matrix
from math import sin, cos, pi

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/meditation-master-modern'
CHARS = Path('/Users/namaste/git/saju_fullstack/saju_world_unity/Assets/Art/1.character')
BODY_SRC = CHARS / 'f_char_001'
HEAD_SRC = CHARS / 'f_char_002'
PREVIEW = os.environ.get('MM_PREVIEW') == '1'
(OUT / 'previews').mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.fps = 30

def collection(name):
    c = bpy.data.collections.new(name); scene.collection.children.link(c); return c
RIG = collection('00 • Humanoid rig')
CHAR = collection('01 • Meditation master (modern)')
STAGE = collection('02 • Presentation stage')
REF = collection('03 • Reference sheet (viewport only)')

def link(o, col):
    for c in list(o.users_collection): c.objects.unlink(o)
    col.objects.link(o); return o

# ----------------------------------------------------------------------------- materials
def material(name, col, metal=0, rough=.5, sheen=0):
    m = bpy.data.materials.new(name); m.use_nodes = True; m.diffuse_color = (*col, 1)
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*col, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Sheen Weight'].default_value = sheen
    return m
def fabric(name, col, scale=180, strength=.18, rough=.78):
    m = material(name, col, 0, rough, .35)
    n = m.node_tree.nodes; p = n['Principled BSDF']; l = m.node_tree.links
    tex = n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = scale; tex.inputs['Detail'].default_value = 6; tex.inputs['Roughness'].default_value = .7
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = strength; bump.inputs['Distance'].default_value = .002
    l.new(tex.outputs['Fac'], bump.inputs['Height']); l.new(bump.outputs['Normal'], p.inputs['Normal'])
    # subtle woven colour variation
    mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['Factor'].default_value = .08
    mix.inputs[6].default_value = (*col, 1); mix.inputs[7].default_value = (col[0]*.85, col[1]*.85, col[2]*.85, 1)
    l.new(tex.outputs['Fac'], mix.inputs['Factor']); l.new(mix.outputs[2], p.inputs['Base Color'])
    return m
# palette from the sheet: ivory / cream / oat
top_mat = fabric('Ivory rib crop top', (.96, .93, .89), 260, .25, .75)
jacket_mat = fabric('Cream fleece jacket', (.91, .86, .80), 140, .30, .85)
pants_mat = fabric('Oat cotton joggers', (.90, .85, .78), 170, .22, .82)
scrunchie_mat = fabric('Cream satin scrunchie', (.92, .87, .81), 220, .3, .55)
cord_mat = material('Cotton drawstring', (.86, .80, .72), 0, .8)
gold = material('Warm gold', (.85, .62, .32), 1.0, .28)

# ----------------------------------------------------------------------------- helpers
def new_mesh_object(name, verts, faces, mat, col=CHAR, smooth=True):
    d = bpy.data.meshes.new(name); d.from_pydata(verts, [], faces); d.update()
    o = bpy.data.objects.new(name, d); col.objects.link(o)
    if mat: d.materials.append(mat)
    if smooth:
        for p in d.polygons: p.use_smooth = True
    return o
def orient_outward(o, center):
    """Make face normals point away from an axis/centre so projection and solidify behave."""
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    votes = 0
    for f in bm.faces:
        c = f.calc_center_median(); d = c - Vector(center(c)); votes += 1 if f.normal.dot(d) > 0 else -1
    if votes < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free(); o.data.update()
def grid(name, func, nu, nv, mat, wrap_u=True, col=CHAR):
    """func(u, v) -> (x, y, z); u wraps around when wrap_u."""
    cols = nu if wrap_u else nu + 1
    vs = [func(i / nu, j / nv) for i in range(cols) for j in range(nv + 1)]
    fs = []
    for i in range(nu if wrap_u else nu):
        i2 = (i + 1) % cols if wrap_u else i + 1
        for j in range(nv):
            fs.append((i * (nv + 1) + j, i2 * (nv + 1) + j, i2 * (nv + 1) + j + 1, i * (nv + 1) + j + 1))
    o = new_mesh_object(name, vs, fs, mat, col)
    cz = [Vector(func(i / 8, .5)) for i in range(8)]; axis = sum(cz, Vector()) / 8
    orient_outward(o, lambda c: (axis.x, axis.y, c.z))
    # UVs (u, v) so decals and fabric maps are stable
    uv = o.data.uv_layers.new(name='UVMap')
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            vi = o.data.loops[li].vertex_index
            uv.data[li].uv = ((vi // (nv + 1)) / nu, (vi % (nv + 1)) / nv)
    return o
def catmull(pts):
    pts = [Vector(p) for p in pts]
    def path(t):
        f = t * (len(pts) - 1); i = min(int(f), len(pts) - 2); q = f - i
        p0 = pts[max(i - 1, 0)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(i + 2, len(pts) - 1)]
        return .5 * ((2 * p1) + (-p0 + p2) * q + (2 * p0 - 5 * p1 + 4 * p2 - p3) * q * q + (-p0 + 3 * p1 - 3 * p2 + p3) * q * q * q)
    return path
def tube(name, control, radius_fn, mat, sides=24, samples=40, caps=True, wobble=0):
    """Closed tube along a smoothed control polyline; radius_fn(t, angle)."""
    path = catmull(control)
    vs = []; fs = []
    for i in range(samples + 1):
        t = i / samples; p = path(t)
        tg = (path(min(t + .01, 1)) - path(max(t - .01, 0))).normalized()
        a = tg.cross(Vector((0, 1, 0)))
        if a.length < .05: a = tg.cross(Vector((1, 0, 0)))
        a.normalize(); b = tg.cross(a).normalized()
        for j in range(sides):
            ang = j * 2 * pi / sides
            vs.append(p + radius_fn(t, ang) * (a * cos(ang) + b * sin(ang)))
    for i in range(samples):
        for j in range(sides):
            fs.append((i * sides + j, i * sides + (j + 1) % sides, (i + 1) * sides + (j + 1) % sides, (i + 1) * sides + j))
    if caps:
        fs.append(tuple(reversed(range(sides)))); fs.append(tuple(samples * sides + j for j in range(sides)))
    o = new_mesh_object(name, vs, fs, mat)
    def nearest_on_path(c):
        best = min((path(k / 20) for k in range(21)), key=lambda q: (q - c).length); return best
    orient_outward(o, nearest_on_path); return o
def curve(name, pts, radius, mat, cyclic=False, col=CHAR, resolution=12):
    d = bpy.data.curves.new(name, 'CURVE'); d.dimensions = '3D'; d.resolution_u = resolution; d.bevel_depth = radius; d.bevel_resolution = 3; d.use_fill_caps = True
    s = d.splines.new('BEZIER'); s.bezier_points.add(len(pts) - 1)
    for b, p in zip(s.bezier_points, pts): b.co = p; b.handle_left_type = 'AUTO'; b.handle_right_type = 'AUTO'
    s.use_cyclic_u = cyclic
    o = bpy.data.objects.new(name, d); col.objects.link(o); d.materials.append(mat); return o
def torus(name, center, normal, major, minor, mat, col=CHAR, segs=48, rings=16):
    bpy.ops.mesh.primitive_torus_add(major_segments=segs, minor_segments=rings, major_radius=major, minor_radius=minor, location=center)
    o = bpy.context.object; o.name = name; link(o, col); o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    o.rotation_euler = Vector(normal).to_track_quat('Z', 'Y').to_euler()
    return o
def select_only(*objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
def apply_modifiers(o):
    select_only(o)
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
def add_subsurf(o, levels=1, render=2):
    m = o.modifiers.new('Smooth', 'SUBSURF'); m.levels = levels; m.render_levels = render; return m
def add_crumple(o, strength, size, name='Fabric crumple', kind='CLOUDS'):
    t = bpy.data.textures.new(name, kind); t.noise_scale = size
    if kind == 'CLOUDS': t.noise_depth = 2
    if kind == 'STUCCI': t.turbulence = 8; t.stucci_type = 'WALL_IN'
    m = o.modifiers.new(name, 'DISPLACE'); m.texture = t; m.strength = strength; m.mid_level = .5; m.texture_coords = 'GLOBAL'; return m
def repair_images(folders):
    """FBX materials point at texture paths that do not exist here; find files by name."""
    for img in bpy.data.images:
        if img.source != 'FILE': continue
        if Path(bpy.path.abspath(img.filepath)).exists(): continue
        base = Path(img.filepath).name
        for f in folders:
            hit = next(iter(f.rglob(base)), None)
            if hit: img.filepath = str(hit); img.reload(); break

# ----------------------------------------------------------------------------- body: f_char_001
bpy.ops.import_scene.fbx(filepath=str(BODY_SRC / '0.model/girl_base_v03.fbx'))
imported = list(scene.objects)
rig = next(o for o in imported if o.type == 'ARMATURE'); rig.animation_data_clear()
for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
K = 1.65 / 0.27          # native file height -> 1.65 m
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for o in imported: o.matrix_world = Matrix.Scale(K, 4) @ o.matrix_world
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for name in ['Head_Geo', 'eyes_Geo', 'eyelash_Geo', 'eyebrow_Geo', 'Hair_Geo']:
    bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
body = bpy.data.objects['body_Geo']; body.name = 'Body • bare skin, feet and hands'
link(rig, RIG); rig.name = 'MeditationMaster_Rig'; link(body, CHAR)
skin_body = body.data.materials[0]; skin_body.name = 'Skin • body (f_char_001 texture)'
for n in skin_body.node_tree.nodes:
    if n.type == 'TEX_IMAGE':
        n.image = bpy.data.images.load(str(BODY_SRC / '1.textures/girl_body_BaseColor.png'), check_existing=True)
for m in bpy.data.materials:
    if m.name.startswith('Hair_mtl'): bpy.data.materials.remove(m)
def bone_head(n): return rig.data.bones[n].head_local.copy()
def bone_tail(n): return rig.data.bones[n].tail_local.copy()
BODY_VERTS = [v.co.copy() for v in body.data.vertices]
def torso_ring(z, tol=.01, xmax=.16):
    r = [v for v in BODY_VERTS if abs(v.z - z) < tol and abs(v.x) < xmax and abs(v.y) < .2]
    return (max(abs(v.x) for v in r), min(v.y for v in r), max(v.y for v in r)) if r else None

# ----------------------------------------------------------------------------- head: f_char_002
before = set(scene.objects)
bpy.ops.import_scene.fbx(filepath=str(HEAD_SRC / 'Female_char02_Outfit01_Avatar.fbx'))
src_objs = set(scene.objects) - before
rig2 = next(o for o in src_objs if o.type == 'ARMATURE'); rig2.animation_data_clear()
# the file's initial pose is its bind pose; keep it and bake it into the meshes
bpy.context.view_layer.update()
repair_images([HEAD_SRC / 'Textures'])
S = 8.8                                                    # head scale: stylised, slightly large head
H2 = rig2.matrix_world @ rig2.pose.bones['Head_Jnt'].head
H1 = bone_head('Head_Jnt')
def T(p): return H1 + S * (Vector(p) - H2)                 # f_char_002 world -> master space

def transplant(name, src_name, keep):
    src = bpy.data.objects[src_name]
    o = src.copy(); o.data = src.data.copy(); o.name = name; CHAR.objects.link(o)
    mw = src.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    select_only(o)
    for m in list(o.modifiers):
        if m.type == 'ARMATURE': bpy.ops.object.modifier_apply(modifier=m.name)
        else: o.modifiers.remove(m)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co)], context='VERTS')
    for v in bm.verts: v.co = T(v.co)
    bm.to_mesh(o.data); bm.free(); o.data.update()
    for p in o.data.polygons: p.use_smooth = True
    return o
head = transplant('Head • f_char_002 face and neck', 'BodyDrop_Mesh', lambda p: p.z > .195)
eyes = transplant('Eyes', 'Eye_Mesh', lambda p: True)
mouth = transplant('Mouth interior', 'MOUTH_Mesh', lambda p: True)
lashes = transplant('Eyelashes', 'Fixed_eyeslash_mat_Mesh', lambda p: True)
hair = transplant('Hair • messy top bun with wisps', 'hair_low_Mesh', lambda p: True)
for o in (head, eyes, mouth, lashes, hair):
    for vg in o.vertex_groups:
        if vg.name in ('Chest_Jnt', 'shoulder_Jnt_L', 'shoulder_Jnt_R'):
            pass  # keep: the neck skirt blends into the chest bone
skin_head = head.data.materials[0]; skin_head.name = 'Skin • face (f_char_002 texture)'
bm = bmesh.new(); bm.from_mesh(mouth.data)
for v in bm.verts: v.co.y += .011
bm.to_mesh(mouth.data); bm.free(); mouth.data.update()
mouth_mat = material('Mouth interior', (.32, .08, .07), 0, .5); mouth.data.materials.clear(); mouth.data.materials.append(mouth_mat)

# facial bone hierarchy: replace f_char_001's head subtree with f_char_002's, transformed by T
def subtree(b):
    out = [b]
    for c in b.children: out += subtree(c)
    return out
src_bones = subtree(rig2.data.bones['Head_Jnt'])
src_info = []
for b in src_bones:
    pb = rig2.pose.bones[b.name]; mw = rig2.matrix_world @ pb.matrix
    src_info.append((b.name, b.parent.name if b.parent else None, T(rig2.matrix_world @ pb.head), T(rig2.matrix_world @ pb.tail), (mw.to_3x3() @ Vector((0, 0, 1))).normalized(), b.use_deform))
select_only(rig); bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
for b in subtree(rig.data.bones['Head_Jnt']): eb.remove(eb[b.name])
for name, parent, h, t, zaxis, deform in src_info:
    b = eb.new(name); b.head = h; b.tail = t if (t - h).length > 1e-4 else h + Vector((0, 0, .01)); b.align_roll(zaxis); b.use_deform = deform
    b.parent = eb['Neck00_Jnt'] if name == 'Head_Jnt' else eb[parent]
bpy.ops.object.mode_set(mode='OBJECT')
missing = {vg.name for o in (head, eyes, mouth, lashes, hair) for vg in o.vertex_groups} - set(rig.data.bones.keys())
assert not missing, missing

# ----------------------------------------------------------------------------- neck seam
Z_CUT = 1.345
def ring_stats(verts, z, tol=.006):
    r = [v for v in verts if abs(v.z - z) < tol and abs(v.x) < .12 and abs(v.y) < .12]
    c = Vector((0, statistics.mean(v.y for v in r), 0)); rad = statistics.mean(math.hypot(v.x, v.y - c.y) for v in r)
    return c, rad
HEAD_VERTS_RAW = [v.co.copy() for v in head.data.vertices]
head_c_ring, head_r = ring_stats(HEAD_VERTS_RAW, Z_CUT + .006)
body_c_ring, body_r = ring_stats(BODY_VERTS, Z_CUT - .006)
target_r = (head_r + body_r) * .5; target_c = (head_c_ring + body_c_ring) * .5
print('NECK_MATCH head_r', round(head_r, 4), 'body_r', round(body_r, 4), 'centres', round(head_c_ring.y, 4), round(body_c_ring.y, 4))
def blend_neck(o, c_ring, r_ring, z_from, z_to):
    # scale/shift the ring about its own centre so both sides meet at the cut
    bm = bmesh.new(); bm.from_mesh(o.data)
    for v in bm.verts:
        w = (v.co.z - z_from) / (z_to - z_from)
        if abs(v.co.x) < .13 and abs(v.co.y - c_ring.y) < .13 and 0 <= w:
            w = min(1, w); w = w * w * (3 - 2 * w)
            f = 1 + (target_r / r_ring - 1) * w
            v.co.x = c_ring.x + (v.co.x - c_ring.x) * f; v.co.y = c_ring.y + (v.co.y - c_ring.y) * f + (target_c.y - c_ring.y) * w
    bm.to_mesh(o.data); bm.free(); o.data.update()
blend_neck(body, body_c_ring, body_r, 1.26, Z_CUT)
blend_neck(head, head_c_ring, head_r, 1.415, Z_CUT)
bm = bmesh.new(); bm.from_mesh(body.data)
for v in bm.verts: pass
geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, Z_CUT), plane_no=(0, 0, 1), clear_outer=True)
bm.to_mesh(body.data); bm.free(); body.data.update()
bm = bmesh.new(); bm.from_mesh(head.data)
geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, Z_CUT), plane_no=(0, 0, 1), clear_inner=True)
bm.to_mesh(head.data); bm.free(); head.data.update()
BODY_VERTS = [v.co.copy() for v in body.data.vertices]

# match the two skin textures at the seam, then lift both to the sheet's fair warm tone
def avg_texture_color(o, zmin, zmax):
    mat = o.data.materials[0]; node = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE'); img = node.image
    small = img.copy(); small.scale(128, 128); px = small.pixels[:]
    uv = o.data.uv_layers.active.data; acc = [0, 0, 0]; n = 0
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            if zmin < co.z < zmax and abs(co.x) < .08:
                u, v = uv[li].uv; x = int(u % 1 * 127); y = int(v % 1 * 127); i = (y * 128 + x) * 4
                acc[0] += px[i]; acc[1] += px[i + 1]; acc[2] += px[i + 2]; n += 1
    bpy.data.images.remove(small)
    print('SKIN_SAMPLE', o.name, mat.name, img.name, img.size[:], 'samples', n, 'has_data', img.has_data)
    srgb = Vector(acc) / max(n, 1)
    return Vector([((c + .055) / 1.055) ** 2.4 if c > .04045 else c / 12.92 for c in srgb])   # to linear
c_body = avg_texture_color(body, 1.30, Z_CUT); c_head = avg_texture_color(head, Z_CUT, 1.38)
target = Vector((.70, .50, .41))     # linear; fair warm porcelain from the colour palette
def tint(mat, factor):
    n = mat.node_tree.nodes; p = n['Principled BSDF']; tex = next(x for x in n if x.type == 'TEX_IMAGE')
    mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    mix.inputs[7].default_value = (*factor, 1)
    for l in list(tex.outputs['Color'].links): mat.node_tree.links.remove(l)
    mat.node_tree.links.new(tex.outputs['Color'], mix.inputs[6]); mat.node_tree.links.new(mix.outputs[2], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = .48; p.inputs['Subsurface Weight'].default_value = .06; p.inputs['Subsurface Radius'].default_value = (1, .2, .1)
    p.inputs['Metallic'].default_value = 0; p.inputs['Specular IOR Level'].default_value = .35
tint(skin_body, [min(2.5, target[i] / max(c_body[i], .02)) for i in range(3)])
tint(skin_head, [min(2.5, target[i] / max(c_head[i], .02)) for i in range(3)])
for m in bpy.data.materials:
    if m.name.startswith('eyes_mat') and not m.name.startswith('eyes_mattear'):
        p = m.node_tree.nodes['Principled BSDF']; p.inputs['Metallic'].default_value = 0; p.inputs['Roughness'].default_value = .15; p.inputs['Specular IOR Level'].default_value = .8
    if m.name.startswith('hair_mat'):
        p = m.node_tree.nodes['Principled BSDF']; p.inputs['Metallic'].default_value = 0; p.inputs['Roughness'].default_value = .42; p.inputs['Specular IOR Level'].default_value = .5
        tex = next(x for x in m.node_tree.nodes if x.type == 'TEX_IMAGE'); mix = m.node_tree.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
        mix.inputs[7].default_value = (.95, .84, .78, 1)   # warm dark brown, not black
        for l in list(tex.outputs['Color'].links): m.node_tree.links.remove(l)
        m.node_tree.links.new(tex.outputs['Color'], mix.inputs[6]); m.node_tree.links.new(mix.outputs[2], p.inputs['Base Color'])
    if m.name.startswith('eyes_mattear'):
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.02, .012, .01, 1)
for o in src_objs: bpy.data.objects.remove(o, do_unlink=True)

# join the head into the body and bridge the neck loops into continuous skin
apply_modifiers(head)
select_only(body, head); bpy.ops.object.join()
bm = bmesh.new(); bm.from_mesh(body.data)
bm.verts.ensure_lookup_table()
boundary = [e for e in bm.edges if e.is_boundary and abs(e.verts[0].co.z - Z_CUT) < 1e-3 and abs(e.verts[1].co.z - Z_CUT) < 1e-3]
try:
    bmesh.ops.bridge_loops(bm, edges=boundary)
    NECK_BRIDGED = True
except Exception as e:
    print('NECK_BRIDGE_FAILED', e); NECK_BRIDGED = False
bm.to_mesh(body.data); bm.free(); body.data.update()
for p in body.data.polygons: p.use_smooth = True
seam = body.vertex_groups.new(name='Neck seam')
seam.add([v.index for v in body.data.vertices if abs(v.co.z - Z_CUT) < .022], 1, 'REPLACE')
sm = body.modifiers.new('Neck seam smoothing', 'SMOOTH'); sm.factor = .6; sm.iterations = 12; sm.vertex_group = 'Neck seam'
apply_modifiers(body)
bsub = body.modifiers.new('Skin smoothing', 'SUBSURF'); bsub.levels = 1; bsub.render_levels = 2

def surface_hit(origin, direction, obj=None):
    obj = obj or body
    dg = bpy.context.evaluated_depsgraph_get()
    ok, loc, nrm, idx = obj.ray_cast(Vector(origin), Vector(direction).normalized(), depsgraph=dg)
    return (Vector(loc), Vector(nrm)) if ok else (None, None)
def drape_ring(z_fn, offset, samples=48, axis=(0, .0)):
    """Points lying on the skin around the neck/chest: angle 0 is the front (-y)."""
    pts = []
    for i in range(samples):
        th = 2 * pi * i / samples; z = z_fn(th)
        d = Vector((sin(th), -cos(th), 0)); o = Vector((axis[0], axis[1], z))
        loc, nrm = surface_hit(o, d)
        pts.append(loc + nrm * offset if loc else o + d * .06)
    return pts
def surface_z_top(x, y, dx=.012):
    pts = [v for v in BODY_VERTS if abs(v.x - x) < dx and abs(v.y - y) < .05]
    return max(v.z for v in pts)
def surface_front_y(x, z, dz=.012):
    pts = [v for v in BODY_VERTS if abs(v.x - x) < .012 and abs(v.z - z) < dz]
    return min(v.y for v in pts)

# ----------------------------------------------------------------------------- crop top
chest_c = Vector((0, -.03, 0))
def top_surface(u, v):
    th = 2 * pi * u; front = max(0, cos(th)) ** 2       # th=0 faces -y (front)
    z_top = 1.242 - .055 * front - .01 * max(0, -cos(th)) ** 2
    z_bot = 1.078
    z = z_bot + (z_top - z_bot) * v
    r = .045
    return (chest_c.x + r * sin(th), chest_c.y - r * cos(th), z)
top = grid('Crop top • ribbed bralette', top_surface, 72, 14, top_mat)
sw = top.modifiers.new('Fit to body', 'SHRINKWRAP'); sw.target = body; sw.wrap_method = 'PROJECT'; sw.use_positive_direction = True; sw.use_negative_direction = False; sw.cull_face = 'OFF'; sw.offset = .006
apply_modifiers(top)
TOP_VERTS = [v.co.copy() for v in top.data.vertices]
def top_vertex(u_idx, v_idx): return TOP_VERTS[u_idx * 15 + v_idx]
add_crumple(top, .0025, .06); add_subsurf(top, 1, 2)
sol = top.modifiers.new('Fabric thickness', 'SOLIDIFY'); sol.thickness = .004; sol.offset = -1
band_pts = [top_vertex(i, 0) + Vector((0, 0, .003)) for i in range(72)]
curve('Crop top • under-bust band', band_pts, .007, top_mat, cyclic=True)
neck_pts = [top_vertex(i, 14) for i in range(72)]
curve('Crop top • neckline binding', neck_pts, .0035, top_mat, cyclic=True)
for side in (-1, 1):
    ui = int(72 * (side * .11)) % 72
    front = top_vertex(ui, 14)
    ub = int(72 * (.5 - side * .10)) % 72
    back = top_vertex(ub, 14)
    sx = side * .085; sz = surface_z_top(sx, .01) + .005
    strap = [front]
    for y in (-.06, -.03, .0, .03, .06):
        loc, nrm = surface_hit((sx, y, 1.36), (0, 0, -1))
        strap.append(loc + nrm * .004 if loc else Vector((sx, y, sz)))
    strap.append(back)
    curve('Crop top • spaghetti strap', strap, .004, top_mat)
# lotus logo: gold line-art on the front of the top
logo_o = top_vertex(0, 8); logo_c = Vector((0, logo_o.y - .004, logo_o.z - .012))
def petal(cx, cz, w, h, lean, n=16):
    pts = []
    for k in range(n):
        t = 2 * pi * k / n
        px = w * .5 * sin(t); pz = h * (.5 - .5 * cos(t))
        px, pz = px * cos(lean) - pz * sin(lean), px * sin(lean) + pz * cos(lean)
        pts.append((cx + px, 0, cz + pz))
    return pts
logo_parts = []
for lean, w, h, dx in [(0, .017, .046, 0), (.55, .014, .040, -.006), (-.55, .014, .040, .006), (1.0, .012, .032, -.012), (-1.0, .012, .032, .012)]:
    logo_parts.append(petal(logo_c.x + dx, logo_c.z, w, h, lean))
logo_parts.append([(logo_c.x + .028 * cos(t), 0, logo_c.z - .004 - .010 * sin(t)) for t in [pi * k / 12 for k in range(13)]])
for i, pts in enumerate(logo_parts):
    c = curve('Lotus logo stroke', [(x, logo_c.y, z) for x, _, z in pts], .0011, gold, cyclic=(i < 5))
    select_only(c); bpy.ops.object.convert(target='MESH'); c = bpy.context.object
    sw = c.modifiers.new('Lay on fabric', 'SHRINKWRAP'); sw.target = top; sw.wrap_method = 'NEAREST_SURFACEPOINT'; sw.offset = .0022
    apply_modifiers(c); c.name = 'Lotus logo stroke'

# ----------------------------------------------------------------------------- joggers
HIP = [(z, torso_ring(z, .012)) for z in [1.04, 1.0, .96, .92, .88, .84, .80, .77]]
LEG_R_TOP = .105
def hip_outline(z):
    # interpolate measured torso rings, offset for a soft high-waist jogger
    if z < .80:
        return .083 + LEG_R_TOP + .004, -.008 - LEG_R_TOP - .004, -.008 + LEG_R_TOP + .004
    for (z0, r0), (z1, r1) in zip(HIP, HIP[1:]):
        if z1 <= z <= z0:
            w = (z0 - z) / (z0 - z1); a = r0[0] * (1 - w) + r1[0] * w; ymin = r0[1] * (1 - w) + r1[1] * w; ymax = r0[2] * (1 - w) + r1[2] * w
            return a, ymin, ymax
    return HIP[-1][1]
def legs_union(th, cy, r=LEG_R_TOP + .003):
    # far intersection of the ray from (0, cy) at angle th with the two leg circles
    d = Vector((sin(th), -cos(th))); best = 0
    for cx in (-.083, .083):
        pc = Vector((cx, -.008)) - Vector((0, cy)); b = pc.dot(d); c = pc.length_squared - r * r; disc = b * b - c
        if disc >= 0: best = max(best, b + math.sqrt(disc))
    return best
def pants_hip(u, v):
    th = 2 * pi * u; z = 1.03 - (1.03 - .70) * v
    a, ymin, ymax = hip_outline(min(1.03, z))
    loose = (.012 + .022 * min(1, v * 2.2) ** .7) * min(1, max(0, (z - .80) / .06))
    fold = .006 * sin(th * 9 + v * 4) * sin(v * pi)
    cx = 0; cy = (ymin + ymax) / 2; rx = a + loose + fold; ry = (ymax - ymin) / 2 + loose * .85 + fold
    ell = Vector((rx * sin(th), -ry * cos(th)))
    w = min(1, max(0, (.80 - z) / .10)); w = w * w * (3 - 2 * w)
    uni = legs_union(th, cy) * Vector((sin(th), -cos(th)))
    p = ell * (1 - w) + uni * w
    return (cx + p.x, cy + p.y, z)
hipm = grid('Joggers • high waist and seat', pants_hip, 72, 20, pants_mat)
def leg_axis(side):
    hip = Vector((side * .083, -.008, .79)); knee = Vector((side * .085, -.012, .45)); ankle = Vector((side * .086, .0, .105))
    return [hip, hip.lerp(knee, .5), knee, knee.lerp(ankle, .5), ankle]
def leg_radius(t, ang):
    base = [.105, .108, .098, .088, .078, .060, .046]
    f = t * (len(base) - 1); i = min(int(f), len(base) - 2); q = f - i
    r = base[i] * (1 - q) + base[i + 1] * q
    drape = 1 + .05 * sin(ang * 7 + t * 5) * sin(min(1, t * 1.3) * pi) + .03 * sin(ang * 3 - t * 9)
    gather = 1 + .10 * sin(ang * 11) * max(0, (t - .82) / .18)      # elastic-cuff gathers
    return r * drape * gather
legs = []
for side in (-1, 1):
    l = tube('Joggers • leg %s' % ('L' if side > 0 else 'R'), leg_axis(side), leg_radius, pants_mat, sides=32, samples=48)
    legs.append(l)
    torus('Joggers • elastic cuff', (side * .086, .0, .104), (0, 0, 1), .045, .012, pants_mat)
for o in [hipm] + legs:
    add_crumple(o, .006, .16); add_subsurf(o, 1, 2)
sol = hipm.modifiers.new('Fabric thickness', 'SOLIDIFY'); sol.thickness = .006; sol.offset = -1
waist = [pants_hip(i / 72, 0) for i in range(72)]
curve('Joggers • waistband', [Vector(p) + Vector((0, 0, -.004)) for p in waist], .011, pants_mat, cyclic=True)
wf = Vector(pants_hip(0, 0)) + Vector((0, -.012, -.008))
for side in (-1, 1):
    curve('Joggers • drawstring', [wf + Vector((side * .006, 0, 0)), wf + Vector((side * .02, -.004, -.03)), wf + Vector((side * .016, -.002, -.07)), wf + Vector((side * .024, .0, -.105))], .003, cord_mat)
    curve('Joggers • drawstring bow', [wf + Vector((side * .004, 0, 0)), wf + Vector((side * .022, -.006, .012)), wf + Vector((side * .034, -.004, .0)), wf + Vector((side * .02, -.002, -.010)), wf + Vector((side * .004, 0, -.002))], .003, cord_mat, cyclic=True)

# ----------------------------------------------------------------------------- jacket
TH0 = .40 * pi
def jacket_body(u, v):
    th = TH0 + (2 * pi - 2 * TH0) * u                    # opening at the front
    front = max(0, cos(th)) ** 2; side_dip = sin(th) ** 2
    z_top = 1.150 - .045 * side_dip - .02 * front - .025 * max(0, -cos(th)) ** 4
    z_bot = .905 - .02 * front + .01 * side_dip
    z = z_top + (z_bot - z_top) * v
    r = .05
    return (r * sin(th), -.02 - r * cos(th), z)
jbody = grid('Jacket • dropped body', jacket_body, 60, 16, jacket_mat, wrap_u=False)
sw = jbody.modifiers.new('Fit to torso', 'SHRINKWRAP'); sw.target = body; sw.wrap_method = 'PROJECT'; sw.use_positive_direction = True; sw.use_negative_direction = False; sw.cull_face = 'OFF'; sw.offset = 0
apply_modifiers(jbody)
bm = bmesh.new(); bm.from_mesh(jbody.data); bm.verts.ensure_lookup_table(); bm.normal_update()
uvl = jbody.data.uv_layers.active.data
for f in jbody.data.polygons: pass
for i, v in enumerate(bm.verts):
    u_i = i // 17; v_i = i % 17; vv = v_i / 16; uu = u_i / 60
    th = TH0 + (2 * pi - 2 * TH0) * uu
    loose = .030 + .045 * vv + .012 * sin(th * 6 + vv * 4) * (.3 + .7 * vv) + .015 * (1 - vv) ** 3
    nrm = Vector((v.normal.x, v.normal.y, 0)).normalized() if v.normal.length else Vector((sin(th), -cos(th), 0))
    v.co = v.co + nrm * loose
bm.to_mesh(jbody.data); bm.free(); jbody.data.update()
def sleeve_axis(side):
    A = bone_head('Arm_Jnt_L'); E = bone_head('Elbow_Jnt_L'); W = bone_head('Hand_Jnt_L')
    pts = [A.lerp(E, .28), A.lerp(E, .65), E, E.lerp(W, .5), W + (W - E).normalized() * .015]
    return [Vector((side * p.x, p.y, p.z)) for p in pts]
def sleeve_radius(t, ang):
    base = [.076, .094, .100, .092, .080, .046]
    f = t * (len(base) - 1); i = min(int(f), len(base) - 2); q = f - i
    r = base[i] * (1 - q) + base[i + 1] * q
    puff = 1 + .07 * sin(ang * 5 + t * 6) * sin(min(1, t * 1.25) * pi) + .04 * sin(ang * 2 + 1)
    gather = 1 + .09 * sin(ang * 10) * max(0, (t - .84) / .16)
    return r * puff * gather
sleeves = []
for side in (-1, 1):
    s = tube('Jacket • balloon sleeve %s' % ('L' if side > 0 else 'R'), sleeve_axis(side), sleeve_radius, jacket_mat, sides=32, samples=44)
    sleeves.append(s)
    ax = sleeve_axis(side); W = ax[-1]; d = (ax[-1] - ax[-2]).normalized()
    torus('Jacket • ribbed cuff', W - d * .005, d, .043, .012, jacket_mat)
add_crumple(jbody, .016, .16); add_crumple(jbody, .008, .07, 'Fleece wrinkles', 'STUCCI'); add_subsurf(jbody, 1, 2)
for o in sleeves:
    add_crumple(o, .012, .14); add_crumple(o, .007, .06, 'Sleeve wrinkles', 'STUCCI'); add_subsurf(o, 1, 2)
sol = jbody.modifiers.new('Fleece thickness', 'SOLIDIFY'); sol.thickness = .012; sol.offset = -1
JB = [v.co.copy() for v in jbody.data.vertices]
curve('Jacket • ribbed hem', [JB[i * 17 + 16] for i in range(61)], .012, jacket_mat)
curve('Jacket • collar binding', [JB[i * 17] for i in range(61)], .008, jacket_mat)

# ----------------------------------------------------------------------------- scrunchie and necklace
HAIR_VERTS = [v.co.copy() for v in hair.data.vertices]
head_c = H1 + Vector((0, .012, .105))
scalp_r = statistics.median((v - head_c).length for v in HAIR_VERTS)
bun = [v for v in HAIR_VERTS if (v - head_c).length > scalp_r + .015 and v.z > head_c.z + .06 and abs(v.x) < .06]
bun_c = Vector([statistics.mean(c) for c in zip(*[(v.x, v.y, v.z) for v in bun])])
n = (bun_c - head_c).normalized()
bun_r = statistics.mean(((v - bun_c) - n * (v - bun_c).dot(n)).length for v in bun) * 1.25
print('BUN centre', tuple(round(x, 3) for x in bun_c), 'r', round(bun_r, 3), 'scalp_r', round(scalp_r, 3), 'n', len(bun))
scr = torus('Scrunchie • cream satin', bun_c - n * .034, n, .040, .015, scrunchie_mat, segs=64, rings=18)
add_crumple(scr, .012, .05, 'Scrunchie ruffle'); add_subsurf(scr, 1, 2)
chain = drape_ring(lambda th: 1.335 - .12 * (.5 + .5 * cos(th)) ** 1.6, .004, 40, (0, .01))
curve('Necklace • fine gold chain', chain, .0018, gold, cyclic=True)
pend, pn = surface_hit((0, .01, 1.20), (0, -1, 0))
pend = pend + pn * .010
curve('Necklace • bail', [chain[0], pend + Vector((0, 0, .012))], .0018, gold)
torus('Necklace • ring pendant', pend, (0, 1, 0), .012, .0022, gold)

# ----------------------------------------------------------------------------- skinning
# every constructed piece takes its deformation weights from the nearest skin
select_only(rig)
for o in list(CHAR.objects):
    if o.type == 'CURVE':
        select_only(o); bpy.ops.object.convert(target='MESH'); o = bpy.context.object
    if o.type != 'MESH': continue
    select_only(o); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if not o.vertex_groups:
        if o.name.startswith('Scrunchie'):
            g = o.vertex_groups.new(name='Head_Jnt'); g.add(list(range(len(o.data.vertices))), 1, 'REPLACE')
        else:
            dt = o.modifiers.new('Weights from skin', 'DATA_TRANSFER'); dt.object = body; dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'; dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
            bpy.ops.object.datalayout_transfer(modifier=dt.name); bpy.ops.object.modifier_apply(modifier=dt.name)
    mod = o.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    o.parent = rig; o.matrix_parent_inverse = Matrix.Identity(4)
rig.show_in_front = True; rig.data.display_type = 'STICK'
rig['design_reference'] = 'reference/character-sheet.png'
rig['source_meshes'] = 'f_char_001 base body; f_char_002 face, eyes, mouth, bun hair; garments authored here'

# ----------------------------------------------------------------------------- idle animation
def fcurves_of(act):
    return act.layers[0].strips[0].channelbags[0].fcurves
def load_action(fbx, keep_bone):
    before = set(scene.objects); before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(fbx))
    tmp = set(scene.objects) - before; act = next(iter(set(bpy.data.actions) - before_actions), None)
    for o in tmp: bpy.data.objects.remove(o, do_unlink=True)
    if act:
        fcs = fcurves_of(act)
        for fc in list(fcs):
            bone = fc.data_path.split('"')[1] if '"' in fc.data_path else ''
            if not keep_bone(bone): fcs.remove(fc)
    return act
scene.frame_start = 1; scene.frame_end = 181
try:
    facial = {x[0] for x in src_info}
    idle = load_action(BODY_SRC / '3.animation/girl_idle_blink_v03.fbx', lambda b: b in rig.data.bones and b not in facial)
    for fc in fcurves_of(idle):
        if 'location' in fc.data_path:
            for k in fc.keyframe_points: k.co.y *= .01 * K; k.handle_left.y *= .01 * K; k.handle_right.y *= .01 * K
    blink = load_action(HEAD_SRC / 'Female_IdleBlink.fbx', lambda b: b.startswith('Eyelids') and b in rig.data.bones)
    for fc in fcurves_of(blink):
        if 'rotation' not in fc.data_path: continue
        nf = fcurves_of(idle).new_from_fcurve(fc)
        nf.modifiers.new('CYCLES')
    rng = idle.frame_range; scene.frame_start = int(rng[0]); scene.frame_end = int(rng[1])
    idle.name = 'Idle_Breath_Blink'; ANIM = 'fbx'
except Exception as e:
    print('IDLE_IMPORT_FAILED', e); ANIM = 'procedural'
    rig.animation_data_clear()
    for frame in range(1, 182, 6):
        a = (1 - cos((frame - 1) / 180 * 2 * pi)) * .5
        pb = rig.pose.bones['Chest_Jnt']; pb.scale = (1 + .01 * a, 1 + .008 * a, 1 + .012 * a); pb.keyframe_insert('scale', frame=frame)
        hb = rig.pose.bones['Head_Jnt']; hb.rotation_mode = 'XYZ'; hb.rotation_euler = (math.radians(-1.2 * a), 0, 0); hb.keyframe_insert('rotation_euler', frame=frame)
    rig.animation_data.action.name = 'Idle_Breath_6s'; idle = rig.animation_data.action; rig.animation_data.action = None
scene.frame_set(scene.frame_start)
rig['animation_source'] = ANIM
def attach_idle():
    rig.animation_data_create(); rig.animation_data.action = idle
    if hasattr(idle, 'slots') and len(idle.slots): rig.animation_data.action_slot = idle.slots[0]

# ----------------------------------------------------------------------------- stage, light, camera
stage_floor = material('Blush studio floor', (.86, .74, .70), 0, .7)
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0)); floor = bpy.context.object; floor.name = 'Studio floor'; link(floor, STAGE); floor.data.materials.append(stage_floor)
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 6, 0), rotation=(pi / 2, 0, 0)); wall = bpy.context.object; wall.name = 'Studio backdrop'; link(wall, STAGE)
wm = material('Blush studio backdrop', (.90, .80, .78), 0, .9); wall.data.materials.append(wm)
def area(name, loc, energy, size, color, target=(0, 0, 1.0)):
    bpy.ops.object.light_add(type='AREA', location=loc); o = bpy.context.object; o.name = name; link(o, STAGE)
    o.data.energy = energy; o.data.shape = 'DISK'; o.data.size = size; o.data.color = color
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler(); return o
area('Soft key (dawn)', (-2.2, -3.0, 3.2), 260, 3.0, (1, .90, .84))
area('Front fill', (1.8, -3.2, 1.6), 90, 3.5, (.92, .93, 1))
area('Warm rim', (1.6, 2.2, 2.8), 220, 2.0, (1, .80, .66))
area('Backdrop wash', (0, 2.0, 3.5), 160, 4.0, (1, .86, .84), (0, 6, 1.2))
scene.world = bpy.data.worlds.new('Dawn sky'); scene.world.use_nodes = True
bg = scene.world.node_tree.nodes['Background']; bg.inputs[0].default_value = (.80, .70, .72, 1); bg.inputs[1].default_value = .22
bpy.ops.object.camera_add(location=(0, -6.0, 0.95)); cam = bpy.context.object; cam.name = 'Turnaround camera'; link(cam, STAGE)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.95; cam.rotation_euler = (pi / 2, 0, 0); scene.camera = cam
scene.render.resolution_x = 900; scene.render.resolution_y = 1600; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'; scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
if PREVIEW:
    scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'; scene.display.shading.show_shadows = True
    scene.display_settings.display_device = 'sRGB'; scene.view_settings.view_transform = 'Standard'
else:
    scene.render.engine = 'CYCLES'; scene.cycles.samples = int(os.environ.get('MM_SAMPLES', '96')); scene.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for d in prefs.devices: d.use = d.type == 'METAL'
        scene.cycles.device = 'GPU'
    except Exception as e: print('GPU_UNAVAILABLE', e)

# reference sheet packed into the file as a viewport-only image empty
img = bpy.data.images.load(str(OUT / 'reference/character-sheet.png')); img.pack()
refe = bpy.data.objects.new('Reference • character sheet', None); REF.objects.link(refe)
refe.empty_display_type = 'IMAGE'; refe.data = img; refe.empty_display_size = 2.4; refe.location = (2.6, .6, 1.0); refe.rotation_euler = (pi / 2, 0, 0); refe.hide_render = True
REF.hide_render = True
for image in bpy.data.images:
    if image.source == 'FILE' and Path(bpy.path.abspath(image.filepath)).exists():
        try: image.pack()
        except RuntimeError: pass
def tidy_viewport():
    # clean presentation when the file is opened: no bone sticks or light guides over the character
    rig.show_in_front = False
    bpy.context.view_layer.layer_collection.children[RIG.name].hide_viewport = True
    for screen in bpy.data.screens:
        for a in screen.areas:
            if a.type == 'VIEW_3D':
                sp = a.spaces.active
                try: sp.region_3d.view_perspective = 'CAMERA'
                except Exception: pass
                for attr, val in (('show_extras', False), ('show_relationship_lines', False), ('show_bones', False), ('show_floor', False), ('show_axis_x', False), ('show_axis_y', False), ('show_cursor', False)):
                    try: setattr(sp.overlay, attr, val)
                    except Exception: pass
                for attr, val in (('type', 'SOLID'), ('light', 'STUDIO'), ('color_type', 'TEXTURE'), ('show_shadows', True), ('show_cavity', True)):
                    try: setattr(sp.shading, attr, val)
                    except Exception: pass
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = body
tidy_viewport()
attach_idle()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'meditation-master-modern.blend'))
rig.animation_data.action = None
for pb in rig.pose.bones: pb.matrix_basis = Matrix.Identity(4)
scene.frame_set(1)   # previews in the sheet's A-pose (rest pose)

# ----------------------------------------------------------------------------- previews
def shoot(name, loc, target, ortho, w, h):
    cam.location = loc; cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.ortho_scale = ortho
    scene.render.resolution_x = w; scene.render.resolution_y = h
    scene.render.filepath = str(OUT / 'previews' / name); bpy.ops.render.render(write_still=True)
suffix = '.preview.png' if PREVIEW else '.png'
shoot('front' + suffix, (0, -6, .88), (0, 0, .88), 1.95, 900, 1600)
shoot('side' + suffix, (-6, 0, .88), (0, 0, .88), 1.95, 900, 1600)
shoot('back' + suffix, (0, 6, .88), (0, 0, .88), 1.95, 900, 1600)
shoot('three-quarter' + suffix, (-4.3, -4.3, .88), (0, 0, .88), 1.95, 900, 1600)
shoot('face' + suffix, (-1.4, -5.6, 1.45), (0, 0, 1.47), .52, 1000, 1000)
print('MODERN_BUILD_COMPLETE', 'neck_bridged', NECK_BRIDGED, 'anim', ANIM, 'skin_seam', [round(x, 3) for x in c_body], [round(x, 3) for x in c_head], flush=True)
