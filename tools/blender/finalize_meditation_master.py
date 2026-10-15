"""Export and inspect the authored seated master; run after build script."""
import bpy, json, sys, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/meditation-master'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'meditation-master.blend'))
s=bpy.context.scene
rig=bpy.data.objects['MeditationMaster_Rig']
s.frame_set(1)
for image in list(bpy.data.images):
    if image.source=='FILE' and not image.packed_file and not Path(bpy.path.abspath(image.filepath)).exists():
        bpy.data.images.remove(image,do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_overlays=False
            area.spaces.active.region_3d.view_camera_zoom=8
for o in bpy.context.selected_objects:o.select_set(False)
bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'meditation-master.blend'))
# Export only the character and rig, excluding lights, references and display stand.
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.collections['01 • Meditation master'].objects:o.select_set(True)
rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'meditation-master.glb'),export_format='GLB',use_selection=True,export_animations=True,export_frame_range=True,export_force_sampling=True,export_apply=True)
print('GLB_EXPORT_COMPLETE',flush=True)
# Actual deformation check, not just the presence of an action name.
head=bpy.data.objects['Face • closed eyes and neck']
def positions(f):
    s.frame_set(f);dg=bpy.context.evaluated_depsgraph_get();obj=head.evaluated_get(dg);m=obj.to_mesh();pts=[obj.matrix_world@v.co for v in m.vertices];obj.to_mesh_clear();return pts
p1=positions(1);p2=positions(91);p3=positions(181)
report={'animation':'Meditation_Breath_6s','fps':s.render.fps,'frame_start':s.frame_start,'frame_end':s.frame_end,'head_max_movement_m':max((a-b).length for a,b in zip(p1,p2)),'loop_endpoint_max_error_m':max((a-b).length for a,b in zip(p1,p3)),'mesh_objects':sum(o.type=='MESH' for o in bpy.data.collections['01 • Meditation master'].objects),'missing_image_files':[i.name for i in bpy.data.images if i.source=='FILE' and not i.packed_file and not Path(bpy.path.abspath(i.filepath)).exists()]}
(OUT/'validation.json').write_text(json.dumps(report,indent=2))
assert report['head_max_movement_m']>.001
assert report['loop_endpoint_max_error_m']<.00001
assert not report['missing_image_files']
s.frame_set(1)
cam=s.camera
cam.location=(1.8,-2.5,1.20);cam.rotation_euler=(Vector((0,0,.62))-cam.location).to_track_quat('-Z','Y').to_euler()
s.render.filepath=str(OUT/'previews/meditation-master-three-quarter.png');bpy.ops.render.render(write_still=True)
cam.location=(.13,-2.3,1.05);cam.rotation_euler=(Vector((0,-.025,.92))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.59
s.render.resolution_x=1100;s.render.resolution_y=1100;s.render.filepath=str(OUT/'previews/meditation-master-face.png');bpy.ops.render.render(write_still=True)
print('FINALIZE_COMPLETE',flush=True)
