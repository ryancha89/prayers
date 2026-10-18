"""Verify assets/celestial-oracle/luna.fbx against Yunjung's original FBX.

Checks that the exported rig keeps her object transforms, bone names, parents and rest
matrices (so f_char_003's Unity Generic clips still bind), then drives the re-imported
character with one of her real animation clips and renders a frame.

    Blender -b --python tools/blender/verify_celestial_oracle_fbx.py
"""
import bpy, json, math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/celestial-oracle'
Y = Path('/Users/namaste/git/saju_fullstack/saju_world_unity_hall/Assets/Art/1.character/f_char_003')
CLIP = Y / '3.animation/Female_Talking.fbx'

def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(path))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    bones = {b.name: (b.parent.name if b.parent else None, b.matrix_local.copy()) for b in rig.data.bones}
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    bbox = [[round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)]]
    return rig.name, rig.matrix_world.copy(), bones, bbox, sorted(o.name for o in meshes)

on, omw, ob, obox, _ = load(Y / '0.model/Female_char03_Outfit01_Avatar.fbx')
nn, nmw, nb, nbox, nmeshes = load(OUT / 'luna.fbx')
rest_err = max((ob[k][1].translation - nb[k][1].translation).length for k in ob if k in nb)
rot_err = max(math.degrees(ob[k][1].to_quaternion().rotation_difference(nb[k][1].to_quaternion()).angle) for k in ob if k in nb)
report = {
    'armature_name': [on, nn],
    'armature_matrix_max_diff': max(abs(a - b) for ra, rb in zip(omw, nmw) for a, b in zip(ra, rb)),
    'bones_original': len(ob), 'bones_exported': len(nb),
    'missing_bones': sorted(set(ob) - set(nb)), 'extra_bones': sorted(set(nb) - set(ob)),
    'parent_mismatch': sorted(k for k in ob if k in nb and ob[k][0] != nb[k][0]),
    'rest_head_max_err_rig_units': rest_err, 'rest_rot_max_err_deg': rot_err,
    'bbox_original': obox, 'bbox_exported': nbox, 'meshes': nmeshes,
}

# drive the exported character with Yunjung's own clips and render frames
import shutil
CLIPS = [('idle', 'Female_Platform_LookAtTrain_Idle.fbx', .5), ('sit_idle', 'Female_SitIdle.fbx', .5),
         ('talk', 'Female_Talking.fbx', .45), ('walk', 'Female_Walk.fbx', .3)]
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = 900; sc.render.resolution_y = 1200
sc.view_settings.view_transform = 'AgX'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.28, .25, .42, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = .6
for loc, e, col in (((-1.7, -2.5, 2.5), 260, (1, .87, .68)), ((2.3, -1.9, 1.3), 90, (.76, .72, 1)), ((1.3, 2.2, 2.3), 330, (.72, .58, 1)), ((-1.5, 1.9, 1.7), 220, (1, .8, .52))):
    l = bpy.data.lights.new('l', 'AREA'); l.energy = e; l.color = col; l.size = 2
    lo = bpy.data.objects.new('l', l); sc.collection.objects.link(lo); lo.location = loc
    lo.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
report['clips'] = {}
for tag, fname, frac in CLIPS:
    before = set(bpy.data.objects); acts_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(Y / '3.animation' / fname))
    act = next(iter(set(bpy.data.actions) - acts_before))
    for o in set(bpy.data.objects) - before: bpy.data.objects.remove(o, do_unlink=True)
    rig.animation_data_create(); rig.animation_data.action = act
    if act.slots: rig.animation_data.action_slot = act.slots[0]
    f0, f1 = (int(x) for x in act.frame_range); fr = int(f0 + (f1 - f0) * frac); sc.frame_set(fr)
    dg = bpy.context.evaluated_depsgraph_get(); pts = []; stretch = {}
    for o in sc.objects:
        if o.type != 'MESH': continue
        ev = o.evaluated_get(dg); m = ev.to_mesh(); P = [ev.matrix_world @ v.co for v in m.vertices]
        R = [o.matrix_world @ v.co for v in o.data.vertices] if not o.modifiers else None
        # max edge stretch ratio vs rest (tearing indicator)
        rest = o.data; worst = 1.0
        if len(rest.vertices) == len(P):
            for e in rest.edges:
                a, b = e.vertices; l0 = (rest.vertices[a].co - rest.vertices[b].co).length
                if l0 > 1e-6:
                    l1 = (P[a] - P[b]).length / (o.matrix_world.to_scale()[0] * l0 if o.parent_type != 'BONE' else l0 * o.matrix_world.to_scale()[0])
                    worst = max(worst, l1)
        stretch[o.name] = round(worst, 2); pts += P; ev.to_mesh_clear()
    lo_ = Vector([min(p[i] for p in pts) for i in range(3)]); hi_ = Vector([max(p[i] for p in pts) for i in range(3)])
    ctr = (lo_ + hi_) / 2; size = max(hi_ - lo_)
    report['clips'][tag] = {'file': fname, 'frame': fr, 'range': [f0, f1], 'bbox': [[round(x, 3) for x in lo_], [round(x, 3) for x in hi_]],
                            'finite': all(math.isfinite(c) for p in pts for c in p),
                            'worst_edge_stretch': dict(sorted(stretch.items(), key=lambda kv: -kv[1])[:5])}
    for view, d in (('front', Vector((0, -1, .08))), ('34', Vector((.75, -.75, .1)))):
        cam.data.lens = 50; cam.location = ctr + d.normalized() * size * 2.4
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = str(OUT / f'previews/anim_{tag}_{view}.png'); bpy.ops.render.render(write_still=True)
(OUT / 'fbx_verification.json').write_text(json.dumps(report, indent=2))
shutil.rmtree(OUT / 'luna.fbm', ignore_errors=True)
print('VERIFY', json.dumps(report))

# ── every f_char_003 clip, three moments each, a front close-up of the head and hands ──────────────
# (17-10: the sleeve must never cover her face in any clip the room or the train plays)
import os
if os.environ.get('CO_ALL_CLIPS') == '1':
    sheet_dir = OUT / 'previews/clips'; sheet_dir.mkdir(exist_ok=True)
    sc.render.resolution_x = 420; sc.render.resolution_y = 420
    head = rig.pose.bones['Head_Jnt']
    for fbx in sorted((Y / '3.animation').glob('*.fbx')):
        before = set(bpy.data.objects); acts_before = set(bpy.data.actions)
        bpy.ops.import_scene.fbx(filepath=str(fbx))
        new = set(bpy.data.actions) - acts_before
        for o in set(bpy.data.objects) - before: bpy.data.objects.remove(o, do_unlink=True)
        if not new: continue
        act = next(iter(new))
        rig.animation_data.action = act
        if act.slots: rig.animation_data.action_slot = act.slots[0]
        f0, f1 = (int(x) for x in act.frame_range)
        for j, frac in enumerate((.2, .5, .8)):
            sc.frame_set(int(f0 + (f1 - f0) * frac))
            hp = rig.matrix_world @ head.head
            # camera in front of the face (the rig faces -Y), a little below eye level, 1.1 m out
            cam.data.lens = 50; cam.location = hp + Vector((0, -1.15, -0.12))
            cam.rotation_euler = ((hp + Vector((0, 0, -.18))) - cam.location).to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = str(sheet_dir / f'{fbx.stem}_{j}.png'); bpy.ops.render.render(write_still=True)
    print('CLIPSHEETS', sheet_dir)
