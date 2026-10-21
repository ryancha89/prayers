"""Refine Luna from a preserved base. Blender 5.1; no external Python packages.

Blender -b --python 3d-modeling/luna/scripts/refine_luna.py
LUNA_QUICK=1 makes two draft renders; LUNA_NO_RENDER=1 only saves the model.
"""
import json
import math
import os
import sys
from pathlib import Path
from math import sin, cos, pi

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

HERE = Path(__file__).resolve().parents[1]
OUT = HERE / 'output'
PREV = HERE / 'previews'
for folder in (OUT, PREV):
    folder.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(HERE / 'source/luna_base.blend'))
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
rig = bpy.data.objects['Armature']
rig.animation_data_clear()
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
RW = rig.matrix_world.copy()
RWI = RW.inverted()
rest = {b.name: (b.parent.name if b.parent else None, b.matrix_local.copy()) for b in rig.data.bones}

# Shared primitives live inside the dedicated modeling workspace.
sys.path.insert(0, str(HERE.parent / 'common'))
from blender_geometry import mesh_obj, tube_obj, ring_obj, gem_obj, star_obj

for img in bpy.data.images:
    hit = HERE / 'source/textures' / Path(img.filepath).name
    if img.source == 'FILE' and hit.exists():
        img.filepath = str(hit)
        img.reload()

def material(name, col, rough=.5, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*col, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*col, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    return m

gold = bpy.data.materials['CO_Gold']
gold.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.83, .60, .30, 1)
gold.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .32
navy = material('Luna • midnight silk ribbon', (.018, .012, .038), .58)
navy.node_tree.nodes['Principled BSDF'].inputs['Sheen Weight'].default_value = .28
navy.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = .23
seam_mat = material('Luna • ivory satin seams', (.68, .62, .61), .57)
hair_mats = []
for k, col in enumerate(((.043, .019, .011), (.055, .026, .016), (.035, .014, .009), (.065, .031, .019))):
    m = material(f'Luna • chestnut lock {k + 1}', (.048+k*.002, .024+k*.001, .015+k*.0007), .58)
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Specular IOR Level'].default_value = .20
    p.inputs['Anisotropic'].default_value = .3
    nt = m.node_tree
    tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = 4
    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapping = nt.nodes.new('ShaderNodeVectorMath'); mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = (110, 1.6, 1)
    nt.links.new(coord.outputs['UV'], mapping.inputs[0]); nt.links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .13; bump.inputs['Distance'].default_value = .0006
    nt.links.new(tex.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    hair_mats.append(m)
hair_line = material('Luna • chestnut fine strands', (.08, .036, .019), .53)
for name in ('CO_Hair_Brown', 'CO_Face_Yunjung', 'CO_Skin_Yunjung', 'CO_Skin_Graft'):
    p = bpy.data.materials[name].node_tree.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value = .48 if name == 'CO_Hair_Brown' else .62
    p.inputs['Specular IOR Level'].default_value = .28
    p.inputs['Coat Weight'].default_value = 0
# Replace baked bright orange highlights on the inherited fringe with the same
# chestnut strand palette as the rebuilt back. Geometry supplies the highlights.
hm=bpy.data.materials['CO_Hair_Brown']
hp=hm.node_tree.nodes['Principled BSDF']
hp.inputs['Roughness'].default_value=.58
hp.inputs['Specular IOR Level'].default_value=.20
for link in list(hp.inputs['Base Color'].links): hm.node_tree.links.remove(link)
shade=np.zeros((512,512,4),dtype=np.float32)
x=np.linspace(0,1,512)[None,:]
grain=.97+.02*np.sin(x*142*pi)+.01*np.sin(x*318*pi)
linear=np.array((.050,.025,.0157))
srgb=1.055*linear**(1/2.4)-.055
for c in range(3): shade[:,:,c]=srgb[c]*grain
shade[:,:,3]=1
img=bpy.data.images.new('Luna unified chestnut fringe',width=512,height=512,alpha=True)
img.pixels.foreach_set(shade.ravel()); img.pack()
node=hm.node_tree.nodes.new('ShaderNodeTexImage'); node.image=img
hm.node_tree.links.new(node.outputs['Color'],hp.inputs['Base Color'])
amethyst = bpy.data.materials['CO_Amethyst']
p = amethyst.node_tree.nodes['Principled BSDF']
p.inputs['Base Color'].default_value = (.55, .43, .68, 1)
p.inputs['Emission Strength'].default_value = .12
p.inputs['Roughness'].default_value = .24

def hair_weights(p):
    z = p.z
    if z >= 1.59:
        return {'Head_Jnt': 1}
    if z > 1.43:
        t = (1.59 - z) / .16
        return {'Head_Jnt': 1 - t, 'Chest_Jnt': t}
    t = min(1, (1.43 - z) / .35)
    return {'Chest_Jnt': 1 - .7 * t, 'Spine01_Jnt': .7 * t}

def bind(o, weights='Head_Jnt'):
    positions = [o.matrix_world @ v.co for v in o.data.vertices]
    o.data.transform(RWI @ o.matrix_world)
    o.parent = rig
    o.matrix_parent_inverse = Matrix.Identity(4)
    o.matrix_basis = Matrix.Identity(4)
    for i, p in enumerate(positions):
        ws = {weights: 1} if isinstance(weights, str) else weights(p)
        for name, w in ws.items():
            if w <= 1e-7:
                continue
            group = o.vertex_groups.get(name) or o.vertex_groups.new(name=name)
            group.add([i], w, 'REPLACE')
    mod = o.modifiers.new('Original Luna rig', 'ARMATURE')
    mod.object = rig
    return o

def inherit_weights(o, source):
    # Tiny trims are assigned from their closest original cloth vertex.
    from mathutils.kdtree import KDTree
    kd = KDTree(len(source.data.vertices))
    for v in source.data.vertices:
        kd.insert(source.matrix_world @ v.co, v.index)
    kd.balance()
    def weights(p):
        _, i, _ = kd.find(p)
        return {source.vertex_groups[g.group].name: g.weight for g in source.data.vertices[i].groups}
    return bind(o, weights)

def remove(name):
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)

for name in ('CO_Hair_Long', 'HairB_Geo', 'CO_Hair_Ornament', 'CO_Hair_Ornament_Gem', 'CO_Earrings'):
    remove(name)

# Solid, tapered locks replace noisy, overlapping alpha cards.
def lock(name, path, width, depth, mat):
    points = [Vector(p) for p in path]
    if len(points) > 12:
        for _ in range(5):
            points = [points[0]] + [(points[i-1]+2*points[i]+points[i+1])/4
                                   for i in range(1,len(points)-1)] + [points[-1]]
    verts, faces, uv = [], [], []
    rings, sides = len(points), 10
    for i, c in enumerate(points):
        t = i / (rings - 1)
        tangent = (points[min(i + 1, rings - 1)] - points[max(0, i - 1)]).normalized()
        side = Vector((1, 0, 0))
        side = (side - tangent * side.dot(tangent)).normalized()
        normal = tangent.cross(side).normalized()
        taper = max(.012, (1 - t ** 2.3) ** .65) * (.38 + .62 * min(1,t/.12))
        for j in range(sides):
            a = j * 2 * pi / sides
            verts.append(c + side * width * taper * cos(a) + normal * depth * taper * sin(a))
            uv.append((j / sides, t))
    for i in range(rings - 1):
        for j in range(sides):
            faces.append((i * sides + j, i * sides + (j + 1) % sides,
                          (i + 1) * sides + (j + 1) % sides, (i + 1) * sides + j))
    faces.extend([tuple(reversed(range(sides))), tuple((rings - 1) * sides + j for j in range(sides))])
    return bind(mesh_obj(name, verts, faces, mat, uv), hair_weights)

def interpolate(z, points):
    for (z0,y0),(z1,y1) in zip(points,points[1:]):
        if z0 >= z >= z1:
            t=(z0-z)/(z0-z1)
            return y0*(1-t)+y1*t
    return points[0][1] if z>points[0][0] else points[-1][1]

for sg, side_name in ((-1, 'R'), (1, 'L')):
    for k in range(5):
        path = []
        layer, row = 0, k
        f = row / 4
        end_z = .91 + .12 * sin(k * 1.73) ** 2
        for j in range(49):
            t = j / 48
            spread = sin(min(1, t * 2.8) * pi / 2)
            x = sg * (.118 + (.028 + .052 * f) * spread
                      + (.022 + .006 * f) * sin(t * 2.8 * pi + f * .9) * sin(pi * t / 2))
            y = .013 + .115 * sin(min(1, t * 2.4) * pi / 2) + f * .008*spread
            y += .010 * sin(t * 2.6 * pi + f)*spread
            z = 1.672 - (1.672 - end_z) * t
            path.append(Vector((x, y, z)))
        lock(f'Luna_Hair_{side_name}_Back_{k:02}', path, .017 + .002 * sin(k) ** 2, .004, hair_mats[k % 4])
    for k in range(4):
        path = []
        for j in range(45):
            t = j / 44
            x = sg * (.083 + .046 * sin(min(1, t * 3) * pi / 2) + k * .010
                      + .022 * sin(4.1 * pi * t + k * .9) * sin(pi * t / 2))
            z = 1.705 - (.54 + .035 * k) * t
            y = interpolate(z, [(1.71,.025),(1.60,.015),(1.52,.005),(1.43,-.04),
                                 (1.35,-.105),(1.24,-.10),(1.10,-.09),(1.0,-.065)]) + .006*k
            path.append(Vector((x, y, z)))
        lock(f'Luna_Hair_{side_name}_Front_{k}', path, .012 + k * .001, .004, hair_mats[(k + 1) % 4])

# Continuous crown-to-tip sheets replace the old short bob plus attached tubes.
# Each lock follows the scalp before releasing into a shallow wave. Broad,
# overlapping lens sections have a 2 mm back surface instead of rope thickness.
for k in range(11):
    theta=-1.72+3.44*k/10
    verts,faces,uv=[],[],[]
    rows,cols=65,9
    tip=1.00+.105*sin(k*1.37)**2
    for j in range(rows):
        t=j/(rows-1)
        s=max(0,(t-.29)/.71)
        end_taper=1 if s<.70 else max(.008,((1-s)/.30)**.72)
        spread=(.185+.025*sin(k*2.1))*end_taper
        for side in (1,-1):
            for i in range(cols):
                u=i/(cols-1)*2-1
                th=theta+u*spread
                if t<=.29:
                    a=.035+(pi/2-.035)*(t/.29)
                    x=.124*sin(a)*sin(th)
                    y=.026+.113*sin(a)*cos(th)
                    z=1.652+.139*cos(a)
                    ridge=.0018*(1-u*u)*sin(a)
                    outward=Vector((sin(a)*sin(th),sin(a)*cos(th),cos(a)))
                else:
                    x=(.124+.048*sin(s*pi/2))*sin(th)
                    x+=.023*sin(2.6*pi*s+theta*.65)*sin(pi*s/2)
                    y=.026+.113*cos(th)+.048*sin(min(1,s*3)*pi/2)
                    y+=.008*sin(2.4*pi*s+theta)*sin(pi*s/2)
                    z=1.652-(1.652-tip)*s
                    ridge=.004*(1-u*u)*end_taper
                    outward=Vector((sin(th),cos(th),0))
                # A subtle longitudinal ridge catches light without round cords.
                verts.append(Vector((x,y,z))+outward*(ridge if side==1 else -.002))
                uv.append(((k+(u+1)/2)/11,t))
    stride=cols*2
    for j in range(rows-1):
        for side in range(2):
            for i in range(cols-1):
                a=j*stride+side*cols+i
                face=(a,a+1,a+stride+1,a+stride)
                faces.append(face if side==0 else tuple(reversed(face)))
        for i in (0,cols-1):
            a=j*stride+i
            faces.append((a,a+stride,a+stride+cols,a+cols))
    for j in (0,rows-1):
        a=j*stride
        faces.append(tuple([a+i for i in range(cols)]+[a+cols+i for i in reversed(range(cols))]))
    o=mesh_obj(f'Luna_Hair_Mantle_{k:02}',verts,faces,hair_mats[1],uv)
    bm=bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(o.data); bm.free()
    bind(o,hair_weights)

# A recessed scalp shell closes gaps behind the inherited fringe. It sits
# inside both fringe and rear mantle, so its edge cannot form a visible seam.
verts,faces,uv=[],[],[]
for j in range(17):
    for i in range(65):
        th=2*pi*i/64
        # Hairline retreats above the fringe at the front; never cover the eyes.
        end_a=.78+(pi*.57-.78)*(cos(th)+1)/2
        a=.005+(end_a-.005)*j/16
        verts.append(Vector((.116*sin(a)*sin(th),.027+.101*sin(a)*cos(th),1.652+.132*cos(a))))
        uv.append((i/64,j/16))
for j in range(16):
    for i in range(64):
        a=j*65+i
        faces.append((a,a+1,a+66,a+65))
bind(mesh_obj('Luna_Hair_Scalp',verts,faces,hair_mats[1],uv),'Head_Jnt')

# Puffy silk bow loops, separate hanging tails and small gold charms.
def ribbon(name, centers, widths, bulge=.006):
    verts, faces = [], []
    for i, c in enumerate(centers):
        for j in range(7):
            u = j / 6 * 2 - 1
            verts.append(c + Vector((widths[i] * u, -bulge * (1 - u * u), 0)))
    for i in range(len(centers) - 1):
        for j in range(6):
            a = i * 7 + j
            faces.append((a, a + 1, a + 8, a + 7))
    o = bind(mesh_obj(name, verts, faces, navy))
    sol = o.modifiers.new('Silk thickness', 'SOLIDIFY'); sol.thickness = .12  # rig units: cm
    return o

for sg, side_name in ((-1, 'R'), (1, 'L')):
    center = Vector((sg * .118, -.004, 1.674))
    for direction in (-1, 1):
        # A closed ribbon loop flares out, folds back and pinches into its knot.
        verts, faces, edge_paths = [], [], [[], []]
        for i in range(33):
            t = i / 32
            c = center + Vector((sg * (.041 * sin(pi * t)), .023 * sin(2 * pi * t),
                                  direction * .038 * sin(pi * t)))
            w = .006 + .018 * sin(pi * t) ** .8
            across = Vector((.75, 0, -sg * direction * .66))
            for j in range(7):
                u = 2 * j / 6 - 1
                p = c + across * w * u + Vector((0, -.009 * (1 - u*u) * sin(pi*t), 0))
                verts.append(p)
                if j == 0: edge_paths[0].append(p)
                if j == 6: edge_paths[1].append(p)
        for i in range(32):
            for j in range(6):
                a = i * 7 + j; faces.append((a, a+1, a+8, a+7))
        o = bind(mesh_obj(f'Luna_Bow_{side_name}_Loop_{direction}', verts, faces, navy))
        mod = o.modifiers.new('Silk thickness', 'SOLIDIFY'); mod.thickness = .12
        for n, path in enumerate(edge_paths):
            bind(tube_obj(f'Luna_Bow_{side_name}_Piping_{direction}_{n}', path, .00065, gold, 4))
    for k in range(2):
        centers, widths = [], []
        for i in range(25):
            t = i / 24
            centers.append(center + Vector((sg * (.009 + .025 * k + .025 * sin(t * pi * 1.1)),
                                            .008 - .012 * sin(t * 2*pi + k),
                                            -(.185 + .055 * k) * t)))
            widths.append(.009 + .009 * sin(pi * t * .9))
        ribbon(f'Luna_Bow_{side_name}_Tail_{k}', centers, widths)
        for edge in (-1, 1):
            path = [p + Vector((w * edge, -.001, 0)) for p, w in zip(centers, widths)]
            bind(tube_obj(f'Luna_Bow_{side_name}_TailTrim_{k}_{edge}', path, .0006, gold, 4))
        c = centers[-1] + Vector((0, -.004, -.012))
        bind(star_obj(f'Luna_Bow_{side_name}_Star_{k}', c, (0,-1,0), .011, .0033, 4, .002, gold))
    knot = lock(f'Luna_Bow_{side_name}_Knot', [center + Vector((0,0,z)) for z in (-.014,0,.014)], .013, .011, navy)
    # Knot is attached to the head, like the loops.

# Dark fabric choker: retain the original fitted mesh and replace just the broad band faces.
choker = bpy.data.objects['CO_Necklace_Choker']
# Remove the old broad lower collar, which floated over the shoulders.
bm = bmesh.new(); bm.from_mesh(choker.data)
seen, kill = set(), []
for v in bm.verts:
    if v in seen: continue
    comp, stack = [], [v]; seen.add(v)
    while stack:
        q = stack.pop(); comp.append(q)
        for edge in q.link_edges:
            other = edge.other_vert(q)
            if other not in seen: seen.add(other); stack.append(other)
    pts = [choker.matrix_world @ q.co for q in comp]
    wide_collar = max(p.z for p in pts) < 1.523 and max(p.x for p in pts) - min(p.x for p in pts) > .15
    floating_chain = min(p.z for p in pts) < 1.515 and max(p.x for p in pts) - min(p.x for p in pts) < .10
    if wide_collar or floating_chain:
        kill.extend(comp)
bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(choker.data); bm.free()
choker.data.materials.append(navy)
for poly in choker.data.polygons:
    pts = [choker.matrix_world @ choker.data.vertices[i].co for i in poly.vertices]
    if len(pts) == 4 and min(p.z for p in pts) >= 1.522 and max(p.z for p in pts) <= 1.538:
        if max(p.z for p in pts) - min(p.z for p in pts) > .010:
            poly.material_index = len(choker.data.materials) - 1
front_y = min((choker.matrix_world @ v.co).y for v in choker.data.vertices
              if 1.522 < (choker.matrix_world @ v.co).z < 1.539)
cc = Vector((0, front_y - .005, 1.531))
bind(ring_obj('Luna_Choker_MoonRing', cc, (0,-1,0), .0115, .0018, gold, 32, 6), 'Neck00_Jnt')
bind(gem_obj('Luna_Choker_Moonstone', cc + Vector((0,-.003,0)), .0075, amethyst, .8, (0,-1,0), 10), 'Neck00_Jnt')
for sg in (-1, 1):
    bind(star_obj('Luna_Choker_Star', cc + Vector((sg*.024, .003,0)), (0,-1,0), .008, .002, 4, .001, gold), 'Neck00_Jnt')
    ear = Vector((sg * .078, -.012, 1.602))
    bind(ring_obj('Luna_Earring_Hoop', ear, (0,-1,0), .008, .0012, gold, 24, 5))
    chain = [ear + Vector((sg*.004*sin(pi*t), -.002, -.050*t)) for t in [i/12 for i in range(13)]]
    bind(tube_obj('Luna_Earring_Chain', chain, .0008, gold, 5))
    bind(star_obj('Luna_Earring_Star', chain[7], (0,-1,0), .010, .003, 4, .002, gold))
    bind(gem_obj('Luna_Earring_Drop', chain[-1], .0045, amethyst, 1.8, (0,0,-1), 8))

# Project every necklace point onto actual skin, rather than just pushing out
# points that collide (which leaves distant points floating in side views).
from mathutils.bvhtree import BVHTree
vertices, polygons = [], []
for name in ('Body_Geo','Face_Geo'):
    o = bpy.data.objects[name]; offset=len(vertices)
    vertices += [o.matrix_world @ v.co for v in o.data.vertices]
    polygons += [tuple(offset+i for i in p.vertices) for p in o.data.polygons]
skin_bvh = BVHTree.FromPolygons(vertices,polygons)
def on_chest(x,z):
    p,_,_,_ = skin_bvh.ray_cast(Vector((x,-.5,z)),Vector((0,1,0)),1.0)
    assert p is not None, (x,z)
    return p + Vector((0,-.004,0))
def necklace_weights(p):
    t=max(0,min(1,(1.52-p.z)/.07))
    return {'Neck00_Jnt':1-t,'Chest_Jnt':t}
for sg in (-1,1):
    path=[]
    for j in range(25):
        t=j/24
        path.append(on_chest(sg*.028*(1-t),1.522-.080*t))
    bind(tube_obj('Luna_Necklace_Chain',path,.00085,gold,6),necklace_weights)
remove('CO_Pendant_Gem')
pc=on_chest(0,1.428)
diamond=[pc+Vector((0,0,.012)),pc+Vector((.007,0,0)),pc+Vector((0,0,-.014)),pc+Vector((-.007,0,0)),pc+Vector((0,0,.012))]
bind(tube_obj('Luna_Necklace_DiamondSetting',diamond,.0012,gold,5),necklace_weights)
bind(gem_obj('Luna_Necklace_Diamond',pc+Vector((0,-.002,0)),.0055,amethyst,1.8,(0,0,-1),8),necklace_weights)

# Soft cloth contours retain the existing skin weights and UVs.
for name in ('CO_Skirt_Under','CO_Skirt_NavyPanels','CO_Skirt_Outer','CO_Skirt_FrontPanel','CO_Sleeve_L','CO_Sleeve_R'):
    o = bpy.data.objects[name]
    smooth = o.modifiers.new('Gentle cloth relaxation', 'SMOOTH'); smooth.factor = .38; smooth.iterations = 2
    sub = o.modifiers.new('Flowing cloth surface', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2

# Tailored vertical satin seams on the bodice.
bodice = bpy.data.objects['CO_Bodice']
for col in (4, 9, 55, 60):
    path = [bodice.matrix_world @ bodice.data.vertices[col * 12 + j].co for j in range(5, 12)]
    path = [p + Vector((0,-.0015,0)) for p in path]
    inherit_weights(tube_obj('Luna_Bodice_PrincessSeam', path, .00065, seam_mat, 4), bodice)

# Gold bell-sleeve hems follow the exact original terminal ring, with its cloth weights.
for name in ('CO_Sleeve_L', 'CO_Sleeve_R'):
    sleeve = bpy.data.objects[name]
    path = [sleeve.matrix_world @ v.co for v in list(sleeve.data.vertices)[-21:]]
    o = inherit_weights(tube_obj(name + '_GoldHem', path, .0013, gold, 6), sleeve)
    sub = o.modifiers.new('Smooth hem', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2

# Face retains the original eyes, makeup, UVs and expression topology.
face = bpy.data.objects['Face_Geo']
sub = face.modifiers.new('Smooth portrait surface', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1

# Neutral studio lighting keeps the reference's warm ivory / muted lavender palette readable.
for o in scene.objects:
    if o.type == 'LIGHT':
        if 'Rim' in o.name: o.data.energy *= .4
        if 'Key' in o.name: o.data.energy *= .82
        if 'Face' in o.name: o.data.energy *= .65
        o.data.color = (1, .94, .88) if 'gold' in o.name.lower() or 'Key' in o.name else (.87, .88, 1)
world = bpy.data.worlds.new('Luna • warm porcelain studio'); world.use_nodes = True; scene.world = world
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.42,.38,.43,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
floor = bpy.data.objects['Temple floor']
floor.scale = (200,200,1)
floor.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.50,.44,.47,1)
floor.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .75
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24 if os.getenv('LUNA_QUICK') else 32
scene.cycles.use_denoising = True
scene.render.image_settings.file_format = 'PNG'
scene.render.resolution_percentage = 100

def camera(name, location, target, scale):
    data = bpy.data.cameras.new(name); data.type = 'ORTHO'; data.ortho_scale = scale
    o = bpy.data.objects.new(name, data); scene.collection.objects.link(o)
    o.location = location
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z','Y').to_euler()
    return o
cams = {
    'front': camera('Luna • 01 Front', (0,-4,1.0), (0,0,.92), 2.10),
    'three_quarter': camera('Luna • 02 Three-quarter', (2.25,-4,1.55), (0,0,.93), 2.12),
    'side': camera('Luna • 03 Side', (4,0,1.04), (0,0,.92), 2.10),
    'back': camera('Luna • 04 Back', (0,4,1.06), (0,0,.92), 2.10),
    'face': camera('Luna • 05 Face', (.16,-3,1.67), (0,0,1.60), .53),
}

# Reference is packed into the .blend and can be toggled on in the Outliner.
ref_coll = bpy.data.collections.new('REFERENCE • toggle to compare'); scene.collection.children.link(ref_coll)
ref_img = bpy.data.images.load(str(HERE / 'references/luna_concept.png')); ref_img.pack()
ref = bpy.data.objects.new('Luna • original concept sheet', None); ref_coll.objects.link(ref)
ref.empty_display_type = 'IMAGE'; ref.data = ref_img; ref.empty_display_size = 2.5
ref.location = (2.0,.55,1); ref.rotation_euler = (pi/2,0,0); ref.hide_render = True; ref.hide_set(True)

# Semantic part collections make repeated refinements easy.
collections = {}
for label in ('01 Body and face','02 Hair','03 Ribbons and jewelry','04 Dress','05 Studio'):
    c = bpy.data.collections.new(label); scene.collection.children.link(c); collections[label] = c
for o in list(scene.objects):
    if o == ref: continue
    n = o.name
    if n.startswith('Luna_Hair') or n.startswith('Hair'): label = '02 Hair'
    elif any(x in n for x in ('Bow','Choker','Earring','Medallion','Anklet','Lantern','Pendant','Arm_Gold')): label = '03 Ribbons and jewelry'
    elif n.startswith('CO_') or 'Bodice_' in n: label = '04 Dress'
    elif o == rig or n in ('Body_Geo','Face_Geo','Mouth_Geo','EBrows_Geo'): label = '01 Body and face'
    else: label = '05 Studio'
    for c in list(o.users_collection): c.objects.unlink(o)
    collections[label].objects.link(o)

scene.camera = cams['three_quarter']
scene.render.resolution_x = 1000; scene.render.resolution_y = 1300
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = face
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.shading.type = 'MATERIAL'
            space.shading.use_scene_lights = True
            space.shading.use_scene_world = True
            space.overlay.show_overlays = False
            space.region_3d.view_perspective = 'CAMERA'
            space.region_3d.view_camera_zoom = 8

# Rig and skinning validation, separate from runtime animation certification.
meshes = [o for o in scene.objects if o.type == 'MESH' and o != floor]
report = {'base': 'source/luna_base.blend', 'blender': bpy.app.version_string,
          'tripo_generation_used': False, 'bones': len(rig.data.bones), 'rig_unchanged': True,
          'mesh_objects': len(meshes), 'unweighted_vertices': {}, 'invalid_groups': [], 'nonfinite_vertices': [],
          'animation_clips_tested': [], 'runtime_ready': False}
for b in rig.data.bones:
    parent, mat = rest[b.name]
    report['rig_unchanged'] &= parent == (b.parent.name if b.parent else None) and b.matrix_local == mat
for o in meshes:
    if any(m.type == 'ARMATURE' for m in o.modifiers):
        bad = sum(1 for v in o.data.vertices if abs(sum(g.weight for g in v.groups) - 1) > .015)
        if bad: report['unweighted_vertices'][o.name] = bad
        report['invalid_groups'] += [(o.name,g.name) for g in o.vertex_groups if g.name not in rig.data.bones]
    if not all(math.isfinite(x) for v in o.data.vertices for x in v.co):
        report['nonfinite_vertices'].append(o.name)
report['triangles_base'] = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
assert report['rig_unchanged'] and not report['invalid_groups'] and not report['nonfinite_vertices']
assert not report['unweighted_vertices'], report['unweighted_vertices']
for img in bpy.data.images:
    if img.source == 'FILE' and img.users and not img.packed_file:
        img.pack()
report['all_used_file_images_packed'] = all(i.packed_file for i in bpy.data.images if i.source == 'FILE' and i.users)
(OUT / 'validation.json').write_text(json.dumps(report, indent=2))
scene['Luna_Workflow'] = 'See 3d-modeling/knowledge/tripo-workflow.md and luna/WORKLOG.md'
scene['Luna_Revision'] = '2026-10-19 / continuous crown hair v2'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'luna_refined.blend'))
print('LUNA_SAVED', json.dumps(report), flush=True)
if not os.getenv('LUNA_NO_RENDER'):
    views = ('front','face') if os.getenv('LUNA_QUICK') else tuple(cams)
    for key in views:
        scene.camera = cams[key]
        scene.render.resolution_x = 750 if os.getenv('LUNA_QUICK') else 1100
        scene.render.resolution_y = scene.render.resolution_x if key == 'face' else int(scene.render.resolution_x * 1.3)
        scene.render.filepath = str(PREV / f'{key}.png')
        bpy.ops.render.render(write_still=True)
        print('LUNA_RENDER', key, flush=True)
print('LUNA_DONE', flush=True)
