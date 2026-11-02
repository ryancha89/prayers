"""Rebuild the hall Buddha from the NMK public scan with separately reconstructed hands.

Blender -b assets/mountain-temple/mountain_temple_textured.blend \
 --python-exit-code 1 --python 3d-modeling/buddha/scripts/rebuild_buddha.py [-- draft]

Source: National Museum of Korea, Iron Seated Buddha, bon005191, KOGL Type 1.
Hands, urna inlay, gilding and placement are an interpretive adaptation, not an archaeological restoration.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
WORK=ROOT/'3d-modeling/buddha'
ASSETS=ROOT/'assets/mountain-temple'
DRAFT='draft' in sys.argv
HALL=bpy.context.scene
ORIGINAL_SEATS={o.name:tuple(float(v) for row in o.matrix_world for v in row)
                for o in bpy.data.objects if o.name.startswith('Seat_')}
SOURCE=WORK/'source/bon005191-000-30000.obj'
SCALE=2.12/2.582567467
ORIGIN=Vector((0,7.15,3.37))
COLL=bpy.data.collections.new('Buddha_Rebuilt')
HALL.collection.children.link(COLL)
CREATED=[]


def local_mesh(name,vertices,faces,material):
    me=bpy.data.meshes.new(name)
    me.from_pydata(vertices,[],faces)
    me.update()
    ob=bpy.data.objects.new(name,me)
    COLL.objects.link(ob)
    ob.data.materials.append(material)
    for p in me.polygons:p.use_smooth=True
    CREATED.append(ob)
    return ob


def move_to_collection(ob):
    for c in list(ob.users_collection):c.objects.unlink(ob)
    COLL.objects.link(ob)
    CREATED.append(ob)


gold=bpy.data.materials['TEMPLE_Gold'].copy()
gold.name='BUDDHA_GildedBronze'
principled=next(n for n in gold.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
for link in list(gold.node_tree.links):
    if link.to_socket==principled.inputs['Roughness']:gold.node_tree.links.remove(link)
principled.inputs['Roughness'].default_value=.48
principled.inputs['Metallic'].default_value=.78
principled.inputs['Coat Weight'].default_value=.025
hair=bpy.data.materials.new('BUDDHA_DarkPatinatedCurls')
hair.use_nodes=True
hb=hair.node_tree.nodes['Principled BSDF']
hb.inputs['Base Color'].default_value=(.055,.033,.012,1)
hb.inputs['Metallic'].default_value=.70
hb.inputs['Roughness'].default_value=.52

# Replace the old oversized blob petals with a proportioned double-lotus pedestal.
old=bpy.data.objects.get('Buddha_gold')
assert old is not None
bpy.data.objects.remove(old,do_unlink=True)
verts=[];faces=[]
profile=[(.94,0),(.98,.035),(.98,.09),(.93,.125),(.82,.17),(.70,.24),
         (.70,.30),(.78,.34),(.88,.40),(.94,.54),(.96,.67),(.94,.78),(.92,.84),(0,.84)]
for radius,z in profile:
    for k in range(128):
        a=math.tau*k/128;verts.append((radius*math.cos(a),7.15+radius*math.sin(a),2.53+z))
for i in range(len(profile)-1):
    for k in range(128):
        j=(k+1)%128;faces.append((i*128+k,i*128+j,(i+1)*128+j,(i+1)*128+k))
faces.append(tuple(reversed(range(128))))
old=local_mesh('Buddha_LotusPedestal',verts,faces,gold)
for row,count,z0,height,r0,width,inverted in [
    (0,20,2.91,.30,.90,.14,True),(1,16,2.98,.39,.95,.16,False)]:
    verts=[];faces=[];nt=24;ns=12
    for petal in range(count):
        angle=math.tau*(petal+.5*(row%2))/count
        offset=len(verts)
        for i in range(nt+1):
            t=i/nt;bulge=math.sin(math.pi*t)
            broad=max(.003,bulge**.72)
            for j in range(ns+1):
                across=2*j/ns-1
                phi=angle+across*width*broad/r0
                r=r0+.13*bulge+.025*(1-across*across)*bulge
                z=z0+height*(1-t if inverted else t)
                verts.append((r*math.cos(phi),7.15+r*math.sin(phi),z))
        for i in range(nt):
            for j in range(ns):
                a=offset+i*(ns+1)+j;faces.append((a,a+1,a+ns+2,a+ns+1))
    petals=local_mesh('Buddha_LotusPetals_'+str(row+1),verts,faces,gold)
    solid=petals.modifiers.new('Cast lotus petal thickness','SOLIDIFY');solid.thickness=.009
    solid.offset=0
old_body=bpy.data.objects.get('Buddha_Body')
if old_body:bpy.data.objects.remove(old_body,do_unlink=True)

# OBJ coordinates are millimetres, Z up, facing -Y. Keep the source scan intact on disk.
images_before=set(bpy.data.images)
bpy.ops.wm.obj_import(filepath=str(SOURCE),forward_axis='Y',up_axis='Z')
body=bpy.context.object
body.name='Buddha_Body_NMK'
for v in body.data.vertices:v.co*=.001
body.data.update()
bm=bmesh.new();bm.from_mesh(body.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0008)
for _ in range(3):
    bmesh.ops.smooth_vert(bm,verts=[v for v in bm.verts if v.co.z<1.70],factor=.22,
                         use_axis_x=True,use_axis_y=True,use_axis_z=True)
bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=128)
bm.to_mesh(body.data);bm.free();body.data.update()
if body.data.has_custom_normals:
    body.data.normals_split_custom_set([(0,0,0)]*len(body.data.loops))
imported_materials=list(body.data.materials)
body.data.materials.clear();body.data.materials.append(gold);body.data.materials.append(hair)
for m in imported_materials:
    if m.users==0:bpy.data.materials.remove(m)
for im in list(bpy.data.images):
    if im not in images_before and im.users==0:bpy.data.images.remove(im)
for p in body.data.polygons:
    p.use_smooth=True
    center=p.center
    if center.z>2.22 or (center.z>1.80 and center.y>.18):p.material_index=1
for edge in body.data.edges:edge.use_edge_sharp=False
sub=body.modifiers.new('Scan surface refinement','SUBSURF')
sub.levels=1;sub.render_levels=1
move_to_collection(body)

# The museum records the original hands as lost. Model them explicitly in the researched mudra.
# All coordinates below use the scan's metre coordinates before the hall scale is applied.
def ellipsoid(bm,center,radii,along=None):
    out=bmesh.ops.create_uvsphere(bm,u_segments=28,v_segments=18,radius=1)
    rotation=Vector((0,0,1)).rotation_difference(Vector(along).normalized()) if along else None
    for v in out['verts']:
        co=Vector((v.co.x*radii[0],v.co.y*radii[1],v.co.z*radii[2]))
        v.co=Vector(center)+(rotation@co if rotation else co)


def tube(bm,points,radii,sides=20):
    points=[Vector(p) for p in points]
    rings=[]
    for i,p in enumerate(points):
        direction=(points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized()
        a=direction.cross(Vector((0,1,0)))
        if a.length<.001:a=direction.cross(Vector((1,0,0)))
        a.normalize();b=direction.cross(a).normalized()
        ring=[]
        for k in range(sides):
            t=math.tau*k/sides
            ring.append(bm.verts.new(p+radii[i]*(a*math.cos(t)+b*math.sin(t))))
        rings.append(ring)
    for one,two in zip(rings,rings[1:]):
        for j in range(sides):bm.faces.new((one[j],one[(j+1)%sides],two[(j+1)%sides],two[j]))
    bm.faces.new(list(reversed(rings[0])));bm.faces.new(rings[-1])
    for end,r in ((points[0],radii[0]),(points[-1],radii[-1])):ellipsoid(bm,end,(r,r,r))


def remove_voxel_dust(mesh):
    """Discard only sub-millimetre islands left by the voxel/smoothing pass."""
    bm=bmesh.new();bm.from_mesh(mesh)
    todo=set(bm.verts);dust=[]
    while todo:
        seed=todo.pop();group={seed};stack=[seed]
        while stack:
            v=stack.pop()
            for e in v.link_edges:
                other=e.other_vert(v)
                if other in todo:todo.remove(other);group.add(other);stack.append(other)
        span=max(max(v.co[a] for v in group)-min(v.co[a] for v in group) for a in range(3))
        if len(group)<64 and span<.002:dust.extend(group)
    removed=len(dust)
    if dust:
        bmesh.ops.delete(bm,geom=dust,context='VERTS')
        bm.to_mesh(mesh);mesh.update()
    bm.free()
    return removed


def finish_hand(name,bm):
    me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free()
    ob=bpy.data.objects.new(name,me);COLL.objects.link(ob);CREATED.append(ob)
    ob.data.materials.append(gold)
    bpy.context.view_layer.objects.active=ob
    ob.select_set(True)
    remesh=ob.modifiers.new('Continuous cast hand','REMESH')
    remesh.mode='VOXEL';remesh.voxel_size=.0027;remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=ob.modifiers.new('Sculpt polish','SMOOTH');smooth.factor=.35;smooth.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    remove_voxel_dust(ob.data)
    for p in ob.data.polygons:p.use_smooth=True
    ob.select_set(False)
    return ob


bm=bmesh.new()
tube(bm,[(-.51,-.27,.55),(-.51,-.43,.50),(-.51,-.56,.48)],[.080,.075,.070])
ellipsoid(bm,(-.515,-.67,.44),(.089,.048,.18),along=(0,-.22,-.12))
for x,length,r in [(-.580,.152,.020),(-.542,.202,.023),(-.501,.184,.022),(-.464,.144,.019)]:
    tube(bm,[(x,-.81,.36),(x,-.86,.29),(x+.003,-.88,.36-length)], [r,r*.95,r*.78])
tube(bm,[(-.443,-.65,.46),(-.403,-.77,.40),(-.402,-.86,.34)],[.031,.026,.021])
right=finish_hand('Buddha_RightHand_Bhumisparsha',bm)

bm=bmesh.new()
tube(bm,[(.427,-.115,.59),(.342,-.26,.49),(.272,-.326,.456)],[.086,.072,.065])
ellipsoid(bm,(.208,-.341,.453),(.106,.077,.045))
for y,length,r in [(-.620,.116,.020),(-.582,.143,.023),(-.543,.130,.022),(-.508,.097,.019)]:
    y+=.23
    tube(bm,[(.145,y,.453),(.091,y-.005,.445),(.145-length,y-.009,.467)],[r,r*.95,r*.78])
tube(bm,[(.267,-.400,.457),(.212,-.444,.459),(.134,-.440,.481)],[.029,.025,.020])
left=finish_hand('Buddha_LeftHand_Dhyana',bm)

# Fill the surviving urna recess with a small pale-gold crystal inlay.
bpy.context.view_layer.update()
hits=[]
for x in (-.024,.024):
    hit,point,normal,idx=body.ray_cast(Vector((x,-3,2.083)),Vector((0,1,0)))
    if hit:hits.append(point.y)
gem_y=min(hits)-.008 if hits else -.32
gem=bpy.data.materials.new('BUDDHA_UrnaCrystal');gem.use_nodes=True
gb=gem.node_tree.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value=(.85,.72,.43,1)
gb.inputs['Metallic'].default_value=.35;gb.inputs['Roughness'].default_value=.20
bm=bmesh.new();ellipsoid(bm,(0,gem_y,2.083),(.019,.015,.019))
me=bpy.data.meshes.new('Urna');bm.to_mesh(me);bm.free()
urna=bpy.data.objects.new('Buddha_UrnaInlay',me);COLL.objects.link(urna);CREATED.append(urna)
urna.data.materials.append(gem)

# Transform the new source-space parts together, with their base firmly seated on the lotus.
for ob in (body,right,left,urna):
    for v in ob.data.vertices:v.co=ORIGIN+v.co*SCALE
    ob.data.update()
    ob['source']='National Museum of Korea bon005191; KOGL Type 1' if ob==body else 'Interpretive reconstruction in Blender'

# The old low canopy hid the head. Lift it within the original ceiling clearance.
for ob in bpy.data.objects:
    if ob.name.startswith('Canopy_'):ob.location.z+=.50

# Ensure every connected image texture has a UV layer, including newly textured lanterns.
for ob in bpy.data.objects:
    if ob.type!='MESH' or ob.data.uv_layers:continue
    if not any(slot.material and any(n.type=='TEX_IMAGE' for n in slot.material.node_tree.nodes) for slot in ob.material_slots):continue
    uv=ob.data.uv_layers.new(name='UVMap')
    for poly in ob.data.polygons:
        axis=max(range(3),key=lambda i:abs(poly.normal[i]))
        a,b=((1,2),(0,2),(0,1))[axis]
        for li in poly.loop_indices:
            co=ob.data.vertices[ob.data.loops[li].vertex_index].co
            uv.data[li].uv=(co[a],co[b])

for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.overlay.show_overlays=False
            a.spaces.active.shading.type='MATERIAL'
            a.spaces.active.shading.use_scene_lights=True
            a.spaces.active.shading.use_scene_world=True
            a.spaces.active.region_3d.view_perspective='CAMERA'

# Use an independent neutral studio to check the same geometry without hall lighting/occlusion.
STUDIO=bpy.data.scenes.new('Buddha_Study')
for ob in CREATED:STUDIO.collection.objects.link(ob)
STUDIO.world=bpy.data.worlds.new('Buddha_StudioWorld');STUDIO.world.use_nodes=True
STUDIO.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.055,.060,.075,1)
STUDIO.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.40
STUDIO.render.engine='CYCLES';STUDIO.cycles.samples=20 if DRAFT else 48;STUDIO.cycles.use_denoising=True
STUDIO.render.resolution_x=900;STUDIO.render.resolution_y=1050;STUDIO.render.resolution_percentage=100
STUDIO.view_settings.view_transform='AgX';STUDIO.view_settings.look='AgX - Medium High Contrast'
target=Vector((0,7.15,3.98))
for name,loc,power,color,size in [
    ('Buddha_StudioKey',(-3,3,7),700,(1,.88,.70),4),
    ('Buddha_StudioFill',(3,4,5),500,(.72,.83,1),3),
    ('Buddha_StudioRim',(1,10,6),600,(1,.75,.40),3)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    ob=bpy.data.objects.new(name,d);STUDIO.collection.objects.link(ob);ob.location=loc
    ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('Buddha_StudioCamera',bpy.data.cameras.new('Buddha_StudioCamera'))
STUDIO.collection.objects.link(cam);STUDIO.camera=cam;cam.data.type='ORTHO'
cam.data.ortho_scale=3.35

HALL.camera=bpy.data.objects['texture_detail']
HALL.cycles.samples=20 if DRAFT else 48
HALL.render.resolution_x=1280 if DRAFT else 1600
HALL.render.resolution_y=720 if DRAFT else 900
notes=bpy.data.texts.get('BUDDHA_README') or bpy.data.texts.new('BUDDHA_README')
notes.clear();notes.write((WORK/'README.md').read_text())
HALL['buddha_attribution']='National Museum of Korea, Iron Seated Buddha bon005191. KOGL Type 1. Adapted with reconstructed hands, inlay, lotus pedestal and gilding.'
bpy.ops.file.pack_all()
bpy.context.window.scene=HALL
OUT=ASSETS/'mountain_temple_buddha.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT))

renders=[]
for name,location,aim,ortho in [
    ('front',(0,1,4.0),target,3.35),
    ('three_quarter',(-4,2.2,4.4),target,3.35),
    ('side',(-6,7.15,4.0),target,3.35),
    ('back',(0,13,4.0),target,3.35),
    ('face',(0,3,5.0),Vector((0,7.15,5.0)),1.15),
]:
    cam.location=location;cam.rotation_euler=(Vector(aim)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=ortho
    STUDIO.render.filepath=str(WORK/'previews'/f'buddha_{name}.png')
    bpy.ops.render.render(write_still=True,scene=STUDIO.name)
    renders.append(STUDIO.render.filepath)
    print('BUDDHA_RENDER',name,flush=True)

for name in (['texture_detail'] if DRAFT else ['texture_detail','interior']):
    HALL.camera=bpy.data.objects[name]
    HALL.render.filepath=str(WORK/'previews'/f'hall_{name}.png')
    bpy.ops.render.render(write_still=True,scene=HALL.name)
    renders.append(HALL.render.filepath)
    print('HALL_RENDER',name,flush=True)

assert ORIGINAL_SEATS=={o.name:tuple(float(v) for row in o.matrix_world for v in row)
                for o in bpy.data.objects if o.name.startswith('Seat_')}
report={'source':'National Museum of Korea bon005191','license':'KOGL Type 1 — attribution',
        'source_url':'https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=510&schM=view&searchId=search',
        'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'source_triangles':len(body.data.polygons),'statue_height_m':2.12,
        'reconstructed_parts':['right earth-touching hand','left palm-up hand','urna inlay'],
        'canopy_lift_m':.50,'seats_preserved':len(ORIGINAL_SEATS),'renders':renders,
        'artifact':str(OUT),'archaeological_replica':False,'mobile_performance_tested':False}
(WORK/'output/validation.json').write_text(json.dumps(report,indent=2))
HALL.camera=bpy.data.objects['texture_detail']
bpy.context.window.scene=HALL
if not DRAFT:
    bpy.ops.object.select_all(action='DESELECT')
    for ob in HALL.objects:
        if ob.type in ('MESH','EMPTY'):ob.select_set(True)
    bpy.ops.export_scene.fbx(filepath=str(ASSETS/'mountain_temple_buddha.fbx'),
        use_selection=True,apply_unit_scale=True,object_types={'MESH','EMPTY'},
        mesh_smooth_type='FACE',path_mode='COPY',embed_textures=True)
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
print('BUDDHA_REBUILD_COMPLETE',str(OUT),flush=True)
