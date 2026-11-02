"""Cheese (치즈) — the chubby orange tabby of the story "수호신 치즈냥이", built in code.

Proportions follow references/Turnaround.png (wide heavy chest and belly, natural leg length, a
thick banded tail); the face follows references/Expressions.png (heavy half-closed upper lids,
amber eyes with round pupils, a white muzzle that runs into the chest bib, a small ω mouth).

The body is a metaball blob converted to a mesh, coloured per vertex (orange / darker tabby
stripes / cream bib-muzzle-paws). Eyes, lids, nose, mouth, ears, whiskers and tail are their own
objects so the expression variants can be swapped without touching the body:

    build_cat(pose='sit'|'loaf', expr='idle'|'blink'|'talk'|'smug') -> root empty

Local frame: the cat faces -Y, Z up, origin on the floor between its feet. Units: metres.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector, noise

# Linear colours (sRGB from the turnaround converted by eye in renders).
ORANGE = (0.80, 0.25, 0.045)
STRIPE = (0.40, 0.085, 0.015)
CREAM = (0.90, 0.79, 0.62)
PINK = (0.88, 0.42, 0.40)
OUTLINE = (0.12, 0.05, 0.02)


def _mat(name, rgb=None, rough=0.75, vcol=False, emit=0.0, sheen=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    if "Sheen Weight" in b.inputs and sheen:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Roughness"].default_value = 0.6
    if vcol:
        a = nt.nodes.new("ShaderNodeVertexColor")
        a.layer_name = "Col"
        nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
        # A soft subsurface reads as fur rather than plastic under the window light.
        if "Subsurface Weight" in b.inputs:
            b.inputs["Subsurface Weight"].default_value = 0.08
            b.inputs["Subsurface Radius"].default_value = (0.8, 0.35, 0.2)
            b.inputs["Subsurface Scale"].default_value = 0.02
    else:
        b.inputs["Base Color"].default_value = (*rgb, 1)
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


def _link(o, coll):
    coll.objects.link(o)
    return o


def _mesh(name, bm, mat, coll, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    me.materials.append(mat)
    return _link(bpy.data.objects.new(name, me), coll)


# ---------------------------------------------------------------- body (metaballs)

def _elements(pose):
    """(type, co, radius, extra) — tuned against the turnaround in previews/turnaround_*.png."""
    E = []
    if pose == 'sit':
        # haunches + belly: the widest part, low and heavy
        E += [('ELLIPSOID', (0, 0.05, 0.13), 0.20, (1.12, 1.0, 0.82))]
        E += [('BALL', (sx * 0.10, 0.07, 0.10), 0.14, None) for sx in (-1, 1)]
        # chest: deep and round, pushed forward
        E += [('ELLIPSOID', (0, -0.035, 0.25), 0.16, (1.0, 0.95, 1.05))]
        # neck blends straight into the head (no visible neck — it is that kind of cat)
        E += [('BALL', (0, -0.045, 0.34), 0.12, None)]
        head = Vector((0, -0.06, 0.43))
        # front legs: short thick columns, slightly splayed
        for sx in (-1, 1):
            E += [('CAPSULE', (sx * 0.06, -0.085, 0.12), 0.055, (0.07, Vector((sx * 0.08, -0.15, 1.0))))]
            E += [('ELLIPSOID', (sx * 0.062, -0.115, 0.03), 0.055, (1.0, 1.25, 0.62))]
            # hind feet peeking out beside the front paws
            E += [('ELLIPSOID', (sx * 0.135, -0.055, 0.03), 0.06, (0.9, 1.5, 0.6))]
    else:  # loaf: lying with paws tucked, head low on the forepaws, eyes shut (the nap)
        E += [('ELLIPSOID', (0, 0.06, 0.11), 0.22, (1.08, 1.45, 0.62))]
        E += [('ELLIPSOID', (0, -0.08, 0.13), 0.17, (1.1, 1.0, 0.78))]
        E += [('BALL', (0, -0.12, 0.19), 0.12, None)]
        head = Vector((0, -0.17, 0.25))
        for sx in (-1, 1):
            E += [('ELLIPSOID', (sx * 0.06, -0.24, 0.035), 0.055, (1.0, 1.3, 0.6))]
            E += [('BALL', (sx * 0.12, 0.10, 0.07), 0.12, None)]
    # head: broad and flat-topped with full cheeks
    E += [('ELLIPSOID', tuple(head), 0.145, (1.22, 1.0, 0.94))]
    E += [('BALL', tuple(head + Vector((sx * 0.075, -0.035, -0.035))), 0.085, None) for sx in (-1, 1)]
    # muzzle pads
    E += [('BALL', tuple(head + Vector((sx * 0.024, -0.105, -0.045))), 0.042, None) for sx in (-1, 1)]
    E += [('BALL', tuple(head + Vector((0, -0.095, -0.07))), 0.035, None)]  # chin
    return E, head


def _body(pose, coll):
    mb = bpy.data.metaballs.new("CheeseMB")
    # 0.007 left vertex colours visibly stair-stepped at the bib and stripe edges in the 1170px
    # plates (11-01); 0.0042 is ~3x the vertices and smooth at that size.
    mb.resolution = 0.0042
    mb.render_resolution = 0.0042
    # Measured (scratch test): stiffness 2 + threshold 0.3 puts a lone ball's surface at 0.685 of
    # its radius, so radii below are VISIBLE radii and get divided by that. Ellipsoid sizes are
    # multipliers of the radius; a capsule's size_x is its absolute half-length.
    mb.threshold = 0.3
    elems, head = _elements(pose)
    for kind, co, r, extra in elems:
        el = mb.elements.new(type=kind)
        el.co = co
        el.radius = r / 0.685
        el.stiffness = 2.0
        if kind == 'ELLIPSOID':
            el.size_x, el.size_y, el.size_z = extra
        elif kind == 'CAPSULE':
            half, axis = extra
            el.size_x = half
            el.rotation = Vector((1, 0, 0)).rotation_difference(axis.normalized())
    tmp = bpy.data.objects.new("CheeseMB", mb)
    coll.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.metaballs.remove(mb)
    me.name = "Cheese_Body"
    body = bpy.data.objects.new("Cheese_Body", me)
    coll.objects.link(body)
    # Smooth out the metaball facets a little, then shade smooth.
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    _paint_body(me, pose, head)
    me.materials.append(_mat("Cheese_Fur", vcol=True, rough=0.85))
    return body, head


def _smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def _mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def _paint_body(me, pose, head):
    col = me.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        p = v.co
        n = v.normal
        rel = p - head
        c = ORANGE
        # --- tabby stripes: bands that wrap around the body, wavy (noise-distorted) ---
        wob = noise.noise(p * 9.0) * 0.6
        if pose == 'sit':
            band = math.sin((p.z * 46.0 + abs(p.x) * 10.0 + p.y * 14.0) + wob * 2.2)
        else:
            band = math.sin((p.y * 32.0 + abs(p.x) * 8.0 - p.z * 10.0) + wob * 2.2)
        # stripes are strongest on the back and flanks, fade toward the belly/front
        side = _smooth(-0.2, 0.5, n.y) * 0.6 + _smooth(0.2, 0.9, abs(n.x)) * 0.6
        if rel.length < 0.17:  # head: thin forehead lines and cheek stripes
            band = math.sin(p.x * 80.0 + wob * 2.5 + rel.z * 20.0) if rel.z > 0.03 else math.sin(rel.z * 120.0 + abs(rel.x) * 30 + wob)
            side = _smooth(0.02, 0.09, rel.z) * _smooth(0.2, -0.6, n.y) + _smooth(0.06, 0.12, abs(rel.x)) * 0.7
        s = _smooth(0.25, 0.6, band) * min(1.0, side * 1.4)
        c = _mix(c, STRIPE, s * 0.8)
        # --- cream: muzzle and chin, the bib down the chest, belly, paws ---
        white = 0.0
        if rel.length < 0.2:
            # lower face: below the eyes, in front, narrowing upward between the eyes
            fz = rel.z + 0.01
            width = 0.078 - max(0.0, fz) * 1.1
            w_face = (1.0 - _smooth(width - 0.014, width + 0.006, abs(rel.x))) \
                * _smooth(0.03, 0.005, fz) * _smooth(-0.03, -0.07, rel.y)
            w_chin = _smooth(-0.05, -0.085, rel.z) * _smooth(0.4, -0.1, n.y)
            white = max(w_face, w_chin)
        if pose == 'sit':
            # V-shaped bib from the throat to the belly
            if 0.03 < p.z < 0.40:
                half_w = 0.025 + (p.z - 0.03) * 0.24
                front = _smooth(-0.15, -0.5, n.y)
                white = max(white, front * (1.0 - _smooth(half_w - 0.02, half_w + 0.012, abs(p.x))))
            white = max(white, _smooth(0.075, 0.05, p.z) * _smooth(0.05, -0.02, p.y))  # paws and toes
        else:
            if p.z < 0.08 and n.z < -0.2:
                white = 1.0
            if p.y < -0.18 and p.z < 0.07:
                white = 1.0
            if n.y < -0.4 and p.z < 0.2 and abs(p.x) < 0.08:
                white = max(white, 0.9)
        c = _mix(c, CREAM, white)
        col.data[v.index].color = (*c, 1.0)


# ---------------------------------------------------------------- face

def _surface(body, origin, direction):
    """World-free ray cast against the body mesh (body has identity transform at build time)."""
    ok, loc, nrm, _ = body.ray_cast(origin, direction.normalized())
    return (loc, nrm) if ok else (None, None)


def _sphere(name, center, radii, mat, coll, segs=24, rings=16, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    m = Matrix.Diagonal((*radii, 1.0))
    if rot is not None:
        m = rot.to_matrix().to_4x4() @ m
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ m, verts=bm.verts)
    return _mesh(name, bm, mat, coll)


def _tube(name, pts, radius, mat, coll, sides=10, cap=True):
    """A tube along pts; radius may be a function of t in [0,1]."""
    bm = bmesh.new()
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        t = i / (n - 1)
        r = radius(t) if callable(radius) else radius
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        a = d.cross(up).normalized()
        b = d.cross(a).normalized()
        ring = [bm.verts.new(p + (a * math.cos(k / sides * 2 * math.pi) + b * math.sin(k / sides * 2 * math.pi)) * r)
                for k in range(sides)]
        rings.append(ring)
    for i in range(n - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    if cap:
        for ring, rev in ((rings[0], True), (rings[-1], False)):
            c = bm.verts.new(sum((v.co for v in ring), Vector()) / sides)
            for k in range(sides):
                f = (ring[k], ring[(k + 1) % sides], c)
                bm.faces.new(tuple(reversed(f)) if rev else f)
    return _mesh(name, bm, mat, coll)


def _face(body, head, pose, expr, coll):
    parts = []
    eye_mat = _mat("Cheese_Eye", (0.70, 0.30, 0.02), rough=0.15)
    pupil_mat = _mat("Cheese_Pupil", (0.01, 0.006, 0.004), rough=0.1)
    glint_mat = _mat("Cheese_Glint", (1, 1, 1), emit=4.0)
    line_mat = _mat("Cheese_Line", OUTLINE, rough=0.6)
    nose_mat = _mat("Cheese_Nose", (0.75, 0.30, 0.28), rough=0.4)
    mouth_mat = _mat("Cheese_Mouth", (0.35, 0.06, 0.05), rough=0.5)
    lid_mat = bpy.data.materials["Cheese_Fur"]  # lids carry the fur colour via their own vcol
    whisker_mat = _mat("Cheese_Whisker", (0.9, 0.86, 0.8), rough=0.5)

    closed = expr == 'blink' or pose == 'loaf'
    for sx in (-1, 1):
        # where the eye sits: a ray from in front of the face toward the head centre
        target = head + Vector((sx * 0.066, 0, 0.022))
        loc, nrm = _surface(body, target + Vector((0, -0.4, 0)), Vector((0, 1, 0)))
        if loc is None:
            continue
        fwd = (nrm * 0.5 + Vector((0, -1, 0)) * 0.5).normalized()
        rot = Vector((0, -1, 0)).rotation_difference(fwd)
        c = loc + fwd * 0.004
        if closed:
            # a closed eye: a soft downward arc
            pts = [c + rot @ Vector((sx * (u * 0.026), -0.004, -0.006 * (1 - u * u) + 0.002)) for u in
                   [i / 8 * 2 - 1 for i in range(9)]]
            parts.append(_tube(f"Cheese_EyeClosed_{sx}", pts, 0.0024, line_mat, coll, sides=6))
            continue
        # amber eyeball (an almond: wide, a little flat)
        parts.append(_sphere(f"Cheese_Eye_{sx}", c, (0.032, 0.013, 0.027), eye_mat, coll, rot=rot))
        # round pupil, a bit low and toward the nose
        pc = c + rot @ Vector((-sx * 0.003, -0.0105, -0.003))
        parts.append(_sphere(f"Cheese_Pupil_{sx}", pc, (0.0105, 0.003, 0.0118), pupil_mat, coll, rot=rot))
        parts.append(_sphere(f"Cheese_Glint_{sx}", pc + rot @ Vector((sx * 0.004, -0.002, 0.005)),
                             (0.0028, 0.0015, 0.0028), glint_mat, coll, rot=rot))
        # heavy upper lid: a fur-coloured shell covering the top of the eye with a flat lower edge.
        # 'smug' lowers it further (C05: eyes narrowed); idle/talk keep the half-lidded default.
        lid_drop = {'smug': 0.0055, 'idle': 0.001, 'talk': 0.001}.get(expr, 0.001)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0)
        cut_z = 0.10 - lid_drop / 0.027
        # keep the upper part of the sphere only, slanting the edge down toward the temples
        for v in list(bm.verts):
            if v.co.z < cut_z - 0.18 * (v.co.x * sx):
                bm.verts.remove(v)
        bmesh.ops.transform(bm, matrix=Matrix.Translation(c + rot @ Vector((0, -0.0015, 0))) @ rot.to_matrix().to_4x4()
                            @ Matrix.Diagonal((0.0345, 0.0165, 0.0295, 1)), verts=bm.verts)
        lid = _mesh(f"Cheese_Lid_{sx}", bm, lid_mat, coll)
        _flat_vcol(lid, ORANGE)
        parts.append(lid)
        # the dark lid line along that edge
        pts = []
        for i in range(11):
            u = i / 10 * 2 - 1
            z = cut_z - 0.18 * (u * sx * 0.98)
            r = math.sqrt(max(0.0, 1 - z * z))
            x = u * r * 0.98
            y = -math.sqrt(max(0.0, r * r - x * x))
            pts.append(c + rot @ Vector((x * 0.0345, y * 0.0165 - 0.0012, z * 0.0295)))
        parts.append(_tube(f"Cheese_LidLine_{sx}", pts, 0.0016, line_mat, coll, sides=6))

    # nose: a small rounded triangle at the top of the muzzle
    nloc, nn = _surface(body, head + Vector((0, -0.4, -0.022)), Vector((0, 1, 0)))
    if nloc is not None:
        bm = bmesh.new()
        tri = [Vector((-0.013, 0, 0.006)), Vector((0.013, 0, 0.006)), Vector((0, 0, -0.009))]
        vs = [bm.verts.new(nloc + Vector((0, -0.003, 0)) + t) for t in tri]
        back = [bm.verts.new(nloc + Vector((0, 0.006, 0)) + t * 0.8) for t in tri]
        bm.faces.new(vs)
        for i in range(3):
            bm.faces.new((vs[(i + 1) % 3], vs[i], back[i], back[(i + 1) % 3]))
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
        parts.append(_mesh("Cheese_Nose", bm, nose_mat, coll))
        # mouth: philtrum line + the ω
        m0 = nloc + Vector((0, -0.002, -0.009))
        parts.append(_tube("Cheese_Philtrum", [m0, m0 + Vector((0, 0.001, -0.009))], 0.0014, line_mat, coll, sides=6))
        mc = m0 + Vector((0, 0.001, -0.009))
        for sx in (-1, 1):
            pts = []
            for i in range(9):
                u = i / 8
                x = sx * u * 0.017
                z = -0.005 * math.sin(u * math.pi) + (0.003 * u * u if expr != 'talk' else 0.0)
                p = mc + Vector((x, 0, z))
                hit, _ = _surface(body, p + Vector((0, -0.2, 0)), Vector((0, 1, 0)))
                pts.append((hit if hit is not None else p) + Vector((0, -0.0015, 0)))
            parts.append(_tube(f"Cheese_Mouth_{sx}", pts, 0.0014, line_mat, coll, sides=6))
        if expr == 'talk':
            # C03: the mouth opens only a little — no wide human mouth
            parts.append(_sphere("Cheese_MouthOpen", mc + Vector((0, -0.002, -0.006)), (0.008, 0.004, 0.0065),
                                 mouth_mat, coll))
        # whiskers: three per side fanning from the muzzle pads
        for sx in (-1, 1):
            base = nloc + Vector((sx * 0.03, 0.006, -0.016))
            for k, (dz, ln) in enumerate(((0.012, 0.11), (0.0, 0.12), (-0.012, 0.105))):
                d = Vector((sx * 1.0, -0.25, dz * 9)).normalized()
                pts = [base + Vector((0, 0, dz * 0.4)) + d * ln * (i / 6) + Vector((0, 0, -0.012 * (i / 6) ** 2))
                       for i in range(7)]
                parts.append(_tube(f"Cheese_Whisker_{sx}_{k}", pts, lambda t: 0.0009 * (1 - 0.7 * t),
                                   whisker_mat, coll, sides=5, cap=False))
    return parts


def _flat_vcol(o, rgb):
    col = o.data.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
    for i in range(len(o.data.vertices)):
        col.data[i].color = (*rgb, 1.0)


def _ears(body, head, coll):
    parts = []
    fur = bpy.data.materials["Cheese_Fur"]
    for sx in (-1, 1):
        base = head + Vector((sx * 0.098, 0.005, 0.085))
        tip = head + Vector((sx * 0.14, 0.02, 0.205))
        # a rounded pyramid: base ellipse, tip point
        bm = bmesh.new()
        n = 14
        ring = []
        across = Vector((sx * 1.0, 0, -0.55)).normalized()
        depth = Vector((0, 1, 0))
        for k in range(n):
            a = k / n * 2 * math.pi
            ring.append(bm.verts.new(base + across * math.cos(a) * 0.05 + depth * math.sin(a) * 0.028))
        apex = bm.verts.new(tip)
        mid = [bm.verts.new(base.lerp(tip, 0.55) + (ring[k].co - base) * 0.55) for k in range(n)]
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((ring[k], ring[k2], mid[k2], mid[k]))
            bm.faces.new((mid[k], mid[k2], apex))
        bc = bm.verts.new(base - Vector((0, 0, 0.01)))
        for k in range(n):
            bm.faces.new((ring[(k + 1) % n], ring[k], bc))
        ear = _mesh(f"Cheese_Ear_{sx}", bm, fur, coll)
        col = ear.data.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
        for v in ear.data.vertices:
            col.data[v.index].color = (*ORANGE, 1.0)
        # tips a touch darker
        for v in ear.data.vertices:
            if (v.co - tip).length < 0.03:
                col.data[v.index].color = (*STRIPE, 1.0)
        parts.append(ear)
        # pink inner ear with a cream tuft, facing forward
        inner_c = base.lerp(tip, 0.38) + Vector((0, -0.016, 0))
        inner = _sphere(f"Cheese_EarIn_{sx}", inner_c, (0.026, 0.006, 0.045),
                        _mat("Cheese_EarPink", PINK, rough=0.6), coll,
                        rot=Vector((0, 0, 1)).rotation_difference((tip - base).normalized()))
        parts.append(inner)
        tuft = _sphere(f"Cheese_EarTuft_{sx}", inner_c + Vector((-sx * 0.006, -0.004, -0.012)), (0.007, 0.003, 0.013),
                       _mat("Cheese_Cream", CREAM, rough=0.9), coll,
                       rot=Vector((0, 0, 1)).rotation_difference((tip - base).normalized()))
        parts.append(tuft)
    return parts


def _tail(pose, coll):
    if pose == 'sit':
        # from the rump, round the right haunch, curling in front of the paws (turnaround front view)
        ctrl = [(0.02, 0.24, 0.07), (0.16, 0.22, 0.05), (0.25, 0.08, 0.045), (0.22, -0.08, 0.045),
                (0.12, -0.17, 0.045), (0.02, -0.19, 0.05)]
    else:
        ctrl = [(0.0, 0.33, 0.08), (0.17, 0.30, 0.06), (0.24, 0.12, 0.05), (0.22, -0.06, 0.05),
                (0.14, -0.2, 0.05)]
    ctrl = [Vector(c) for c in ctrl]
    # Catmull-Rom through the control points
    pts = []
    for i in range(len(ctrl) - 1):
        p0 = ctrl[max(i - 1, 0)]
        p1, p2 = ctrl[i], ctrl[i + 1]
        p3 = ctrl[min(i + 2, len(ctrl) - 1)]
        for k in range(8):
            t = k / 8
            t2, t3 = t * t, t * t * t
            pts.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    pts.append(ctrl[-1])
    tail = _tube("Cheese_Tail", pts, lambda t: 0.042 * (1 - 0.15 * t) * (1 if t < 0.9 else 1 - (t - 0.9) * 4),
                 bpy.data.materials["Cheese_Fur"], coll, sides=14)
    # banded: dark rings along the length, cream-free, darker tip
    me = tail.data
    col = me.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
    sides = 14
    n = len(pts)
    for v in me.vertices:
        ring = min(v.index // sides, n - 1)
        t = ring / (n - 1)
        band = _smooth(0.3, 0.7, math.sin(t * 30.0))
        c = _mix(ORANGE, STRIPE, band * 0.9)
        if t > 0.93:
            c = STRIPE
        col.data[v.index].color = (*c, 1.0)
    return tail


def build_cat(coll, pose='sit', expr='idle', name="Cheese"):
    """Builds Cheese into `coll` and returns an empty that owns every part (move/rotate that)."""
    body, head = _body(pose, coll)
    parts = [body]
    parts += _face(body, head, pose, expr, coll)
    parts += _ears(body, head, coll)
    parts.append(_tail(pose, coll))
    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    for p in parts:
        p.parent = root
    root["head_local"] = list(head)
    return root
