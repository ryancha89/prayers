"""Build mobile FBXs compatible with Prayers' existing LunaImporter material map.

Blender -b --python 3d-modeling/luna/scripts/optimize_luna.py
Output: output/mobile/{Luna_Avatar.fbx,Luna_LOD1.fbx,luna_mobile.blend,textures/,metrics.json}
"""
import bpy
import json
import math
import hashlib
from pathlib import Path
import numpy as np
from mathutils import Matrix

HERE = Path(__file__).resolve().parents[1]
OUT = HERE / 'output/mobile'
TEX = OUT / 'textures'
for folder in (OUT,TEX): folder.mkdir(parents=True,exist_ok=True)
(OUT/'metrics.json').unlink(missing_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(HERE / 'output/luna_refined.blend'))
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
rig=bpy.data.objects['Armature']
for pb in rig.pose.bones: pb.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
PROPS={'CO_Lantern_Prop','CO_Lantern_Core'}
IDENTITY={'Face_Geo','Body_Geo','Mouth_Geo','EBrows_Geo'}
def character_meshes():
    return [o for o in scene.objects if o.type=='MESH' and (o.parent==rig or any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers))]
def tris(o):
    return sum(len(p.vertices)-2 for p in o.data.polygons)
def select(*objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
base_meshes=character_meshes()
report={'source':'../luna_refined.blend','target':'Prayers / Unity 6000.0.56f1 / f_char_luna',
        'before':{'triangles':sum(tris(o) for o in base_meshes),'meshes':len(base_meshes),
                  'material_slots':sum(len(o.data.materials) for o in base_meshes)},
        'bones':len(rig.data.bones),'preserved_renderers':sorted(IDENTITY),
        'texture_limit':1024,'runtime_profiled':False,'lods':{}}

# A single opaque skirt surface carries ivory and navy panels. Separate almost
# coplanar opaque sheets intersect over the knees in the seated dialogue clips.
for name in ('CO_Skirt_NavyPanels','CO_Skirt_FrontPanel'):
    o=bpy.data.objects.get(name)
    if o: bpy.data.objects.remove(o,do_unlink=True)
base_meshes=character_meshes()

def pixels(image,size):
    tmp=image.copy(); tmp.scale(size,size)
    data=np.empty(size*size*4,dtype=np.float32); tmp.pixels.foreach_get(data)
    bpy.data.images.remove(tmp)
    return data.reshape(size,size,4)
def source_image(material):
    p=material.node_tree.nodes.get('Principled BSDF')
    if p and p.inputs['Base Color'].links:
        n=p.inputs['Base Color'].links[0].from_node
        if n.type=='TEX_IMAGE': return n.image
    return None
def make_image(name,data):
    img=bpy.data.images.new(name,width=data.shape[1],height=data.shape[0],alpha=True)
    img.pixels.foreach_set(data.ravel())
    img.file_format='PNG'; img.filepath_raw=str(TEX/name)
    img.save()
    return img
def texmat(name,image,rough):
    old=bpy.data.materials.get(name)
    if old: old.name='Source_'+name
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes['Principled BSDF']; p.inputs['Roughness'].default_value=rough
    p.inputs['Specular IOR Level'].default_value=.28
    n=m.node_tree.nodes.new('ShaderNodeTexImage'); n.image=image
    m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
    return m

# Hair atlas: crown UVs occupy the large square, new opaque locks use a narrow
# strand strip. No alpha-tested hair or procedural shader is needed at runtime.
old_hair=bpy.data.materials['CO_Hair_Brown']
hair=np.zeros((1024,1024,4),dtype=np.float32); hair[:]=(.055,.026,.016,1)
hair[:768,:768]=pixels(source_image(old_hair),768)
xx=np.linspace(0,1,256)[None,:]; yy=np.linspace(0,1,1024)[:,None]
striations=.97+.02*np.cos(xx*96*np.pi)+.01*np.sin(xx*217*np.pi+yy*3)
for k,c in enumerate((.248,.172,.132)):
    hair[:,768:,k]=c*striations
hair[:,768:,3]=1
hair_img=make_image('CO_Hair_Brown_BaseColor.png',hair)
hair_mat=texmat('CO_Hair_Brown',hair_img,.58)
hair_mat.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value=.20

# Shared opaque clothes atlas. Existing material / filename contract is retained
# so LunaImporter can remap without a new runtime shader.
cloth=np.zeros((1024,1024,4),dtype=np.float32); cloth[:]=(.035,.025,.075,1)
cloth[:768,:768]=pixels(source_image(bpy.data.materials['CO_Panel_NavyStar']),768)
# Right-hand tile: one continuous skirt fabric, with navy stripes and gold hems.
cloth[:768,768:,:3]=(.94,.91,.96)
cloth[:768,768:,3]=1
for left,right in ((.042,.105),(.455,.545)):
    a=768+round(left*256); b=768+round(right*256)
    cloth[:768,a:b]=cloth[:768,100:100+b-a]
    cloth[:768,a:a+1,:3]=(.74,.57,.32)
    cloth[:768,b-1:b,:3]=(.74,.57,.32)
cloth_materials={}
for o in base_meshes:
    if o.name in IDENTITY or o.name in PROPS or 'Hair' in o.name: continue
    for m in o.data.materials:
        if m and m.name not in ('CO_Gold','CO_GoldAntique','CO_Amethyst','CO_Lantern_Core','CO_Sheer_Lavender'):
            cloth_materials[m.name]=m
palette={}
for i,(name,m) in enumerate(sorted(cloth_materials.items())):
    if name in ('CO_Corset_NavyVelvet','CO_Panel_NavyStar'): continue
    idx=len(palette); x=(idx%8)*128; y=768+(idx//8)*128
    assert y<1024, 'too many palette entries'
    p=m.node_tree.nodes.get('Principled BSDF')
    col=tuple(p.inputs['Base Color'].default_value) if p else tuple(m.diffuse_color)
    if name=='CO_Sheer_Ivory': col=(.88,.83,.94,1)
    # File textures contain sRGB values; convert literal linear swatches to sRGB.
    rgb=np.asarray(col[:3]); rgb=np.where(rgb<=.0031308,12.92*rgb,1.055*np.maximum(rgb,0)**(1/2.4)-.055)
    cloth[y:y+128,x:x+128,:3]=rgb; cloth[y:y+128,x:x+128,3]=1
    palette[name]=((x+64)/1024,(y+64)/1024)
cloth_img=make_image('CO_NavyStarCloth_BaseColor.png',cloth)
cloth_mat=texmat('CO_Panel_NavyStar',cloth_img,.55)
gold=bpy.data.materials['CO_Gold']; gem=bpy.data.materials['CO_Amethyst']
sheer=bpy.data.materials['CO_Sheer_Lavender']

def uv_layer(o):
    return o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
def map_square(uv):
    # Keep sampling inside each tile even with mipmaps.
    return ((8+min(1,max(0,uv.x))*752)/1024,(8+min(1,max(0,uv.y))*752)/1024)

# Collapse all unnecessary material distinctions before joining the meshes.
groups={'CO_Hair_Long':[],'CO_Mobile_Cloth':[],'CO_Mobile_Jewelry':[],'CO_Mobile_Sheer':[]}
for o in base_meshes:
    if o.name in IDENTITY or o.name in PROPS: continue
    old=list(o.data.materials); names=[m.name for m in old]
    is_hair=o.name.startswith('Hair') or o.name.startswith('Luna_Hair')
    uv=uv_layer(o)
    if is_hair:
        crown=o.name in ('HairF_Geo','HairB_Geo')
        for loop in uv.data:
            u,v=loop.uv
            loop.uv=map_square(loop.uv) if crown else ((784+max(0,min(1,u))*224)/1024,(8+max(0,min(1,v))*1008)/1024)
        o.data.materials.clear(); o.data.materials.append(hair_mat)
        for p in o.data.polygons: p.material_index=0
        groups['CO_Hair_Long'].append(o)
    else:
        mapped=[]
        for m in old:
            name=m.name
            if name in ('CO_Gold','CO_GoldAntique'): mapped.append(gold)
            elif name=='CO_Amethyst': mapped.append(gem)
            elif name=='CO_Sheer_Lavender': mapped.append(sheer)
            else: mapped.append(cloth_mat)
        for p in o.data.polygons:
            name=names[p.material_index]
            if mapped[p.material_index]==cloth_mat:
                for li in p.loop_indices:
                    if o.name=='CO_Skirt_Under':
                        u,v=uv.data[li].uv
                        uv.data[li].uv=((772+u*248)/1024,(8+v*752)/1024)
                    elif name in ('CO_Corset_NavyVelvet','Source_CO_Panel_NavyStar'):
                        uv.data[li].uv=map_square(uv.data[li].uv)
                    else: uv.data[li].uv=palette.get(name,(.06,.82))
        indices=[p.material_index for p in o.data.polygons]
        o.data.materials.clear()
        for m in mapped: o.data.materials.append(m)
        for p,index in zip(o.data.polygons,indices): p.material_index=index
        if all(m==sheer for m in mapped): group='CO_Mobile_Sheer'
        elif all(m in (gold,gem) for m in mapped): group='CO_Mobile_Jewelry'
        else: group='CO_Mobile_Cloth'
        groups[group].append(o)

# Remove render-only subdivisions; keep the already adequate cloth grid and rig.
for o in base_meshes:
    select(o)
    for mod in list(o.modifiers):
        if mod.type=='ARMATURE': continue
        if mod.type=='SMOOTH': bpy.ops.object.modifier_apply(modifier=mod.name)
        else: o.modifiers.remove(mod)
    if o.name not in ('Face_Geo','Mouth_Geo','EBrows_Geo'):
        ratio=.15 if o.name.startswith('Luna_Hair') else .52
        if o.name.startswith('Luna_Hair_Mantle'): ratio=.30
        if o.name=='HairF_Geo': ratio=1.0  # Preserve sculpted fringe overlaps in portraits.
        if o.name=='HairB_Geo': ratio=.35
        if o.name.startswith('Luna_Bow'): ratio=.8
        if o.name=='Body_Geo': ratio=.45
        if o.name.startswith('CO_Skirt') or o.name.startswith('CO_Sleeve'): ratio=.72
        if tris(o)>60:
            mod=o.modifiers.new('Mobile silhouette reduction','DECIMATE'); mod.ratio=ratio
            mod.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=mod.name)
    # Export only four normalized bone weights per vertex, matching the importer.
    if o.parent_type!='BONE':
        bpy.ops.object.vertex_group_limit_total(limit=4)
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)

for name,objects in groups.items():
    if not objects: continue
    select(*objects); bpy.ops.object.join(); o=bpy.context.object; o.name=name; o.data.name=name
    # Blender join merges identical material datablocks; remove unused slots too.
    bpy.ops.object.material_slot_remove_unused()
    if name=='CO_Mobile_Jewelry':
        mod=o.modifiers.new('Small ornament budget','DECIMATE'); mod.ratio=.50
        mod.use_collapse_triangulate=True; bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    arm=[m for m in o.modifiers if m.type=='ARMATURE']
    assert len(arm)==1 and arm[0].object==rig

# Export every used image at 1024 or less, without changing the preserved source.
used_materials={m for o in character_meshes() for m in o.data.materials if m}
used_images={n.image for m in used_materials for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}
texture_rows=[]
for img in list(used_images):
    if img not in (hair_img,cloth_img):
        dest=TEX/Path(img.filepath).name
        if img.size[0]>1024 or img.size[1]>1024:
            scale=1024/max(img.size); img.scale(round(img.size[0]*scale),round(img.size[1]*scale))
        if img.packed_file: img.unpack(method='REMOVE')
        img.filepath_raw=str(dest); img.file_format='PNG'; img.save()
    texture_rows.append({'name':Path(img.filepath).name,'size':list(img.size)})
    img.pack()
report['textures']=texture_rows

def mesh_metrics():
    meshes=character_meshes(); active=[o for o in meshes if o.name not in PROPS]
    return {'triangles':sum(tris(o) for o in meshes),'active_triangles':sum(tris(o) for o in active),
            'meshes':len(meshes),'active_skinned_renderers':len(active),
            'active_material_slots':sum(len(o.data.materials) for o in active),
            'unique_materials':len({m for o in active for m in o.data.materials}),
            'per_mesh':{o.name:{'triangles':tris(o),'slots':len(o.data.materials)} for o in meshes}}
def export(name):
    select(rig,*character_meshes())
    bpy.ops.export_scene.fbx(filepath=str(OUT/name),use_selection=True,object_types={'ARMATURE','MESH'},
        axis_forward='-Z',axis_up='Y',global_scale=1,apply_unit_scale=True,apply_scale_options='FBX_SCALE_NONE',
        use_mesh_modifiers=True,mesh_smooth_type='FACE',add_leaf_bones=False,primary_bone_axis='Y',secondary_bone_axis='X',
        armature_nodetype='NULL',bake_anim=False,path_mode='RELATIVE',embed_textures=False,use_custom_props=False)

report['lods']['LOD0']=mesh_metrics()
assert report['lods']['LOD0']['active_triangles']<45000,report['lods']['LOD0']
assert report['lods']['LOD0']['active_skinned_renderers']<=8
assert report['lods']['LOD0']['active_material_slots']<=14
export('Luna_Avatar.fbx')
for name in PROPS: bpy.data.objects[name].hide_render=True; bpy.data.objects[name].hide_set(True)
reference=bpy.data.objects.get('Luna • original concept sheet')
if reference: bpy.data.objects.remove(reference,do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)
scene.camera=bpy.data.objects['Luna • 02 Three-quarter']
scene.cycles.samples=24
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'luna_mobile.blend'))

# Optional distant LOD. Keep the face/brows/mouth intact for speech and blinking.
for o in character_meshes():
    if o.name in ('Face_Geo','Mouth_Geo','EBrows_Geo') or o.name in PROPS: continue
    select(o); mod=o.modifiers.new('Distant view reduction','DECIMATE'); mod.ratio=.47
    mod.use_collapse_triangulate=True; bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
report['lods']['LOD1']=mesh_metrics()
assert report['lods']['LOD1']['active_triangles']<25000
export('Luna_LOD1.fbx')
report['source_triangle_reduction_percent']=round(100*(1-report['lods']['LOD0']['triangles']/report['before']['triangles']),1)
report['artifact_hashes']={str(p.relative_to(OUT)):hashlib.sha256(p.read_bytes()).hexdigest()
                           for p in [OUT/'Luna_Avatar.fbx',OUT/'Luna_LOD1.fbx',*sorted(TEX.glob('*.png'))]}
(OUT/'metrics.json').write_text(json.dumps(report,indent=2))
print('MOBILE_REPORT',json.dumps(report),flush=True)
