"""Reusable Blender mesh primitives, extracted from the original Luna builder.
All dimensions are world-space metres; bind to a rig after creation.
"""
import bpy
from math import sin, cos, pi
from mathutils import Vector
scene = bpy.context.scene

def mesh_obj(name, verts, faces, m, uvs=None):
    d = bpy.data.meshes.new(name); d.from_pydata([tuple(v) for v in verts], [], faces); d.update()
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); d.materials.append(m)
    if uvs is not None:
        uv = d.uv_layers.new(name='UVMap')
        for poly in d.polygons:
            for li in poly.loop_indices: uv.data[li].uv = uvs[d.loops[li].vertex_index]
    for p in d.polygons: p.use_smooth = True
    return o

def tube_obj(name, path, radius, m, sides=8, cap=False):
    """path: list of points, radius: float or fn(t)."""
    verts = []; faces = []; n = len(path)
    for i, p in enumerate(path):
        tg = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        a = tg.cross(Vector((0, 0, 1)) if abs(tg.z) < .9 else Vector((1, 0, 0))).normalized(); b = tg.cross(a)
        r = radius(i / (n - 1)) if callable(radius) else radius
        for k in range(sides):
            th = 2 * pi * k / sides; verts.append(p + r * (a * cos(th) + b * sin(th)))
    for i in range(n - 1):
        for k in range(sides):
            faces.append((i * sides + k, i * sides + (k + 1) % sides, (i + 1) * sides + (k + 1) % sides, (i + 1) * sides + k))
    if cap: faces.append(tuple(range(sides))[::-1]); faces.append(tuple((n - 1) * sides + k for k in range(sides)))
    return mesh_obj(name, verts, faces, m)

def ring_obj(name, center, normal, R, r, m, seg=24, sides=6, squash=1.0):
    c = Vector(center); nz = Vector(normal).normalized()
    a = nz.cross(Vector((0, 0, 1)) if abs(nz.z) < .9 else Vector((1, 0, 0))).normalized(); b = nz.cross(a)
    path = [c + R * (a * cos(2 * pi * i / seg) + b * sin(2 * pi * i / seg)) for i in range(seg)]
    verts = []; faces = []
    for i, p in enumerate(path):
        out = (p - c).normalized()
        for k in range(sides):
            th = 2 * pi * k / sides; verts.append(p + r * (out * cos(th) + nz * sin(th) * squash))
    for i in range(seg):
        for k in range(sides):
            i2 = (i + 1) % seg; faces.append((i * sides + k, i2 * sides + k, i2 * sides + (k + 1) % sides, i * sides + (k + 1) % sides))
    return mesh_obj(name, verts, faces, m)

def gem_obj(name, center, size, m, elong=1.6, axis=(0, 0, -1), seg=8):
    """Faceted teardrop gem pointing along axis."""
    c = Vector(center); ax = Vector(axis).normalized()
    a = ax.cross(Vector((1, 0, 0)) if abs(ax.x) < .9 else Vector((0, 1, 0))).normalized(); b = ax.cross(a)
    verts = [c - ax * size * .6]
    for k in range(seg):
        th = 2 * pi * k / seg; verts.append(c + size * (a * cos(th) + b * sin(th)))
    verts.append(c + ax * size * elong)
    faces = [(0, 1 + (k + 1) % seg, 1 + k) for k in range(seg)] + [(1 + k, 1 + (k + 1) % seg, seg + 1) for k in range(seg)]
    o = mesh_obj(name, verts, faces, m)
    for p in o.data.polygons: p.use_smooth = False
    return o

def star_obj(name, center, normal, R, r_in, points, depth, m, up=(0, 0, 1)):
    c = Vector(center); nz = Vector(normal).normalized(); upv = Vector(up)
    a = (upv - nz * upv.dot(nz)).normalized(); b = a.cross(nz)
    outline = []
    for k in range(points * 2):
        th = pi * k / points; rr = R if k % 2 == 0 else r_in
        outline.append(c + rr * (a * cos(th) + b * sin(th)))
    verts = outline + [p + nz * depth for p in outline] + [c + nz * depth * 1.6, c]
    n = len(outline); faces = []
    for k in range(n):
        k2 = (k + 1) % n; faces.append((k, k2, n + k2, n + k)); faces.append((n + k, n + k2, 2 * n))
        faces.append((k2, k, 2 * n + 1))
    o = mesh_obj(name, verts, faces, m)
    for p in o.data.polygons: p.use_smooth = False
    return o
