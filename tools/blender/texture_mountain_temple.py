"""Apply the reference texture pass to the existing model, retaining geometry and markers.

Blender -b assets/mountain-temple/mountain_temple.blend --python tools/blender/texture_mountain_temple.py
Add -- preview for a quick 960px review render; otherwise render final views and export FBX.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/mountain-temple'
TEX = OUT / 'textures-v2'
PREV = OUT / 'previews-textured'
PREV.mkdir(exist_ok=True)
SC = bpy.context.scene
QUICK = 'preview' in sys.argv
original_objects = {o.name for o in bpy.data.objects}
original_seats = {o.name for o in bpy.data.objects if o.name.startswith('Seat_')}


def image_node(m, filename, data=False):
    n = m.node_tree.nodes.new('ShaderNodeTexImage')
    n.name = filename
    n.label = filename
    n.image = bpy.data.images.load(str(TEX / filename), check_existing=True)
    if data:
        n.image.colorspace_settings.name = 'Non-Color'
    return n


def apply(name, base=None, pbr=None, metal=None, coat=0, normal=.4):
    m = bpy.data.materials['TEMPLE_' + name]
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    if base:
        for n in list(nt.nodes):
            if n.type == 'TEX_IMAGE':
                nt.nodes.remove(n)
        n = image_node(m, base+'.png')
        nt.links.new(n.outputs['Color'], b.inputs['Base Color'])
        # Alpha is only used on cutout cards, not on the opaque silk mural.
        if name in ('Lattice','Halo'):
            nt.links.new(n.outputs['Alpha'], b.inputs['Alpha'])
    if pbr:
        r = image_node(m, pbr+'_roughness.png', True)
        nt.links.new(r.outputs['Color'], b.inputs['Roughness'])
        n = image_node(m, pbr+'_normal.png', True)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal
        nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if metal is not None:
        b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = .23
    # Keep a clear left-to-right material graph.
    textures = [n for n in nt.nodes if n.type == 'TEX_IMAGE']
    for i,n in enumerate(textures):
        n.location = (-650, 300-i*300)
    b.location = (0,200)
    for n in nt.nodes:
        if n.type == 'NORMAL_MAP': n.location=(-260,-200)
        if n.type == 'OUTPUT_MATERIAL': n.location=(340,200)
    return b


for name,base,pbr,coat in (
    ('Floor','wood_floor','wood_floor',.32), ('WoodRed','wood_red','wood_red',.25),
    ('WoodBrown','wood_brown','wood_brown',.13), ('Dancheong','dancheong_beam','paint',.04),
    ('Bracket','dancheong_bracket','paint',.03), ('RafterEnd','dancheong_rafter','paint',.03),
    ('Coffer','coffer','paint',.02), ('Lattice','lattice_door','paint',.08),
    ('Cushion','cushion','fabric',0), ('CushionSide','cushion','fabric',0),
    ('Gold','gold_leaf','gold_leaf',.08), ('Brass','gold_leaf','gold_leaf',.04),
    ('Taenghwa','taenghwa','paper',0), ('Granite','granite','granite',0),
    ('Rock','granite','granite',0), ('RoofTile','roof_tile','roof_tile',.05),
    ('Plaster','plaster','plaster',0),
):
    b = apply(name,base,pbr,coat=coat,normal=.22 if name=='Gold' else .45)
    if name in ('Gold','Brass'): b.inputs['Metallic'].default_value=.88
    if name in ('Cushion','CushionSide'): b.inputs['Sheen Weight'].default_value=.045

# Cover the untextured structural timber and the rough roof ridge with existing PBRs.
for name in ('Green','Soffit'):
    b=apply(name,pbr='paint')
    b.inputs['Base Color'].default_value=(.025,.067,.045,1)
apply('Ridge', 'roof_tile','roof_tile')
apply('Bark','wood_brown','wood_brown')
apply('Bronze',pbr='gold_leaf',metal=.78)

# These meshes had no UV layer in the source. Preserve existing UVs on every other mesh.
for o in bpy.data.objects:
    if o.type!='MESH' or o.data.uv_layers: continue
    if not any(s.material and any(n.type=='TEX_IMAGE' for n in s.material.node_tree.nodes) for s in o.material_slots): continue
    uv=o.data.uv_layers.new(name='UVMap')
    for p in o.data.polygons:
        axis=max(range(3),key=lambda a:abs(p.normal[a]))
        axes=((1,2),(0,2),(0,1))[axis]
        scale=.84 if o.name.startswith('Cushions') else 1.4
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            uv.data[li].uv=(co[axes[0]]/scale,co[axes[1]]/scale)

# A gilded physical leaf texture replaces the flat luminous halo material.
# Keep its original alpha silhouette and transparent surround.
halo=apply('Halo',base='halo',pbr='gold_leaf',metal=.62)
halo.inputs['Emission Strength'].default_value=0

# Light values are a preview setup in Blender; no illumination is painted into base color.
SC.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.20,.24,.34,1)
SC.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.22
sun=bpy.data.objects.get('Sun')
sun.data.energy=2.1
sun.data.color=(1,.66,.36)
sun.data.angle=math.radians(6)
for o in bpy.data.objects:
    if o.type=='LIGHT' and o.data.type=='POINT':
        o.data.energy *= .32
        o.data.color=(1,.57,.26)
        o.data.shadow_soft_size=.65
for name in ('LanternPink','LanternWhite','LanternGold'):
    b=apply(name,pbr='paper')
    b.inputs['Emission Color'].default_value=(1,.49,.15,1)
    b.inputs['Emission Strength'].default_value=.9
    b.inputs['Base Color'].default_value=(.82,.45,.20,1)

# Lantern paper maps are assigned after the general UV pass above.
for ob in bpy.data.objects:
    if ob.type!='MESH' or not ob.name.startswith('Lanterns_lantern') or ob.data.uv_layers:
        continue
    uv=ob.data.uv_layers.new(name='UVMap')
    for poly in ob.data.polygons:
        axis=max(range(3),key=lambda a:abs(poly.normal[a]))
        axes=((1,2),(0,2),(0,1))[axis]
        for li in poly.loop_indices:
            co=ob.data.vertices[ob.data.loops[li].vertex_index].co
            uv.data[li].uv=(co[axes[0]],co[axes[1]])


def area(name,loc,target,power,color,size):
    d=bpy.data.lights.new(name,'AREA')
    d.energy=power
    d.color=color
    d.shape='DISK'
    d.size=size
    o=bpy.data.objects.new(name,d)
    bpy.data.collections['Lights'].objects.link(o)
    o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()


area('Texture_AltarKey',(-2,4.6,5.0),(0,7,3.8),250,(1,.66,.31),3)
area('Texture_DoorFill',(0,-8.7,4.3),(0,2,2.3),480,(.46,.59,1),7)
for x in (-6,6):
    area('Texture_WarmPool',(x,-2,5.2),(x,0,1.45),180,(1,.48,.18),2)

SC.render.engine='CYCLES'
SC.cycles.samples=16 if QUICK else 48
SC.cycles.use_denoising=True
SC.cycles.max_bounces=6
SC.cycles.device='CPU'
SC.view_settings.view_transform='AgX'
SC.view_settings.look='AgX - Medium High Contrast'
SC.view_settings.exposure=.1
SC.render.image_settings.file_format='PNG'
SC.render.resolution_percentage=100
SC.render.resolution_x,SC.render.resolution_y=(960,540) if QUICK else (1600,900)
SC.render.film_transparent=False

# Gentle optical glow around lamps, with no broad fog hiding texture detail.
nt=bpy.data.node_groups.new('Temple warm lamp glow','CompositorNodeTree')
SC.compositing_node_group=nt
nt.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
rl=nt.nodes.new('CompositorNodeRLayers')
glow=nt.nodes.new('CompositorNodeGlare')
glow.inputs['Type'].default_value='Fog Glow'
glow.inputs['Quality'].default_value='High'
glow.inputs['Threshold'].default_value=1.6
glow.inputs['Strength'].default_value=.22
comp=nt.nodes.new('NodeGroupOutput')
nt.links.new(rl.outputs['Image'],glow.inputs['Image'])
nt.links.new(glow.outputs['Image'],comp.inputs['Image'])

cam=bpy.data.objects.get('texture_detail')
if cam is None:
    cam=bpy.data.objects.new('texture_detail',bpy.data.cameras.new('texture_detail'))
    bpy.data.collections['Cameras'].objects.link(cam)
cam.location=(-4.7,-3.6,2.8)
cam.rotation_euler=(Vector((0,6.7,3.7))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.lens=30
cam.data.clip_end=900

for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.shading.type='MATERIAL'
            a.spaces.active.shading.use_scene_world=True
            a.spaces.active.shading.use_scene_lights=True
            a.spaces.active.region_3d.view_perspective='CAMERA'
SC.camera=bpy.data.objects['interior']

assert original_seats=={o.name for o in bpy.data.objects if o.name.startswith('Seat_')}
assert original_objects.issubset({o.name for o in bpy.data.objects})
# All source maps, including foliage and sky, become portable within the .blend.
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mountain_temple_textured.blend'))

report={'blender':bpy.app.version_string,'seats':len(original_seats),'original_objects_preserved':True,
        'imagegen_assets':['taenghwa.png','cushion.png','halo.png'],'materials':len(bpy.data.materials),
        'images':[{'name':i.name,'packed':bool(i.packed_file),'size':list(i.size)} for i in bpy.data.images if i.type=='IMAGE'],
        'render_engine':'CYCLES','renders':[]}
views=['interior'] if QUICK else ['interior','texture_detail','exterior']
for name in views:
    SC.camera=bpy.data.objects[name]
    SC.render.filepath=str(PREV/(name+('_draft' if QUICK else '')+'.png'))
    bpy.ops.render.render(write_still=True)
    report['renders'].append(SC.render.filepath)
    print('RENDERED',name,flush=True)

if not QUICK:
    # Only mesh + game markers. Runtime engines need to reconstruct PBR shaders.
    bpy.ops.export_scene.fbx(filepath=str(OUT/'mountain_temple_textured.fbx'),
        use_selection=False,apply_unit_scale=True,object_types={'MESH','EMPTY'},
        mesh_smooth_type='FACE',path_mode='COPY',embed_textures=True)
SC.camera=bpy.data.objects['interior']
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mountain_temple_textured.blend'))
(OUT/'texture_validation.json').write_text(json.dumps(report,indent=2))
print('TEXTURE_PASS_COMPLETE',len(original_seats),'seats',flush=True)
