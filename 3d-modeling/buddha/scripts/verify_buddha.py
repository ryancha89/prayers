"""Validate the saved deliverable against the temple before the Buddha replacement."""
import hashlib
import json
from pathlib import Path
import bmesh
import bpy
import numpy as np

ROOT=Path(__file__).resolve().parents[3]
WORK=ROOT/'3d-modeling/buddha'
ASSET=ROOT/'assets/mountain-temple'


def mesh_hashes():
    result={}
    for o in bpy.data.objects:
        if o.type!='MESH' or o.name.startswith('Buddha'):continue
        v=np.empty(len(o.data.vertices)*3,dtype=np.float32)
        indices=np.empty(len(o.data.loops),dtype=np.int32)
        o.data.vertices.foreach_get('co',v);o.data.loops.foreach_get('vertex_index',indices)
        result[o.name]=hashlib.sha256(v.tobytes()+indices.tobytes()).hexdigest()
    return result


def markers():
    return {o.name:list(float(v) for row in o.matrix_world for v in row)
            for o in bpy.data.objects if o.type=='EMPTY'}


bpy.ops.wm.open_mainfile(filepath=str(ASSET/'mountain_temple_textured.blend'))
source_hashes=mesh_hashes();source_markers=markers()
source_canopy={o.name:tuple(o.location) for o in bpy.data.objects if o.name.startswith('Canopy_')}
bpy.ops.wm.open_mainfile(filepath=str(ASSET/'mountain_temple_buddha.blend'))
assert source_hashes==mesh_hashes(), 'Unrelated temple mesh geometry changed'
assert source_markers==markers(), 'Game marker transforms changed'
for name,loc in source_canopy.items():
    assert abs(bpy.data.objects[name].location.z-loc[2]-.5)<1e-5
body=bpy.data.objects['Buddha_Body_NMK']
height=max(v.co.z for v in body.data.vertices)-min(v.co.z for v in body.data.vertices)
assert abs(height-2.12)<.005
assert 'Buddha_Body' not in bpy.data.objects and 'Buddha_gold' not in bpy.data.objects
assert 'BUDDHA_README' in bpy.data.texts
assert 'National Museum of Korea' in bpy.context.scene.get('buddha_attribution','')

used_images=set()
for o in bpy.data.objects:
    if o.type!='MESH':continue
    for slot in o.material_slots:
        if not slot.material or not slot.material.use_nodes:continue
        images=[n.image for n in slot.material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]
        if images:assert o.data.uv_layers, f'Missing UVs: {o.name}'
        used_images.update(images)
for im in used_images:
    assert im.packed_file and im.size[0] and im.size[1], f'Missing image: {im.name}'
    if im.filepath.endswith(('_roughness.png','_normal.png')):assert im.colorspace_settings.name=='Non-Color'

hands={}
for name in ('Buddha_RightHand_Bhumisparsha','Buddha_LeftHand_Dhyana'):
    ob=bpy.data.objects[name];bm=bmesh.new();bm.from_mesh(ob.data)
    todo=set(bm.verts);components=0
    while todo:
        start=todo.pop();stack=[start];components+=1
        while stack:
            v=stack.pop()
            for e in v.link_edges:
                other=e.other_vert(v)
                if other in todo:todo.remove(other);stack.append(other)
    assert components==1, f'Disconnected hand components: {name}: {components}'
    hands[name]={'components':components,'polygons':len(ob.data.polygons)}
    bm.free()

report_path=WORK/'output/validation.json'
report=json.loads(report_path.read_text())
assert len(report['renders'])==7
assert all(Path(p).stat().st_size>10000 for p in report['renders'])
fbx=ASSET/'mountain_temple_buddha.fbx'
assert fbx.stat().st_size>1000000
report.update(unrelated_temple_mesh_hashes_preserved=True,all_game_markers_preserved=True,
              all_used_images_packed=True,used_images=len(used_images),
              textured_meshes_have_uv=True,hands=hands,
              file_sha256=hashlib.sha256((ASSET/'mountain_temple_buddha.blend').read_bytes()).hexdigest(),
              fbx_sha256=hashlib.sha256(fbx.read_bytes()).hexdigest())
report_path.write_text(json.dumps(report,indent=2))
print('BUDDHA_VERIFIED',json.dumps({'height_m':height,'images':len(used_images),'hands':hands,
      'temple_preserved':True,'markers_preserved':True,'renders':len(report['renders'])}))
