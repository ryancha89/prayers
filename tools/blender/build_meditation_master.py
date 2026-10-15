"""Build an editable, seated meditation character from the approved reference.

Face and hands reuse the project's f_char_002 mesh/UVs; garments, torso, long
hair, jewellery, stage and seated breathing rig are constructed here.
Run with Blender 5.1 in background mode. No remote generation or API keys.
"""
import bpy, bmesh, math, random, json, argparse, sys
from pathlib import Path
from mathutils import Vector, Matrix
from math import sin, cos, pi

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'assets/meditation-master'
BASE = Path('/Users/namaste/git/saju_fullstack/saju_world_unity/Assets/Art/1.character/f_char_002')
OUT.mkdir(parents=True, exist_ok=True)
random.seed(28)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system='METRIC'
scene.render.fps=30
scene.frame_start=1
scene.frame_end=181

def collection(name):
    c=bpy.data.collections.new(name);scene.collection.children.link(c);return c
CHAR=collection('01 • Meditation master')
STAGE=collection('02 • Presentation stage')
REF=collection('03 • Approved references (viewport only)')
RIG=collection('00 • Seated breathing rig')
ACTIVE=CHAR
binds={}
def move(o,c=None):
    for old in list(o.users_collection):old.objects.unlink(o)
    (c or ACTIVE).objects.link(o)
    return o
def tag(o,bone='Chest'):
    if ACTIVE==CHAR:binds[o.name]=bone
    return o
def material(name,col,metal=0,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
skin=material('Warm porcelain • shoulders and arms',(.63,.405,.31),0,.43)
skin.node_tree.nodes.get('Principled BSDF').inputs['Subsurface Weight'].default_value=.075
gold=material('Antique champagne gold',(.47,.28,.105),.82,.27)
thread=material('Old gold silk embroidery',(.29,.175,.07),.5,.42)
darkgold=material('Burnished bronze',(.15,.075,.026),.72,.35)
silk=material('Obsidian silk',(.008,.006,.008),.0,.62)
gauze=material('Smoky plum outer silk',(.016,.010,.014),.0,.68)
hairmat=material('Long raven hair',(.006,.003,.004),.0,.53)
hairhi=material('Raven strand highlights',(.013,.007,.007),.0,.57)
garnet=material('Garnet tassel silk',(.16,.022,.019),.05,.4)
jade=material('Smoky blue gemstones',(.06,.145,.17),.42,.16)
pearl=material('Warm pearl',(.72,.56,.39),.2,.22)
for m in (silk,gauze):
    n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Sheen Weight'].default_value=.16;p.inputs['Specular IOR Level'].default_value=.22
    tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=230;tex.inputs['Detail'].default_value=2
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.15;bump.inputs['Distance'].default_value=.00035
    m.node_tree.links.new(tex.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])

def mesh(name,vs,fs,mat,bone='Chest',sub=0):
    d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(name,d);ACTIVE.objects.link(o)
    if mat:d.materials.append(mat)
    for p in d.polygons:p.use_smooth=True
    if sub:
        mod=o.modifiers.new('Silhouette smoothing','SUBSURF');mod.levels=sub;mod.render_levels=sub
    return tag(o,bone)
def uv_sphere(name,pos,scale,mat,bone='Chest',segments=20,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=pos)
    o=move(bpy.context.object);o.name=name;o.scale=scale;o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return tag(o,bone)
def curve(name,pts,radius,mat,bone='Chest',cyclic=False):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=8;d.bevel_depth=radius;d.bevel_resolution=2
    s=d.splines.new('BEZIER');s.bezier_points.add(len(pts)-1)
    for b,p in zip(s.bezier_points,pts):b.co=p;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    s.use_cyclic_u=cyclic;o=bpy.data.objects.new(name,d);ACTIVE.objects.link(o);d.materials.append(mat);return tag(o,bone)
def grid(name,func,nu,nv,mat,bone='Chest',sub=1):
    vs=[func(i/nu,j/nv) for i in range(nu+1) for j in range(nv+1)]
    fs=[(i*(nv+1)+j,(i+1)*(nv+1)+j,(i+1)*(nv+1)+j+1,i*(nv+1)+j+1) for i in range(nu) for j in range(nv)]
    return mesh(name,vs,fs,mat,bone,sub)
def ellipse(name,center,rx,ry,mat,r=.001,bone='Chest'):
    return curve(name,[(center[0]+rx*cos(t),center[1]+ry*sin(t),center[2]) for t in [2*pi*i/48 for i in range(48)]],r,mat,bone,True)
def tube(name,points,radii,mat,bone='Chest',sides=20):
    vs=[];fs=[]
    for i,p in enumerate(points):
        p=Vector(p);t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)]);t.normalize()
        a=t.cross(Vector((0,1,0)))
        if a.length<.01:a=t.cross(Vector((1,0,0)))
        a.normalize();b=t.cross(a).normalized()
        for j in range(sides):vs.append(p+radii[i]*(a*cos(j*2*pi/sides)+b*sin(j*2*pi/sides)))
    for i in range(len(points)-1):
        for j in range(sides):fs.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    fs.append(tuple(reversed(range(sides))));fs.append(tuple((len(points)-1)*sides+j for j in range(sides)))
    return mesh(name,vs,fs,mat,bone,2)

# Reuse the local character's authored face topology and hand anatomy.
bpy.ops.import_scene.fbx(filepath=str(BASE/'Female_char02_Outfit01_Avatar.fbx'))
source=set(scene.objects)
arm=next(o for o in source if o.type=='ARMATURE')
arm.animation_data_clear()
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
arm.scale*=7
bpy.context.view_layer.update()
body=bpy.data.objects['BodyDrop_Mesh']
headsource=['BodyDrop_Mesh','MOUTH_Mesh','Eye_Mesh','Fixed_eyeslash_mat_Mesh']
# Use a frame from the existing authored blink for a natural closed-eye pose.
before=set(scene.objects)
bpy.ops.import_scene.fbx(filepath=str(BASE/'Female_IdleBlink.fbx'))
clipobjs=set(scene.objects)-before
clip=next(o for o in clipobjs if o.type=='ARMATURE')
scene.frame_set(19)
for name in arm.pose.bones.keys():
    if name.startswith('Eyelid') and name in clip.pose.bones:
        arm.pose.bones[name].matrix_basis=clip.pose.bones[name].matrix_basis.copy()
for o in clipobjs:bpy.data.objects.remove(o,do_unlink=True)
bpy.context.view_layer.update()

# Repair portable texture paths, then tune skin and raven hair materials.
for m in list(bpy.data.materials):
    if not m.use_nodes:continue
    p=m.node_tree.nodes.get('Principled BSDF')
    if not p:continue
    p.inputs['Metallic'].default_value=0 if m.name in ['Body_Mat','eyes_mat','hair_mat'] else p.inputs['Metallic'].default_value
    for n in list(m.node_tree.nodes):
        if n.type!='TEX_IMAGE' or not n.image:continue
        if not Path(bpy.path.abspath(n.image.filepath)).exists():
            if m.name=='eyes_mat':n.image=bpy.data.images.load(str(BASE/'Textures/Base/BODYLOW_EYES_BaseColor.png'),check_existing=True)
            else:
                for socket in n.outputs:
                    for link in list(socket.links):m.node_tree.links.remove(link)
        if m.name=='hair_mat':
            for link in list(n.outputs['Color'].links):m.node_tree.links.remove(link)
    if m.name=='Body_Mat':
        p.inputs['Roughness'].default_value=.46;p.inputs['Subsurface Weight'].default_value=.07
    if m.name=='hair_mat':
        p.inputs['Base Color'].default_value=(.012,.007,.008,1);p.inputs['Roughness'].default_value=.38
    if m.name=='eyes_mattear':p.inputs['Base Color'].default_value=(.015,.006,.007,1)

def extract(name,src,predicate,transform,bone):
    evaluated=src.evaluated_get(bpy.context.evaluated_depsgraph_get())
    d=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
    bm=bmesh.new();bm.from_mesh(d)
    remove=[v for v in bm.verts if not predicate(src.matrix_world@v.co)]
    bmesh.ops.delete(bm,geom=remove,context='VERTS')
    for v in bm.verts:v.co=transform(src.matrix_world@v.co)
    bm.to_mesh(d);bm.free();d.update()
    o=bpy.data.objects.new(name,d);CHAR.objects.link(o)
    for p in d.polygons:p.use_smooth=True
    tag(o,bone)
    if name.startswith('Face'):
        mod=o.modifiers.new('Smooth authored face','SUBSURF');mod.levels=1;mod.render_levels=2
    return o

drop=Vector((0,0,-.62))
for name in headsource:
    src=bpy.data.objects.get(name)
    if not src:continue
    title={'BodyDrop_Mesh':'Face • closed eyes and neck','hair_low_Mesh':'Hair • sculpted crown','MOUTH_Mesh':'Mouth interior','Eye_Mesh':'Eyes','Fixed_eyeslash_mat_Mesh':'Eyelashes'}[name]
    extract(title,src,lambda p:abs(p.x)<.115 and p.z>1.47,lambda p:p+drop,'Head')

# A mirrored pair of actual hand meshes, aligned to an upright prayer gesture.
def boneworld(n):return arm.matrix_world@arm.data.bones[n].head_local
wrist=boneworld('Hand_Jnt_L')
long=(boneworld('Finger_L_Middle_01')-wrist).normalized()
across=boneworld('Finger_L_Index_01')-boneworld('Finger_L_Pinky_01');across=(across-long*across.dot(long)).normalized()
normal=long.cross(across).normalized()
sourcebasis=Matrix((across,normal,long)).transposed()
destlong=Vector((0,.10,.995)).normalized();destacross=Vector((0,-.995,.10)).normalized();destnormal=destlong.cross(destacross)
destbasis=Matrix((destacross,destnormal,destlong)).transposed()
rot=destbasis@sourcebasis.transposed()
for s,label in [(1,'L'),(-1,'R')]:
    def handmap(p,s=s):
        q=(rot@(p-wrist))*.92+Vector((.015,-.185,.692));q.x=.010+(q.x-.015)*.33;q.x*=s;return q
    o=extract('Prayer hand '+label,body,lambda p:p.x>.25 and (p-wrist).dot(long)>-.009,handmap,'Hands')
    if s<0:
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
for o in source:bpy.data.objects.remove(o,do_unlink=True)

# Bare shoulders, neck and arms under the off-shoulder gown.
rings=[(.40,.10,.065),(.46,.095,.062),(.52,.10,.063),(.60,.135,.082),(.68,.145,.085),(.735,.148,.078),(.775,.18,.061),(.80,.143,.055),(.822,.075,.045),(.842,.036,.036),(.868,.031,.032),(.887,.03,.031)]
vs=[];fs=[];ns=64
for z,rx,ry in rings:
    for j in range(ns):
        t=j*2*pi/ns;front=max(0,-sin(t));x=rx*cos(t);y=ry*sin(t)
        if .59<z<.74:y-=.010*front*(.3+.7*abs(cos(t)))
        vs.append((x,y,z))
for i in range(len(rings)-1):
    for j in range(ns):fs.append((i*ns+j,i*ns+(j+1)%ns,(i+1)*ns+(j+1)%ns,(i+1)*ns+j))
torso=mesh('Shoulders • continuous torso',vs,fs,skin,'Chest',2)
for s in [-1,1]:
    tube('Upper arm '+str(s),[(s*.159,0,.779),(s*.20,-.01,.736),(s*.239,-.04,.648),(s*.239,-.064,.568)],[.041,.041,.032,.029],skin)
    tube('Forearm '+str(s),[(s*.239,-.064,.568),(s*.19,-.11,.598),(s*.09,-.159,.659),(s*.017,-.185,.698)],[.029,.03,.026,.021],skin,'Hands')

# A sculpted corset-like silk bodice, sweetheart neckline, layered waist.
def bodice(u,v):
    t=u*2*pi
    top=.711+.014*abs(cos(t))-.014*(max(0,-sin(t))**16)
    z=.399+(top-.399)*v
    rx=.11+.047*sin(v*pi*.72)**2-.023*sin(v*pi)
    ry=.072+.028*sin(v*pi*.8)**2
    folds=.002*sin(t*18+v*2)*sin(v*pi)
    return ((rx+folds)*cos(t),(ry+folds)*sin(t)-.008*max(0,-sin(t))*v,z)
grid('Obsidian embroidered bodice',bodice,96,28,silk,'Chest',1)
curve('Sweetheart gold edging',[bodice(i/100,1) for i in range(100)],.0016,gold,cyclic=True)
curve('Sweetheart inner stitch',[Vector(bodice(i/100,.977))+Vector((0,-.0003,0)) for i in range(100)],.00065,thread,cyclic=True)
for v in [.08,.14,.20]:curve('Waist binding '+str(v),[bodice(i/80,v) for i in range(80)],.0028,darkgold,cyclic=True)

# Folded silk skirt: a complete three-dimensional seated volume with radial folds.
def skirt(u,v):
    a=u*2*pi
    r=.095+v*.46
    ry=.065+v*.345
    fold=(.010*sin(a*22+v*6)+.005*sin(a*39-v*4))*sin(v*pi*.92)
    z=.37*(1-v)**1.4+.108+.025*sin(v*pi)**2
    z+=.062*cos(a)**4*sin(v*pi)**2+fold*.6
    return ((r+fold)*cos(a),.025+(ry+fold)*sin(a),z)
grid('Layered skirt • lotus seated volume',skirt,144,42,silk,'Root',1)
for v in [.955,.984]:curve('Skirt border '+str(v),[skirt(i/140,v) for i in range(140)],.0018,gold,'Root',True)
# Draped upper panels make the crossed-leg silhouette legible beneath the skirt.
for side in []:
    def lap(u,v,side=side):
        x=side*(.055+.41*u)
        y=-.025-.30*v+.015*sin(u*pi)
        z=.18+.18*sin(u*pi*.82)*sin(v*pi*.85)+.025*cos(v*9*pi+u*4)*(sin(u*pi)**.6)
        return (x,y,z)
    grid('Crossed knee drape '+str(side),lap,45,40,gauze,'Root',1)
    curve('Knee hem '+str(side),[lap(i/45,1) for i in range(46)],.0014,thread,'Root')

# Hanging off-shoulder sleeves, constructed as layered open fabric surfaces.
for side in [-1,1]:
    def sleeve(u,v,side=side):
        x=side*(.184+.065*u+.18*v*sin(pi*u*.8))
        y=-.003-.087*u+.12*v+.024*sin(v*10*pi+u*5)*sin(v*pi)
        z=.742-.135*u-.43*v*(.65+.35*sin(u*pi))
        return (x,y,z)
    grid('Hanging silk sleeve '+str(side),sleeve,32,48,gauze,'Chest',1)
    for u in [0,1]:curve('Sleeve filigree border',[sleeve(u,j/60) for j in range(61)],.0017,thread)
    curve('Sleeve cuff',[sleeve(i/40,0) for i in range(41)],.0023,gold)
    for k in range(7):
        u=(k+.5)/7
        curve('Sleeve sewn vine',[Vector(sleeve(u+.018*sin(v*12),v))+Vector((0,-.002,0)) for v in [j/20 for j in range(21)]],.00065,thread)

# Small 3D embroidered flowers on dress surfaces, all geometry, no billboard.
def flower(name,center,size,mat=gold,bone='Chest',normal=(0,-1,0),petals=5):
    c=Vector(center);n=Vector(normal).normalized();a=n.cross(Vector((0,0,1)))
    if a.length<.1:a=n.cross(Vector((1,0,0)))
    a.normalize();b=n.cross(a).normalized()
    for k in range(petals):
        angle=k*2*pi/petals;d=a*cos(angle)+b*sin(angle);e=n.cross(d)
        pts=[c+d*(size*(.48-.48*cos(t)))+e*(size*.24*sin(t))+n*(size*.08*sin(t/2)) for t in [j*2*pi/12 for j in range(13)]]
        curve(name+' petal',pts,size*.045,mat,bone,True)
    uv_sphere(name+' center',c+n*.001,(size*.18,)*3,jade,bone,12,8)

for i in range(28):
    u=(i*.381966)%1;v=.27+.64*((i*.27183)%1);p=Vector(bodice(u,v));n=Vector((p.x,p.y,0)).normalized()
    flower('Bodice floral embroidery',p+n*.0018,.009 if i%3 else .014,thread,normal=n)
for i in range(48):
    u=(i*.618034)%1;v=.52+.43*((i*.27183)%1);p=Vector(skirt(u,v))
    flower('Skirt floral embroidery',p+Vector((0,0,.002)),.012 if i%4 else .022,thread,'Root',normal=(p.x,p.y,.4))
for side in [-1,1]:
    for i in range(14):
        u=.1+.8*((i*.618)%1);v=.10+.8*((i*.381)%1)
        p=(side*(.184+.065*u+.18*v*sin(pi*u*.8)),-.003-.087*u+.12*v-.003,.742-.135*u-.43*v*(.65+.35*sin(u*pi)))
        flower('Sleeve floral embroidery',p,.012,thread)

# Merge skin at shoulder/elbow junctions before binding, retaining authored face UVs.
parts=[o for o in CHAR.objects if o.name.startswith(('Shoulders','Upper arm','Forearm'))]
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
    for mod in list(o.modifiers):
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.context.view_layer.objects.active=torso;bpy.ops.object.join()
remesh=torso.modifiers.new('Continuous shoulder and elbow skin','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.003;remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=torso.modifiers.new('Soften anatomical joins','SMOOTH');smooth.factor=.7;smooth.iterations=5
sub=torso.modifiers.new('Skin finishing','SUBSURF');sub.levels=1;sub.render_levels=1

# Long black hair: curved tapered locks, with fine longitudinal strand ridges.
def cap(u,v):
    a=u*2*pi;front=max(0,-sin(a));back=max(0,sin(a));end=1.68-.65*front+.48*back
    p=.015+v*end
    return (.090*sin(p)*cos(a),.01+.100*sin(p)*sin(a),.990+.122*cos(p))
grid('Hair • center parted scalp',cap,80,28,hairmat,'Head',1)
def lock(name,control,width,thick,bone='Head'):
    # Catmull-Rom interpolation through hand-authored silhouette control points.
    pts=[Vector(p) for p in control]
    def path(t):
        f=t*(len(pts)-1);i=min(int(f),len(pts)-2);q=f-i
        p0=pts[max(i-1,0)];p1=pts[i];p2=pts[i+1];p3=pts[min(i+2,len(pts)-1)]
        return .5*((2*p1)+(-p0+p2)*q+(2*p0-5*p1+4*p2-p3)*q*q+(-p0+3*p1-3*p2+p3)*q*q*q)
    def surf(u,v):
        p=path(v);ang=2*pi*u;taper=(.15+.85*sin(pi*(.08+.92*v))**.5)*(1-.85*v**8)
        return p+Vector((width*taper*cos(ang),thick*taper*sin(ang),0))
    o=grid(name,surf,12,48,hairmat,bone,1)
    for k in [-.75,-.35,.1,.5,.8]:
        arr=[]
        for j in range(32):
            t=j/31;p=path(t);taper=(.15+.85*sin(pi*(.08+.92*t))**.5)*(1-.85*t**8)
            arr.append(p+Vector((width*taper*k,-thick*taper*(max(.1,1-k*k)**.5)-.0003,0)))
        curve(name+' strand',arr,.00035,hairhi,bone)
    return o

for i in range(13):
    x=(i-6)*.014
    lock('Back hair lock %02d'%i,[(x*.7,.068,1.083),(x*1.05,.093,.994),(x*1.25,.103,.79),(x*1.6,.14,.51),(x*2.0,.21,.28),(x*2.2,.26,.15)],.019,.008)
for side in [-1,1]:
    for k in range(7):
        lock('Swept crown '+str(side)+' '+str(k),[(side*.005,.004+k*.008,1.114),(side*.047,-.038+k*.007,1.097),(side*.086,-.031+k*.006,1.032),(side*.09,.004+k*.007,.96)],.008,.003)
    for i in range(4):
        x=side*(.064+i*.009)
        lock('Side hair '+str(side)+' '+str(i),[(side*.041,.001,1.101),(x,-.024,1.038),(x*1.16,-.015,.94),(x*1.3,-.035,.80),(x*1.55,-.115,.58),(x*1.7,-.13,.47)],.014,.007)
    lock('Face framing tendril '+str(side),[(side*.039,-.046,1.099),(side*.071,-.08,1.045),(side*.074,-.084,.976),(side*.062,-.068,.92),(side*.083,-.052,.877)],.0045,.0025)

# Ornate symmetrical crown with filigree, flower pins, beads and garnet tassels.
def gem(name,pos,scale,bone='Head'):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=pos);o=move(bpy.context.object);o.name=name;o.scale=scale;o.data.materials.append(jade);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return tag(o,bone)
curve('Crown base arch',[(.105*cos(t),-.026-.05*sin(t),1.087+.018*sin(t)) for t in [i*pi/36 for i in range(37)]],.002,gold,'Head')
for side in [-1,1]:
    flower('Temple magnolia', (side*.078,-.041,1.099),.030,gold,'Head',normal=(side*.25,-1,.3),petals=7)
    for j in range(3):
        x=side*(.024+j*.026);z=1.119+.025*(1-j*.24)
        curve('Crown rising filigree',[(x,-.036,1.091),(x*1.14,-.041,z),(x+side*.009,-.039,z+.013),(x+side*.019,-.032,z-.006),(x,-.036,1.091)],.0011,gold,'Head')
        gem('Crown gemstone',(x,-.043,z),(.004,.003,.006))
    for j in range(3):
        x=side*(.087+j*.006);z0=1.074-j*.012;length=.12+j*.034
        pts=[(x+side*.013*sin(t*pi),-.012-j*.012,z0-length*t) for t in [i/10 for i in range(11)]]
        curve('Hairpin hanging chain',pts,.00075,gold,'Head')
        for k in range(1,7):
            t=k/7;p=(x+side*.013*sin(t*pi),-.012-j*.012,z0-length*t)
            uv_sphere('Chain pearl',p,(.0021,)*3,pearl,'Head',10,6)
        end=pts[-1];gem('Hairpin drop',end,(.003,.0025,.007))
    # Long earrings at the jaw.
    ep=(side*.083,-.008,.963)
    curve('Earring hook',[ep,(side*.087,-.015,.94),(side*.088,-.017,.905)],.0009,gold,'Head')
    flower('Earring blossom',(side*.088,-.017,.926),.01,gold,'Head')
    for k in range(5):curve('Garnet earring tassel',[(side*.088+(k-2)*.0014,-.017,.9),(side*.088+(k-2)*.0015,-.018,.862)],.00055,garnet,'Head')
flower('Crown central lotus',(0,-.05,1.136),.025,gold,'Head',petals=7)
curve('Forehead chain',[(0,-.053,1.123),(0,-.078,1.081),(0,-.088,1.053)],.00065,gold,'Head')
gem('Forehead pendant',(0,-.089,1.046),(.0035,.002,.007))

# Necklace, bodice brooch and hand bracelets.
curve('Delicate collar necklace',[(-.055,-.039,.823),(-.047,-.063,.792),(0,-.083,.762),(.047,-.063,.792),(.055,-.039,.823)],.0011,gold)
curve('Pendant chain',[(0,-.083,.762),(0,-.101,.706),(0,-.102,.658)],.0009,gold)
flower('Waist lotus clasp',(0,-.095,.457),.028,gold)
flower('Bodice central jewel',(0,-.107,.687),.018,gold)
for side in [-1,1]:
    curve('Waist garnet ribbon',[(side*.021,-.093,.452),(side*.032,-.15,.366),(side*.069,-.224,.24),(side*.083,-.27,.183)],.0024,garnet,'Root')
    for i in range(10):
        t=i*2*pi/10
        uv_sphere('Prayer bracelet bead',(side*.055+.021*cos(t),-.166+.014*sin(t),.673),(.0023,)*3,gold,'Hands',10,6)

# Add the breathing rig. The rest shape is intentionally seated, not humanoid T-pose.
bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0));rig=move(bpy.context.object,RIG);rig.name='MeditationMaster_Rig'
eb=rig.data.edit_bones;eb.remove(eb[0])
for name,h,t,parent in [('Root',(0,0,.10),(0,0,.43),None),('Chest',(0,0,.43),(0,0,.80),'Root'),('Head',(0,0,.80),(0,0,1.06),'Chest'),('Hands',(0,-.10,.55),(0,-.18,.80),'Chest')]:
    b=eb.new(name);b.head=h;b.tail=t
    if parent:b.parent=eb[parent]
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True;rig.data.display_type='STICK'
for o in list(CHAR.objects):
    bone=binds.get(o.name,'Chest')
    if o.type=='CURVE':
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o=bpy.context.object
    if o.type!='MESH':continue
    # Apply object transforms so each skinned mesh is stored in the rig's space.
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE')
    mod=o.modifiers.new('Breathing skeleton','ARMATURE');mod.object=rig;o.parent=rig
rig['design_reference']='reference/character-sheet.png'
rig['rig_scope']='Seated meditation rig. Root, Chest, Head and Hands. Not a humanoid locomotion rig.'
rig['source_mesh']='Project f_char_002 face and hands; original procedural wardrobe and accessories.'
for frame in range(1,182,6):
    phase=(frame-1)/180*2*pi;a=(1-cos(phase))*.5
    chest=rig.pose.bones['Chest'];chest.location=(0,.004*a,0);chest.scale=(1+.006*a,1+.004*a,1+.009*a)
    chest.keyframe_insert('location',frame=frame);chest.keyframe_insert('scale',frame=frame)
    head=rig.pose.bones['Head'];head.rotation_mode='XYZ';head.rotation_euler=(math.radians(-2.5-.65*a),0,0);head.keyframe_insert('rotation_euler',frame=frame)
rig.animation_data.action.name='Meditation_Breath_6s'
scene.frame_set(1)

# Quiet studio sanctuary to show actual 3D silhouettes clearly.
ACTIVE=STAGE
stone=material('Charcoal stone',(.025,.029,.029),.05,.6)
cushionmat=material('Black velvet cushion',(.025,.016,.019),0,.8)
floor=material('Warm slate floor',(.033,.032,.031),.05,.55)
uv_sphere('Meditation cushion',(0,.015,.088),(.58,.44,.095),cushionmat,segments=64,rings=24)
for z in [.071,.094]:ellipse('Cushion gold piping',(0,.015,z),.576,.438,thread,.0018)
def cylinder(name,loc,radius,depth,mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=radius,depth=depth,location=loc);o=move(bpy.context.object);o.name=name;o.data.materials.append(mat);m=o.modifiers.new('Soft bevel','BEVEL');m.width=.012;m.segments=3;return o
cylinder('Low circular plinth',(0,.015,-.01),.76,.07,stone)
ellipse('Plinth bronze inlay',(0,.015,.028),.715,.715,darkgold,.002)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.05));o=move(bpy.context.object);o.name='Studio floor';o.data.materials.append(floor)
em=material('Candlelight',(.9,.45,.10),0,.4);p=em.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(1,.47,.13,1);p.inputs['Emission Strength'].default_value=3
for side in [-1,1]:
    c=Vector((side*.66,-.24,.085));cylinder('Lotus lamp base',c,.065,.018,darkgold)
    for i in range(8):
        a=i*pi/4;o=uv_sphere('Lotus bronze petal',c+Vector((.035*cos(a),.035*sin(a),.028)),(.015,.031,.042),gold)
        o.rotation_euler=(.6*sin(a),-.6*cos(a),a)
    uv_sphere('Lotus flame',c+Vector((0,0,.048)),(.009,.009,.024),em)
    bpy.ops.object.light_add(type='POINT',location=c+Vector((0,0,.085)));o=move(bpy.context.object);o.data.energy=4;o.data.color=(1,.55,.25);o.data.shadow_soft_size=.07
def area(name,loc,energy,size,color,target=(0,0,.7)):
    bpy.ops.object.light_add(type='AREA',location=loc);o=move(bpy.context.object);o.name=name;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Large warm key',(-1.6,-2.1,2.5),180,2.0,(1,.81,.67))
area('Soft frontal fill',(.9,-1.6,1.3),55,1.4,(.73,.84,1))
area('Silk and hair rim',(1.0,.85,2.0),260,1.6,(1,.72,.43))
area('Cool outline',(-1,.6,1.3),75,1.2,(.48,.62,1))
scene.world=bpy.data.worlds.new('Sanctuary dusk');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.055,.065,.09,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.25
bpy.ops.object.camera_add(location=(.32,-2.7,1.18));camera=move(bpy.context.object);camera.name='Portrait Camera';camera.rotation_euler=(Vector((0,0,.61))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=1.88;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1200;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False

# Pack user references into the .blend, displayed only in the modeling viewport.
for i,filename in enumerate(['approved-concept.png','character-sheet.png']):
    image=bpy.data.images.load(str(OUT/'reference'/filename));image.pack()
    o=bpy.data.objects.new('Reference • '+filename,None);REF.objects.link(o);o.empty_display_type='IMAGE';o.data=image;o.empty_display_size=1.6;o.location=(1.6+i*1.8,.4,.8);o.rotation_euler=(pi/2,0,0);o.hide_render=True
for image in bpy.data.images:
    if image.source=='FILE' and Path(bpy.path.abspath(image.filepath)).exists():
        try:image.pack()
        except RuntimeError:pass
REF.hide_render=True
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA'
            a.spaces.active.shading.type='MATERIAL'
            a.spaces.active.overlay.show_overlays=False
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
scene.render.filepath=str(OUT/'previews/meditation-master-front.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'meditation-master.blend'))
bpy.ops.render.render(write_still=True)
print('MASTER_BUILD_COMPLETE',flush=True)
