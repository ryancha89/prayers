"""Open the latest saved mobile model explicitly and frame its rear hair."""
import bpy
import json
import os
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parents[1]
model = HERE / 'output/mobile/luna_mobile.blend'
bpy.ops.wm.open_mainfile(filepath=str(model))
scene = bpy.context.scene
cam = bpy.data.objects['Luna • 04 Back']
cam.location = (0, 4, 1.40)
cam.rotation_euler = (Vector((0, .05, 1.40)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.ortho_scale = 1.12
scene.camera = cam
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type != 'VIEW_3D':
            continue
        space = area.spaces.active
        space.shading.type = 'MATERIAL'
        space.shading.use_scene_lights = True
        space.shading.use_scene_world = True
        space.overlay.show_overlays = False
        space.region_3d.view_perspective = 'CAMERA'
        space.region_3d.view_camera_zoom = 8
        space.region_3d.view_camera_offset = (0, 0)
bpy.ops.object.select_all(action='DESELECT')
Path('/tmp/luna-viewer-ready.json').write_text(json.dumps({
    'file': bpy.data.filepath,
    'file_mtime': model.stat().st_mtime,
    'revision': scene.get('Luna_Revision'),
    'pid': os.getpid(),
    'view': 'back hair closeup',
    'hair_vertices': len(bpy.data.objects['CO_Hair_Long'].data.vertices),
}, indent=2))
print('LUNA_VIEWER_READY', bpy.data.filepath, flush=True)
