"""Minimal Maya ASCII (.ma) mesh importer for Blender (no Maya needed).

Parses `createNode transform/mesh` blocks and their setAttr data:
  .vt (vertices), .pt (tweaks), .ed (edges), .fc polyFaces (f / mu / h),
  .uvst[0].uvsp (UV set 0), transform .t/.r/.s and -p parenting.
Construction history (e.g. polySoftEdge feeding a shape) is ignored: an
intermediate shape that carries the real geometry (polySurfaceShape1 under
eyeslash) is imported as its own object.

Usage (headless):
  Blender -b --python tools/blender/import_maya_ascii.py -- <file.ma> [out.blend]
or import `parse_ma` / `build_scene` from another Blender script.
The .ma is treated as data only (MEL/script nodes are never executed).
"""
import math
import re
import sys

_NUM = re.compile(r"^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$")


def _statements(text):
    """Yield (kind, tokens) for createNode / setAttr statements, in order."""
    buf = []
    in_str = False
    for line in text.splitlines():
        s = line.strip()
        if not buf and not (s.startswith("createNode") or s.startswith("setAttr")):
            continue
        buf.append(s)
        # statement ends at an unquoted ';' at end of line
        if s.endswith(";") and s.count('"') % 2 == 0:
            stmt = " ".join(buf)[:-1]
            buf = []
            yield stmt
        elif len(buf) == 1 and not s.startswith(("createNode", "setAttr")):
            buf = []


def _tokens(stmt):
    return re.findall(r'"[^"]*"|\S+', stmt)


def _range(attr):
    m = re.search(r"\[(\d+)(?::(\d+))?\]$", attr)
    if not m:
        return None
    a = int(m.group(1))
    b = int(m.group(2)) if m.group(2) else a
    return a, b


def parse_ma(path):
    with open(path, "r", encoding="latin-1") as f:
        text = f.read()
    nodes = {}
    cur = None
    for stmt in _statements(text):
        tok = _tokens(stmt)
        if tok[0] == "createNode":
            ntype = tok[1]
            name = parent = None
            i = 2
            while i < len(tok):
                if tok[i] == "-n":
                    name = tok[i + 1].strip('"'); i += 2
                elif tok[i] == "-p":
                    parent = tok[i + 1].strip('"'); i += 2
                else:
                    i += 1
            cur = {"type": ntype, "name": name, "parent": parent,
                   "vt": {}, "pt": {}, "ed": {}, "uv": {}, "faces": [],
                   "t": (0, 0, 0), "r": (0, 0, 0), "s": (1, 1, 1)}
            if ntype in ("mesh", "transform"):
                nodes[name] = cur
            continue
        if cur is None or cur["type"] not in ("mesh", "transform"):
            continue
        # setAttr [-k off] [-s N] ".attr" [-type "t"] values...
        i = 1
        attr = None
        while i < len(tok):
            if tok[i].startswith('".'):
                attr = tok[i].strip('"'); i += 1; break
            i += 2 if tok[i] in ("-k", "-s", "-l", "-av", "-cb") else 1
        if attr is None:
            continue
        dtype = None
        if i < len(tok) and tok[i] == "-type":
            dtype = tok[i + 1].strip('"'); i += 2
        vals = tok[i:]
        base = attr.split("[")[0] if not attr.startswith(".uvst") else attr.rsplit("[", 1)[0]
        if cur["type"] == "transform" and attr in (".t", ".r", ".s") and dtype == "double3":
            cur[attr[1]] = tuple(float(v) for v in vals[:3])
            continue
        if cur["type"] != "mesh":
            continue
        rng = _range(attr)
        if base == ".vt" and rng:
            f = [float(v) for v in vals if _NUM.match(v)]
            for k in range(rng[1] - rng[0] + 1):
                cur["vt"][rng[0] + k] = tuple(f[3 * k:3 * k + 3])
        elif base == ".pt" and rng:
            f = [float(v) for v in vals if _NUM.match(v)]
            for k in range(rng[1] - rng[0] + 1):
                cur["pt"][rng[0] + k] = tuple(f[3 * k:3 * k + 3])
        elif base == ".ed" and rng:
            f = [int(float(v)) for v in vals if _NUM.match(v)]
            for k in range(rng[1] - rng[0] + 1):
                cur["ed"][rng[0] + k] = (f[3 * k], f[3 * k + 1])
        elif base == ".uvst[0].uvsp" and rng:
            f = [float(v) for v in vals if _NUM.match(v)]
            for k in range(rng[1] - rng[0] + 1):
                cur["uv"][rng[0] + k] = (f[2 * k], f[2 * k + 1])
        elif base == ".fc":
            j = 0
            face = None
            while j < len(vals):
                t = vals[j]
                if t == "f":
                    n = int(vals[j + 1])
                    face = {"e": [int(x) for x in vals[j + 2:j + 2 + n]], "uv": None, "hole": False}
                    cur["faces"].append(face)
                    j += 2 + n
                elif t == "h":
                    n = int(vals[j + 1])
                    if face is not None:
                        face["hole"] = True
                    j += 2 + n
                elif t == "mu":
                    uvset = int(vals[j + 1]); n = int(vals[j + 2])
                    if uvset == 0 and face is not None:
                        face["uv"] = [int(x) for x in vals[j + 3:j + 3 + n]]
                    j += 3 + n
                elif t in ("fc", "mc"):
                    n = int(vals[j + 1]) if t == "fc" else int(vals[j + 2])
                    j += (2 if t == "fc" else 3) + n
                else:
                    j += 1
    return nodes


def mesh_arrays(node):
    """-> (verts, faces(list of vertex idx lists), face_uvs(list of uv lists or None))"""
    n = max(node["vt"]) + 1 if node["vt"] else 0
    verts = []
    for i in range(n):
        v = node["vt"].get(i, (0, 0, 0))
        p = node["pt"].get(i)
        if p:
            v = (v[0] + p[0], v[1] + p[1], v[2] + p[2])
        verts.append(v)
    faces, fuvs = [], []
    for f in node["faces"]:
        if f["hole"]:
            continue  # holes are rare in game meshes; drop the face's hole loop
        loop = []
        for e in f["e"]:
            a, b = node["ed"][e] if e >= 0 else node["ed"][~e][::-1]
            loop.append(a)
        faces.append(loop)
        fuvs.append([node["uv"].get(u, (0, 0)) for u in f["uv"]] if f["uv"] else None)
    return verts, faces, fuvs


def _world_matrix(nodes, name):
    from mathutils import Matrix, Euler
    m = Matrix.Identity(4)
    while name and name in nodes:
        nd = nodes[name]
        if nd["type"] == "transform":
            t = Matrix.Translation(nd["t"])
            r = Euler([math.radians(a) for a in nd["r"]], "XYZ").to_matrix().to_4x4()
            s = Matrix.Diagonal((*nd["s"], 1))
            m = t @ r @ s @ m
        name = nd["parent"]
    return m


def build_scene(path, scale_to_m=0.01, yup_to_zup=True):
    """Create one Blender object per Maya mesh shape. Returns {shape: obj}."""
    import bpy
    from mathutils import Matrix
    nodes = parse_ma(path)
    conv = Matrix.Diagonal((scale_to_m, scale_to_m, scale_to_m, 1))
    if yup_to_zup:
        conv = Matrix.Rotation(math.radians(90), 4, "X") @ conv
    out = {}
    for name, nd in nodes.items():
        if nd["type"] != "mesh" or not nd["faces"]:
            continue
        verts, faces, fuvs = mesh_arrays(nd)
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        if any(fuvs):
            uvl = me.uv_layers.new(name="map1")
            li = 0
            for poly, uvs in zip(me.polygons, fuvs):
                for k in range(poly.loop_total):
                    uvl.data[poly.loop_start + k].uv = uvs[k] if uvs else (0, 0)
        me.validate(clean_customdata=False)
        me.update()
        ob = bpy.data.objects.new(name.replace("Shape", "") or name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.matrix_world = conv @ _world_matrix(nodes, nd["parent"])
        out[name] = ob
    return out


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if argv:
        import bpy
        bpy.ops.wm.read_factory_settings(use_empty=True)
        objs = build_scene(argv[0])
        for k, o in objs.items():
            print("[ma]", k, len(o.data.vertices), "v", len(o.data.polygons), "f",
                  [round(x, 3) for x in o.dimensions])
        if len(argv) > 1:
            bpy.ops.wm.save_as_mainfile(filepath=argv[1])
