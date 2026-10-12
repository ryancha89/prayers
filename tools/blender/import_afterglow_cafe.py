"""Import the actual Unity cafe geometry/materials into an editable Blender review scene."""
import bpy, json, math, os, bmesh
from mathutils import Vector
ROOT='/Users/namaste/git/prayers/assets/afterglow-cafe'
with open(ROOT+'/cafe-scene.json') as f: data=json.load(f)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name!='Collection' and collection.users==0: bpy.data.collections.remove(collection)
materials=[]
for m in data['materials']:
    mat=bpy.data.materials.new(m['name']); mat.use_nodes=True
    nodes=mat.node_tree.nodes; links=mat.node_tree.links; bs=nodes.get('Principled BSDF')
    c={k: v**2.2 if k!='a' else v for k,v in m['color'].items()}; bs.inputs['Base Color'].default_value=(c['r'],c['g'],c['b'],1)
    bs.inputs['Metallic'].default_value=m['metallic']; bs.inputs['Roughness'].default_value=max(.2,m['roughness'])
    if m.get('texture') and os.path.isfile(m['texture']):
        tex=nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(m['texture'],check_existing=True)
        mix=nodes.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=1; mix.inputs[2].default_value=(c['r'],c['g'],c['b'],1)
        links.new(tex.outputs['Color'],mix.inputs[1]); links.new(mix.outputs[0],bs.inputs['Base Color'])
    if m.get('normal') and os.path.isfile(m['normal']):
        tex=nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(m['normal'],check_existing=True); tex.image.colorspace_settings.name='Non-Color'
        normal=nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value=.45; links.new(tex.outputs['Color'],normal.inputs['Color']); links.new(normal.outputs[0],bs.inputs['Normal'])
    emission=m.get('emission',{}); strength=max([emission.get(k,0) for k in ('r','g','b')])
    if strength>0:
        bs.inputs['Emission Color'].default_value=tuple(emission.get(k,0)/strength for k in ('r','g','b'))+(1,)
        bs.inputs['Emission Strength'].default_value=strength
    if 'luminous' in m['name']:
        bs.inputs['Emission Color'].default_value=(1,.67,.31,1); bs.inputs['Emission Strength'].default_value=3
    if m['name'].startswith('Evening city '): bs.inputs['Emission Strength'].default_value *= .4
    if m['name']=='Evening amber luminous':
        bs.inputs['Emission Color'].default_value=(1,.46,.14,1); bs.inputs['Emission Strength'].default_value=2.5
    if 'glazing' in m['name']:
        bs.inputs['Base Color'].default_value=(.26,.48,.53,1); bs.inputs['Emission Color'].default_value=(.15,.32,.36,1); bs.inputs['Emission Strength'].default_value=.4
    materials.append(mat)
for item in data['objects']:
    vertices=[(v['x'],-v['z'],v['y']) for v in item['vertices']]
    faces=[]; face_mats=[]
    for part in item['parts']:
        idx=part['indices']
        for i in range(0,len(idx),3): faces.append((idx[i+2],idx[i+1],idx[i])); face_mats.append(part['material'])
    mesh=bpy.data.meshes.new(item['name']); mesh.from_pydata(vertices,[],faces); mesh.update()
    obj=bpy.data.objects.new(item['name'],mesh); bpy.context.collection.objects.link(obj)
    if item['name'] in ('Ceiling joist','Front lintel'): obj.hide_render=True; obj.hide_set(True)
    used=list(dict.fromkeys(face_mats))
    for i in used: mesh.materials.append(materials[i])
    for poly,mi in zip(mesh.polygons,face_mats): poly.material_index=used.index(mi)
    if len(item['uv'])==len(vertices):
        uv=mesh.uv_layers.new(name='UVMap')
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                v=item['uv'][mesh.loops[li].vertex_index]; uv.data[li].uv=(v['x'],v['y'])
    if len(vertices)<600:
        bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.0001); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(mesh); bm.free()
        if len(mesh.vertices)<=32:
            bevel=obj.modifiers.new('Soft manufactured edges','BEVEL'); bevel.width=.016; bevel.segments=3
            normals=obj.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
        else:
            for poly in mesh.polygons: poly.use_smooth=True
    else:
        for poly in mesh.polygons: poly.use_smooth=True

def area(name,loc,power,color,size,target):
    light=bpy.data.lights.new(name,'AREA'); light.energy=power; light.color=color; light.shape='DISK'; light.size=size
    obj=bpy.data.objects.new(name,light); bpy.context.collection.objects.link(obj); obj.location=loc; obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj
# Warm local pools against cool, dim night windows. No daylight key light.
area('Bar conversation · soft amber key',(-2.85,-4.25,3.0),100,(1,.63,.32),3.0,(-2.85,-1.9,1.4))
area('Window · blue evening fill',(-8.6,0,3.8),65,(.22,.34,1),5,(-2,-1,1))
area('Front windows · night ambience',(0,7.5,3.5),45,(.27,.39,1),7,(0,0,1))
area('Lounge · warm pool',(6,0,3.5),115,(1,.62,.31),2.2,(6,-1,0))
for row in range(3): area('Backbar shelf amber '+str(row),(-4.6,-6.85,2.05+row*.69),38,(1,.54,.22),3.4,(-4.6,-7.3,1.7+row*.69))
for x in [-6.1,-4.45,-2.8,-1.15,.5]:
    area('Pendant amber pool '+str(x),(x,-3.1,3.15),72,(1,.65,.33),.48,(x,-2.4,.8))
for z in [4.7,1.95,-.8]: area('Window table pendant '+str(z),(-6.3,z,3.25),55,(1,.66,.37),.45,(-6.3,z,.75))
for pos in [(-2.85,-2.88,1.48),(-6.3,4.7,1.05),(-6.3,1.95,1.05),(-6.3,-.8,1.05),(3.6,5.4,1.05),(6.6,5.4,1.05),(6.4,.5,.83)]:
    ld=bpy.data.lights.new('Candle · intimate table glow','POINT'); ld.energy=5; ld.color=(1,.50,.19); ld.shadow_soft_size=.10
    ob=bpy.data.objects.new(ld.name,ld); bpy.context.collection.objects.link(ob); ob.location=pos
ld=bpy.data.lights.new('Blue night sky','SUN'); ld.energy=.075; ld.angle=.4; ld.color=(.3,.43,1)
lo=bpy.data.objects.new(ld.name,ld); bpy.context.collection.objects.link(lo); lo.rotation_euler=(.6,-.5,-.6)

def text(name,body,pos,size,color):
    cu=bpy.data.curves.new(name,'FONT'); cu.body=body; cu.align_x='CENTER'; cu.align_y='CENTER'; cu.size=size; cu.extrude=.001
    ob=bpy.data.objects.new(name,cu); bpy.context.collection.objects.link(ob); ob.location=pos; ob.rotation_euler=(math.pi/2,0,math.pi)
    mat=bpy.data.materials.new(name+' ink'); mat.diffuse_color=(*color,1); mat.use_nodes=True; mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1); cu.materials.append(mat)
text('Afterglow sign','Prayers',(-2.8,-7.55,3.8),.58,(.85,.50,.17))
text('Coffee and conversation','G O O D   C O F F E E   /   G O O D   T A L K',(-2.8,-7.55,3.23),.14,(.1,.18,.17))
text('Menu','TODAY\n\nFlat white   4.5\nPour over    5.0\nMatcha       5.5\n\nStay a while.',(1.7,-7.46,2.65),.13,(.93,.83,.64))
text('Slow coffee','SLOW COFFEE\nGOOD COMPANY',(3.65,-7.6,2.95),.28,(.1,.18,.17))
text('Roastery','ROASTERY',(6.9,-7.62,2.6),.16,(.7,.5,.2))
scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=32; scene.cycles.use_denoising=True
scene.render.resolution_x=1600; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
scene.world.color=(.22,.22,.22)
scene.world.use_nodes=True; scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.045,.075,.19,1); scene.world.node_tree.nodes['Background'].inputs[1].default_value=.18
scene.view_settings.view_transform='AgX'
camdata=bpy.data.cameras.new('Cafe overview'); cam=bpy.data.objects.new('Cafe overview',camdata); bpy.context.collection.objects.link(cam)
cam.location=(-1.2,-4.5,1.95); target=Vector((-2.85,-1.9,1.45)); cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler(); camdata.lens=32; scene.camera=cam
camdata.dof.use_dof=True; camdata.dof.focus_distance=(target-cam.location).length; camdata.dof.aperture_fstop=4
cam.name='01 · Evening conversation at the bar'
scene.view_settings.exposure=.2
group=bpy.data.node_groups.new('Evening lamp bloom','CompositorNodeTree')
scene.compositing_node_group=group
group.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
nodes=group.nodes; links=group.links
source=nodes.new('CompositorNodeRLayers'); glow=nodes.new('CompositorNodeGlare')
if hasattr(glow,'glare_type'): glow.glare_type='FOG_GLOW'
if 'Type' in glow.inputs: glow.inputs['Type'].default_value='Fog Glow'
output=nodes.new('NodeGroupOutput'); links.new(source.outputs['Image'],glow.inputs['Image']); links.new(glow.outputs['Image'],output.inputs['Image'])
# Start directly in the spacious overview; the file remains fully editable.
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_perspective='CAMERA'; ar.spaces.active.clip_end=150
            ar.spaces.active.shading.type='RENDERED'; ar.spaces.active.shading.use_scene_world_render=True; ar.spaces.active.shading.use_scene_lights_render=True; ar.spaces.active.overlay.show_overlays=False
            ar.spaces.active.region_3d.view_camera_zoom=0
scene.render.image_settings.file_format='PNG'; scene.render.filepath=ROOT+'/afterglow-evening-bar.png'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/afterglow-cafe.blend')
bpy.ops.render.render(write_still=True)
cam.location=(7.6,6.4,3.3); cam.rotation_euler=(Vector((-3,-2,1.65))-cam.location).to_track_quat('-Z','Y').to_euler(); camdata.lens=24
camdata.dof.use_dof=False
scene.render.filepath=ROOT+'/afterglow-evening-room.png'
bpy.ops.render.render(write_still=True)
print('CAFE_BLENDER_READY',ROOT+'/afterglow-cafe.blend')
