"""Render crown continuity and silhouette from three directions."""
import bpy
import os
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parents[1]
mobile=bool(os.getenv('LUNA_MOBILE'))
bpy.ops.wm.open_mainfile(filepath=str(HERE/('output/mobile/luna_mobile.blend' if mobile else 'output/luna_refined.blend')))
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.render.resolution_x=750
scene.render.resolution_y=900
scene.render.resolution_percentage=100
cam=bpy.data.objects['Luna • 04 Back']
scene.camera=cam
folder=HERE/'previews'/('mobile' if mobile else 'hair')
folder.mkdir(exist_ok=True)
for tag,loc in [('hair_back',(0,4,1.47)),('hair_side',(3,2,1.48)),('hair_front',(.6,-4,1.50))]:
    cam.location=loc
    cam.rotation_euler=(Vector((0,.04,1.42))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=1.00
    scene.render.filepath=str(folder/(tag+'.png'))
    bpy.ops.render.render(write_still=True)
