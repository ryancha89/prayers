"""Reimport mobile FBXs, compare the rig, exercise every f_char_003 clip and render.

Blender -b --python 3d-modeling/luna/scripts/verify_mobile.py
Uses the companion Unity project's original clips; never edits that project.
"""
import bpy
import json
import math
import hashlib
from pathlib import Path
from mathutils import Vector, Matrix

HERE=Path(__file__).resolve().parents[1]
OUT=HERE/'output/mobile'
(OUT/'verification.json').unlink(missing_ok=True)
metrics=json.loads((OUT/'metrics.json').read_text())
for name,digest in metrics['artifact_hashes'].items():
    assert hashlib.sha256((OUT/name).read_bytes()).hexdigest()==digest,name
PREV=HERE/'previews/mobile'; PREV.mkdir(parents=True,exist_ok=True)
CLIPS=Path('/Users/namaste/git/saju_fullstack/saju_world_unity_hall/Assets/Art/1.character/f_char_003/3.animation')
bpy.ops.wm.open_mainfile(filepath=str(HERE/'output/luna_refined.blend'))
original=bpy.data.objects['Armature']
rest={b.name:(b.parent.name if b.parent else None,b.matrix_local.copy()) for b in original.data.bones}
matrix=original.matrix_world.copy()
identity_counts={n:len(bpy.data.objects[n].data.vertices) for n in ('Face_Geo','Mouth_Geo','EBrows_Geo')}
identity_positions={n:[bpy.data.objects[n].matrix_world@v.co for v in bpy.data.objects[n].data.vertices] for n in identity_counts}
remove=[o for o in bpy.context.scene.objects if o!=original and (o.parent==original or o.type=='EMPTY')]
for o in remove: bpy.data.objects.remove(o,do_unlink=True)
bpy.data.objects.remove(original,do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)

report={'lods':{},'clips':{},'rendered':[],'runtime_device_profiled':False,'artifact_hashes':metrics['artifact_hashes']}
for lod,file in (('LOD0','Luna_Avatar.fbx'),('LOD1','Luna_LOD1.fbx')):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(OUT/file))
    imported=set(bpy.data.objects)-before
    rig=next(o for o in imported if o.type=='ARMATURE')
    bones=rig.data.bones
    missing=sorted(set(rest)-set(bones.keys())); extra=sorted(set(bones.keys())-set(rest))
    parents=[b.name for b in bones if b.name in rest and (b.parent.name if b.parent else None)!=rest[b.name][0]]
    err=max(abs(a-b) for name,(_,m) in rest.items() for ra,rb in zip(m,bones[name].matrix_local) for a,b in zip(ra,rb))
    world_err=max(abs(a-b) for ra,rb in zip(matrix,rig.matrix_world) for a,b in zip(ra,rb))
    meshes=[o for o in imported if o.type=='MESH']
    unweighted={}; influences=0
    for o in meshes:
        if o.parent_type=='BONE': continue
        bad=0
        for v in o.data.vertices:
            weights=[g.weight for g in v.groups if g.weight>1e-6]
            influences=max(influences,len(weights))
            if abs(sum(weights)-1)>.015: bad+=1
        if bad: unweighted[o.name]=bad
    missing_images=[i.filepath for i in bpy.data.images if i.source=='FILE' and i.users and not i.packed_file and not Path(bpy.path.abspath(i.filepath)).exists()]
    data={'missing_bones':missing,'extra_bones':extra,'parent_changes':parents,'rest_matrix_max_error':err,
          'rig_matrix_max_error':world_err,'max_influences':influences,'bad_weights':unweighted,
          'missing_images':missing_images,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)}
    report['lods'][lod]=data
    assert not missing and not extra and not parents and err<.002 and world_err<.0001,data
    assert influences<=4 and not unweighted and not missing_images,data
    if lod=='LOD0':
        retained=imported; retained_rig=rig
        for name,count in identity_counts.items():
            from mathutils.kdtree import KDTree
            kd=KDTree(count)
            for i,p in enumerate(identity_positions[name]): kd.insert(p,i)
            kd.balance()
            o=next(o for o in imported if o.name==name)
            error=max(kd.find(o.matrix_world@v.co)[2] for v in o.data.vertices)
            assert error<.0001,(name,error)
    else:
        for o in imported: bpy.data.objects.remove(o,do_unlink=True)

rig=retained_rig
meshes=[o for o in retained if o.type=='MESH']
for o in meshes:
    if o.name.startswith('CO_Lantern'): o.hide_render=True
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=16; scene.cycles.use_denoising=True
scene.render.resolution_x=800; scene.render.resolution_y=1040
scene.render.resolution_percentage=100
cam=bpy.data.objects['Luna • 01 Front']
def render(tag,location,target,scale=2.1,square=False):
    cam.location=location; cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO'; cam.data.ortho_scale=scale; scene.camera=cam
    scene.render.resolution_y=800 if square else 1040
    scene.render.filepath=str(PREV/(tag+'.png'))
    bpy.ops.render.render(write_still=True); report['rendered'].append(tag)
def reset():
    rig.animation_data_clear()
    for p in rig.pose.bones: p.matrix_basis=Matrix.Identity(4)
    scene.frame_set(0); bpy.context.view_layer.update()

reset()
render('front',(0,-4,1),(0,0,.92))
render('side',(4,0,1),(0,0,.92))
render('back',(0,4,1),(0,0,.92))
render('face',(.16,-3,1.67),(0,0,1.60),.53,True)

shots={'Female_SitIdle','Female_Talking','Female_SitSoftLaugh','Female_Walk'}
for clip in sorted(CLIPS.glob('*.fbx')):
    reset()
    before=set(bpy.data.objects); actions=set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(clip))
    new_actions=set(bpy.data.actions)-actions
    for o in set(bpy.data.objects)-before: bpy.data.objects.remove(o,do_unlink=True)
    assert new_actions,clip.name
    action=next(iter(new_actions))
    rig.animation_data_create(); rig.animation_data.action=action
    if action.slots: rig.animation_data.action_slot=action.slots[0]
    lo,hi=action.frame_range
    frames=[]
    for frac in (.2,.5,.8):
        scene.frame_set(round(lo+(hi-lo)*frac))
        dg=bpy.context.evaluated_depsgraph_get(); points=[]
        for o in meshes:
            if o.hide_render: continue
            ev=o.evaluated_get(dg); mesh=ev.to_mesh()
            points.extend(ev.matrix_world@v.co for v in mesh.vertices); ev.to_mesh_clear()
        assert all(math.isfinite(v) for p in points for v in p),clip.name
        bmin=Vector([min(p[k] for p in points) for k in range(3)])
        bmax=Vector([max(p[k] for p in points) for k in range(3)])
        assert max(bmax-bmin)<3.5,(clip.name,list(bmin),list(bmax))
        frames.append({'frame':scene.frame_current,'bbox':[list(bmin),list(bmax)]})
        if frac==.5 and clip.stem in shots:
            center=(bmin+bmax)/2
            render('anim_'+clip.stem,center+Vector((.2,-4,.25)),center,max(bmax-bmin)*1.2)
    report['clips'][clip.stem]=frames
    print('CLIP_OK',clip.stem,flush=True)
reset()
report['passed']=True
(OUT/'verification.json').write_text(json.dumps(report,indent=2))
print('VERIFY_OK',len(report['clips']),'clips x 3 frames',flush=True)
