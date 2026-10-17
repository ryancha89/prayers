"""Render front/side previews of a .blend (all mesh objects), auto-framed.

Blender -b <file.blend> --python tools/blender/preview_render.py -- <out_prefix> [workbench|eevee] [res]
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
out = argv[0]
engine = argv[1] if len(argv) > 1 else "workbench"
res = int(argv[2]) if len(argv) > 2 else 900

sc = bpy.context.scene
meshes = [o for o in sc.objects if o.type == "MESH" and o.visible_get()]
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
ctr = (lo + hi) / 2
size = max(hi - lo)
print("[preview] bbox", tuple(round(v, 3) for v in lo), tuple(round(v, 3) for v in hi))

if engine == "workbench":
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
else:
    sc.render.engine = "BLENDER_EEVEE"
    if not sc.world:
        sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.6, 0.6, 0.62, 1)
    bg.inputs[1].default_value = 1.0
    for ang in (35, -50):
        l = bpy.data.lights.new("k", "SUN"); l.energy = 3
        lo_ = bpy.data.objects.new("k", l); sc.collection.objects.link(lo_)
        lo_.rotation_euler = (math.radians(55), 0, math.radians(ang))

sc.render.resolution_x = res
sc.render.resolution_y = int(res * 1.3)
cam_d = bpy.data.cameras.new("pc"); cam_d.type = "ORTHO"; cam_d.ortho_scale = size * 1.1
cam = bpy.data.objects.new("pc", cam_d); sc.collection.objects.link(cam); sc.camera = cam
for tag, d in (("front", Vector((0, -1, 0))), ("side", Vector((1, 0, 0))), ("back", Vector((0, 1, 0)))):
    cam.location = ctr + d * size * 3
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{out}_{tag}.png"
    bpy.ops.render.render(write_still=True)
print("[preview] done")
