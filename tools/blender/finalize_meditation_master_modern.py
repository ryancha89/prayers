"""Export and validate the modern Meditation Master; run after the build script.

Writes meditation-master-modern.glb (character + humanoid rig + idle action),
validation.json (measured idle/blink deformation and loop closure) and the
blink validation render. No remote services.
"""
import bpy, json, statistics
from pathlib import Path
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/meditation-master-modern'
bpy.ops.wm.open_mainfile(filepath=str(OUT / 'meditation-master-modern.blend'))
s = bpy.context.scene
rig = bpy.data.objects['MeditationMaster_Rig']
CHAR = bpy.data.collections['01 • Meditation master (modern)']
for image in list(bpy.data.images):
    if image.source == 'FILE' and not image.packed_file and not Path(bpy.path.abspath(image.filepath)).exists():
        bpy.data.images.remove(image, do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'meditation-master-modern.blend'))

# GLB: character and rig only, no stage, lights, camera or reference image
bpy.ops.object.select_all(action='DESELECT')
for o in CHAR.objects: o.select_set(True)
rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'meditation-master-modern.glb'), export_format='GLB', use_selection=True, export_animations=True, export_frame_range=True, export_force_sampling=True, export_apply=True)
print('GLB_EXPORT_COMPLETE', flush=True)

# Actual deformation measurements, not just the presence of an action
def positions(obj, f):
    s.frame_set(f); dg = bpy.context.evaluated_depsgraph_get(); ev = obj.evaluated_get(dg); m = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in m.vertices]; ev.to_mesh_clear(); return pts
lashes = bpy.data.objects['Eyelashes']; body = next(o for o in CHAR.objects if o.name.startswith('Body'))
f0, f1 = s.frame_start, s.frame_end
base_l = positions(lashes, f0); base_b = positions(body, f0)
blink_by_frame = {}
for f in range(f0, f1 + 1, 2):
    p = positions(lashes, f); blink_by_frame[f] = max((a - b).length for a, b in zip(base_l, p))
blink_frame = max(blink_by_frame, key=blink_by_frame.get)
body_mid = positions(body, (f0 + f1) // 2); body_end = positions(body, f1)
report = {
    'animation': rig.animation_data.action.name if rig.animation_data and rig.animation_data.action else None,
    'animation_source': rig.get('animation_source'),
    'fps': s.render.fps, 'frame_start': f0, 'frame_end': f1,
    'body_max_movement_m': max((a - b).length for a, b in zip(base_b, body_mid)),
    'body_loop_endpoint_max_error_m': max((a - b).length for a, b in zip(base_b, body_end)),
    'eyelash_max_movement_m': blink_by_frame[blink_frame], 'blink_peak_frame': blink_frame,
    'mesh_objects': sum(o.type == 'MESH' for o in CHAR.objects),
    'triangles_approx': sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in CHAR.objects if o.type == 'MESH'),
    'bones': len(rig.data.bones),
    'missing_image_files': [i.name for i in bpy.data.images if i.source == 'FILE' and not i.packed_file and not Path(bpy.path.abspath(i.filepath)).exists()],
}
(OUT / 'validation.json').write_text(json.dumps(report, indent=2))
print('VALIDATION', json.dumps(report), flush=True)
assert report['body_max_movement_m'] > .002, 'idle does not move the body'
assert report['eyelash_max_movement_m'] > .002, 'blink does not move the eyelids'
assert not report['missing_image_files']

# Blink validation render at the peak frame, and the idle pose at mid clip
cam = s.camera; cam.data.type = 'ORTHO'
def shoot(name, loc, target, ortho, w, h, frame):
    s.frame_set(frame); cam.location = loc; cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.ortho_scale = ortho
    s.render.resolution_x = w; s.render.resolution_y = h; s.render.filepath = str(OUT / 'previews' / name); bpy.ops.render.render(write_still=True)
s.cycles.samples = 48
shoot('validation-blink-frame.png', (-1.4, -5.6, 1.45), (0, 0, 1.47), .52, 800, 800, blink_frame)
shoot('validation-idle-mid-clip.png', (-4.3, -4.3, .88), (0, 0, .88), 1.95, 600, 1067, (f0 + f1) // 2)
s.frame_set(f0)
print('FINALIZE_COMPLETE', flush=True)
