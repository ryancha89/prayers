"""Turnaround + face renders of Cheese for checking against references/Turnaround.png.

Blender -b --python 3d-modeling/cheese/scripts/preview_cat.py -- <out_dir> [pose] [expr]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cheese_cat  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
POSE = argv[1] if len(argv) > 1 else 'sit'
EXPR = argv[2] if len(argv) > 2 else 'idle'
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
coll = sc.collection
cat = cheese_cat.build_cat(coll, POSE, EXPR)

# floor + soft light
bpy.ops.mesh.primitive_plane_add(size=6)
fl = bpy.context.object
m = bpy.data.materials.new("Floor"); m.use_nodes = True
m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.8, 0.78, 0.74, 1)
fl.data.materials.append(m)
w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.92, 1.0, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.35
for loc, e, s in (((-1.2, -1.6, 1.8), 60, 1.6), ((1.5, -0.8, 1.2), 20, 1.2), ((0.3, 1.6, 1.6), 35, 1.0)):
    l = bpy.data.lights.new("A", 'AREA'); l.energy = e; l.size = s
    o = bpy.data.objects.new("A", l); coll.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.25)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); coll.objects.link(cam); sc.camera = cam
sc.render.engine = 'CYCLES'
sc.cycles.samples = 48
sc.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = 'GPU'
except Exception:
    pass
sc.render.resolution_x = 900; sc.render.resolution_y = 900
sc.view_settings.view_transform = 'Standard'

head = Vector(cat["head_local"])
shots = {
    'front': (Vector((0, -1.6, 0.3)), Vector((0, 0, 0.24)), 40),
    'side': (Vector((1.6, -0.1, 0.3)), Vector((0, 0.0, 0.24)), 40),
    'back': (Vector((0.2, 1.6, 0.35)), Vector((0, 0, 0.24)), 40),
    'threeq': (Vector((-1.0, -1.2, 0.55)), Vector((0, 0, 0.24)), 40),
    'face': (head + Vector((0, -0.75, 0.02)), head + Vector((0, 0, -0.01)), 85),
}
for name, (loc, at, lens) in shots.items():
    cam.location = loc
    cam.data.lens = lens
    cam.rotation_euler = (at - loc).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, f"{POSE}_{EXPR}_{name}.png")
    bpy.ops.render.render(write_still=True)
print("PREVIEW_DONE", OUT)
