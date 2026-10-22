"""Tree of Mind — the floating meditation island where a tree grows as the player meditates.

Blender -b --python tools/blender/build_tree_of_mind.py -- <out_dir> [fast]

Writes <out_dir>/tree_of_mind.blend, tree_of_mind.fbx, scatter.json and
previews/{player,overview,plan,stages}.png. Concepts: assets/tree-of-mind/concepts/.

Art comes from the Unity project's own packs (AssetPacks-FS: StarterNaturePack trees / bushes /
grass / flowers / terrain textures, Ruins1_AP4 stones, SkyBaseAP painted sky), so the island reads
like the rest of the game and Unity can place the very same prefabs. UNITY_ASSETS overrides the
checkout (default ~/git/saju_fullstack/saju_world_unity/Assets).

What is modelled here, and how:
  terrain   one polar-grid mesh; vertex colour `Mask` (R path, G shore) blends grass / sand in the
            shader — soft painted edges, not stepped faces. A grass lip rolls over the rim.
  cliffs    the rim skirt + column prisms, voxel-remeshed and displaced by a Voronoi texture
            stretched in Z (columnar rock), decimated. Rock shader: warm-top / cool-bottom
            gradient, AO in the cracks, moss on up-facing faces.
  sanctum   bevelled stone rings, an indigo rune band with emissive gold inlay, a curbed bed;
            Ruins1 stones (AP4_A2/A3) make the broken outer circle of the ground-view concept.
  the tree  TreeOfMind_Stage0..4 at the origin (sprout → sapling → young → mature → great). Bark
            tubes carry cylindrical UVs; the big stages' canopies (…_Leaves children) are cards of
            the pack's leaf-cluster texture with custom normals pointing out of each cluster's
            centre — the usual trick for soft, fluffy stylised foliage.
  water     pond with a fresnel shader; two streaked falls off the east / north rims.
  scatter   F1 trees, bushes, grass, flowers, Ruins stones — Geometry Nodes instances here, and the
            same list in scatter.json (prefab name + Blender position / Z-rotation / scale) so Unity
            instantiates the real prefabs instead of importing baked copies.
  sky       metaball clouds (white tops, lavender undersides), satellite islets, a backdrop of tall
            floating cliffs with an arch, all hazed with distance in their shaders.

Layout (metres, Z up, tree at the origin; the player arrives at the SOUTH rim and walks north):
  sanctum r 7.2 · path ring r 12.5 with spokes S / SE (meditation pad at (18,-15)) / NE (pond) / NW.
Markers (empties, local +Y = facing): Marker_Spawn, Marker_Exit, Marker_TreeRoot, Marker_TreeView,
Marker_MeditationSeat, Marker_Pond, Marker_Waterfall_E / _N.
"""
import json
import math
import os
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = Path(argv[0] if argv else "assets/tree-of-mind").resolve()
FAST = "fast" in argv[1:]
(OUT / "previews").mkdir(parents=True, exist_ok=True)
PACKS = Path(os.environ.get("UNITY_ASSETS", str(Path.home() / "git/saju_fullstack/saju_world_unity/Assets"))) / "3rd/AssetPacks-FS"
NATURE = PACKS / "StarterNaturePack/FoliageKit1_F1"
TERRAIN_TEX = PACKS / "StarterNaturePack/Terrain/Terrain Textures"
RUINS = PACKS / "Ruins1_AP4"

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
TAU = math.tau


# ================================================================ small helpers

def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexc(h, a=1.0):
    return (*(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)), a)


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    ll = dx * dx + dy * dy
    t = 0.0 if ll == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ll))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def n2(x, y, z=0.0):
    return noise.noise(Vector((x, y, z)))


def ang_diff(a, b):
    return math.atan2(math.sin(a - b), math.cos(a - b))


def collection(name, parent=None, link=True):
    c = bpy.data.collections.new(name)
    if link:
        (parent or sc.collection).children.link(c)
    return c


EXPORT = collection("TreeOfMind_Export")
SCATTER = collection("Scatter")
PREVIEW = collection("PreviewOnly")


# ================================================================ materials

class NT:
    """Terse node-tree builder for one material."""

    def __init__(self, m):
        self.t = m.node_tree
        self.n = self.t.nodes
        self.bsdf = self.n["Principled BSDF"]
        self.out = self.n["Material Output"]

    def node(self, kind, **inputs):
        nd = self.n.new(kind)
        for k, v in inputs.items():
            if k.startswith("_"):
                setattr(nd, k[1:], v)
            else:
                nd.inputs[k].default_value = v
        return nd

    def link(self, a, b):
        self.t.links.new(a, b)

    def mix(self, fac, a, b, blend="MIX"):
        """RGBA mix; a / b are sockets or colours, fac a socket or float."""
        m = self.n.new("ShaderNodeMix")
        m.data_type = "RGBA"
        m.blend_type = blend
        for idx, v in ((0, fac), (6, a), (7, b)):
            if isinstance(v, (int, float, tuple)):
                m.inputs[idx].default_value = v
            else:
                self.link(v, m.inputs[idx])
        return m.outputs[2]

    def math(self, op, a, b=0.0, clamp=False):
        m = self.n.new("ShaderNodeMath")
        m.operation = op
        m.use_clamp = clamp
        for idx, v in ((0, a), (1, b)):
            if isinstance(v, (int, float)):
                m.inputs[idx].default_value = v
            else:
                self.link(v, m.inputs[idx])
        return m.outputs[0]

    def ramp(self, fac, stops):
        r = self.n.new("ShaderNodeValToRGB")
        self.link(fac, r.inputs[0])
        els = r.color_ramp.elements
        els[0].position, els[0].color = stops[0]
        els[1].position, els[1].color = stops[-1]
        for p, c in stops[1:-1]:
            e = els.new(p)
            e.color = c
        return r.outputs[0]

    def tex(self, path, coords=None, non_color=False):
        t = self.n.new("ShaderNodeTexImage")
        t.image = load_image(path, non_color)
        if coords is not None:
            self.link(coords, t.inputs[0])
        return t

    def obj_coords(self, scale):
        tc = self.node("ShaderNodeTexCoord")
        mp = self.node("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = scale
        self.link(tc.outputs["Object"], mp.inputs[0])
        return mp.outputs[0]


IMAGES = {}


def load_image(path, non_color=False):
    key = str(path)
    if key not in IMAGES:
        im = bpy.data.images.load(key, check_existing=True)
        if non_color:
            im.colorspace_settings.name = "Non-Color"
        if "Alpha-Smoothness" in key:
            im.alpha_mode = "CHANNEL_PACKED"      # alpha is smoothness: read as opacity it blacks the colour out
        IMAGES[key] = im
    return IMAGES[key]


MATS = {}
HAZE = hexc("dcd6ee")


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    MATS[name] = m
    return m, NT(m)


def haze(nt, start=110.0, full=1000.0, amount=0.85):
    """Aerial perspective in the shader: mix toward the horizon colour with view distance."""
    cam = nt.node("ShaderNodeCameraData")
    d = nt.math("SUBTRACT", cam.outputs["View Distance"], start)
    d = nt.math("DIVIDE", d, full - start, clamp=True)
    d = nt.math("POWER", d, 0.75)
    d = nt.math("MULTIPLY", d, amount)
    em = nt.node("ShaderNodeEmission", Color=HAZE, Strength=1.0)
    mixs = nt.node("ShaderNodeMixShader")
    src = nt.out.inputs["Surface"].links[0].from_socket
    nt.link(d, mixs.inputs[0])
    nt.link(src, mixs.inputs[1])
    nt.link(em.outputs[0], mixs.inputs[2])
    nt.link(mixs.outputs[0], nt.out.inputs["Surface"])


def flat_mat(name, hx, rough=0.8, metal=0.0, emit=0.0, hz=True):
    m, nt = new_mat(name)
    nt.bsdf.inputs["Base Color"].default_value = hexc(hx)
    nt.bsdf.inputs["Roughness"].default_value = rough
    nt.bsdf.inputs["Metallic"].default_value = metal
    if emit:
        nt.bsdf.inputs["Emission Color"].default_value = hexc(hx)
        nt.bsdf.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = hexc(hx)
    if hz:
        haze(nt)
    return m


def mat_terrain():
    m, nt = new_mat("TOM_Terrain")
    uv = nt.obj_coords((0.22, 0.22, 0.22))
    grass = nt.tex(TERRAIN_TEX / "grass/grass_baseColor.png", uv)
    ground = nt.tex(TERRAIN_TEX / "ground/ground_baseColor.png", uv)
    # The pack's grass is a dark mossy base: lift it to the concepts' sunny green and paint large
    # warm / cool patches across it, so the meadow is not one flat colour.
    big = nt.node("ShaderNodeTexNoise", Scale=0.035, Detail=3.0, Roughness=0.55)
    nt.link(nt.obj_coords((1, 1, 1)), big.inputs["Vector"])
    tint = nt.ramp(big.outputs["Fac"], [(0.32, hexc("6aa63a")), (0.5, hexc("86bd45")), (0.7, hexc("b4d25e"))])
    g = nt.mix(1.0, grass.outputs[0], tint, "OVERLAY")
    g = nt.mix(0.55, g, tint)
    sand = nt.mix(0.35, ground.outputs[0], hexc("e2b277"))
    vc = nt.node("ShaderNodeVertexColor", _layer_name="Mask")
    sep = nt.node("ShaderNodeSeparateColor")
    nt.link(vc.outputs["Color"], sep.inputs[0])
    edge = nt.node("ShaderNodeTexNoise", Scale=1.6, Detail=4.0)
    nt.link(nt.obj_coords((1, 1, 1)), edge.inputs["Vector"])
    pm = nt.math("ADD", sep.outputs["Red"], nt.math("MULTIPLY", nt.math("SUBTRACT", edge.outputs["Fac"], 0.5), 0.5))
    pm = nt.math("MULTIPLY", nt.math("SUBTRACT", pm, 0.35), 3.0, clamp=True)
    col = nt.mix(pm, g, sand)
    col = nt.mix(nt.math("MULTIPLY", sep.outputs["Green"], 1.0, clamp=True), col, hexc("a39cab"))
    ao = nt.node("ShaderNodeAmbientOcclusion", Distance=1.2)
    nt.link(col, ao.inputs["Color"])
    col = nt.mix(nt.math("SUBTRACT", 1.0, ao.outputs["AO"]), col, hexc("3d4a2a"), "MULTIPLY")
    nt.link(col, nt.bsdf.inputs["Base Color"])
    nt.bsdf.inputs["Roughness"].default_value = 0.9
    bump = nt.node("ShaderNodeBump", Strength=0.25)
    nt.link(grass.outputs[0], bump.inputs["Height"])
    nt.link(bump.outputs["Normal"], nt.bsdf.inputs["Normal"])
    m.diffuse_color = hexc("7dbb45")
    haze(nt)
    return m


def mat_rock(name="TOM_Rock", top="d2c4c6", bottom="7b7393", moss=True, z_range=(-14.0, 1.0), hz=(110.0, 1000.0)):
    """Stylised rock: warm light tops to cool violet feet, darker cracks, moss where it faces up."""
    m, nt = new_mat(name)
    geo = nt.node("ShaderNodeNewGeometry")
    sep = nt.node("ShaderNodeSeparateXYZ")
    nt.link(geo.outputs["Position"], sep.inputs[0])
    zf = nt.math("DIVIDE", nt.math("SUBTRACT", sep.outputs["Z"], z_range[0]), z_range[1] - z_range[0], clamp=True)
    grad = nt.ramp(zf, [(0.0, hexc(bottom)), (0.55, hexc("a59cb4")), (1.0, hexc(top))])
    mott = nt.node("ShaderNodeTexNoise", Scale=0.8, Detail=6.0, Roughness=0.6)
    nt.link(geo.outputs["Position"], mott.inputs["Vector"])
    col = nt.mix(0.35, grad, mott.outputs["Color"], "SOFT_LIGHT")
    vor = nt.node("ShaderNodeTexVoronoi", Scale=0.9)
    vor.feature = "DISTANCE_TO_EDGE"
    nt.link(geo.outputs["Position"], vor.inputs["Vector"])
    crack = nt.math("LESS_THAN", vor.outputs["Distance"], 0.05)
    col = nt.mix(nt.math("MULTIPLY", crack, 0.45), col, hexc("5a5270"))
    ao = nt.node("ShaderNodeAmbientOcclusion", Distance=1.5)
    nt.link(col, ao.inputs["Color"])
    col = nt.mix(nt.math("MULTIPLY", nt.math("SUBTRACT", 1.0, ao.outputs["AO"]), 0.8), col, hexc("40395a"))
    if moss:
        nz = nt.node("ShaderNodeSeparateXYZ")
        nt.link(geo.outputs["Normal"], nz.inputs[0])
        mn = nt.node("ShaderNodeTexNoise", Scale=1.3, Detail=3.0)
        nt.link(geo.outputs["Position"], mn.inputs["Vector"])
        mf = nt.math("ADD", nz.outputs["Z"], nt.math("MULTIPLY", nt.math("SUBTRACT", mn.outputs["Fac"], 0.5), 0.6))
        mf = nt.math("MULTIPLY", nt.math("SUBTRACT", mf, 0.62), 5.0, clamp=True)
        col = nt.mix(mf, col, hexc("7fb447"))
    nt.link(col, nt.bsdf.inputs["Base Color"])
    nt.bsdf.inputs["Roughness"].default_value = 0.85
    bump = nt.node("ShaderNodeBump", Strength=0.35)
    nt.link(vor.outputs["Distance"], bump.inputs["Height"])
    nt.link(bump.outputs["Normal"], nt.bsdf.inputs["Normal"])
    m.diffuse_color = hexc("a59cb4")
    haze(nt, *hz)
    return m


def mat_stone(name, base="e6d9c6", dark="b8a58c"):
    m, nt = new_mat(name)
    geo = nt.node("ShaderNodeNewGeometry")
    nz = nt.node("ShaderNodeTexNoise", Scale=1.1, Detail=8.0, Roughness=0.65)
    nt.link(geo.outputs["Position"], nz.inputs["Vector"])
    col = nt.ramp(nz.outputs["Fac"], [(0.35, hexc(dark)), (0.6, hexc(base))])
    ao = nt.node("ShaderNodeAmbientOcclusion", Distance=0.4)
    nt.link(col, ao.inputs["Color"])
    col = nt.mix(nt.math("MULTIPLY", nt.math("SUBTRACT", 1.0, ao.outputs["AO"]), 0.7), col, hexc("6d6152"))
    nt.link(col, nt.bsdf.inputs["Base Color"])
    nt.bsdf.inputs["Roughness"].default_value = 0.7
    bump = nt.node("ShaderNodeBump", Strength=0.15)
    nt.link(nz.outputs["Fac"], bump.inputs["Height"])
    nt.link(bump.outputs["Normal"], nt.bsdf.inputs["Normal"])
    m.diffuse_color = hexc(base)
    haze(nt)
    return m


def mat_image(name, color_path, tint=None, alpha=True, normal_path=None, emit=0.0, gradient=None, gain=1.0, hue=0.5):
    """Pack-texture material. `gradient` = (inner, outer) hex: foliage darkens inside by AO. `gain`
    brightens a dark texture (the Ruins atlases are mid-grey detail maps), `hue` shifts it (0.5 = none)."""
    m, nt = new_mat(name)
    t = nt.tex(color_path)
    col = t.outputs[0]
    if hue != 0.5:
        hs = nt.node("ShaderNodeHueSaturation", Hue=hue, Saturation=1.1)
        nt.link(col, hs.inputs["Color"])
        col = hs.outputs[0]
    if gain != 1.0:
        vm = nt.node("ShaderNodeVectorMath", _operation="SCALE")
        nt.link(col, vm.inputs[0])
        vm.inputs["Scale"].default_value = gain
        col = vm.outputs[0]
    if tint:
        col = nt.mix(1.0, col, hexc(tint), "MULTIPLY")
    if gradient:
        ao = nt.node("ShaderNodeAmbientOcclusion", Distance=2.0)
        lo = nt.mix(1.0, col, hexc(gradient[0]), "MULTIPLY")
        hi = nt.mix(0.6, col, hexc(gradient[1]), "SCREEN")
        col = nt.mix(ao.outputs["AO"], lo, hi)
    nt.link(col, nt.bsdf.inputs["Base Color"])
    if alpha:
        nt.link(t.outputs["Alpha"], nt.bsdf.inputs["Alpha"])
    if normal_path:
        nm = nt.node("ShaderNodeNormalMap", Strength=0.8)
        nt.link(nt.tex(normal_path, non_color=True).outputs[0], nm.inputs["Color"])
        nt.link(nm.outputs[0], nt.bsdf.inputs["Normal"])
    nt.bsdf.inputs["Roughness"].default_value = 0.8
    if emit:
        nt.link(col, nt.bsdf.inputs["Emission Color"])
        nt.bsdf.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = hexc(tint or "88aa55")
    haze(nt)
    return m


def mat_water():
    m, nt = new_mat("TOM_Water")
    lw = nt.node("ShaderNodeLayerWeight", Blend=0.35)
    col = nt.mix(lw.outputs["Facing"], hexc("2f8fc4"), hexc("bfe3f2"))
    nt.link(col, nt.bsdf.inputs["Base Color"])
    nt.bsdf.inputs["Roughness"].default_value = 0.04
    nt.bsdf.inputs["Alpha"].default_value = 0.88
    nz = nt.node("ShaderNodeTexNoise", Scale=2.2, Detail=4.0)
    nt.link(nt.obj_coords((1, 1, 3)), nz.inputs["Vector"])
    b = nt.node("ShaderNodeBump", Strength=0.06)
    nt.link(nz.outputs["Fac"], b.inputs["Height"])
    nt.link(b.outputs["Normal"], nt.bsdf.inputs["Normal"])
    m.surface_render_method = "BLENDED"
    m.diffuse_color = hexc("4fa6d8")
    haze(nt)
    return m


def mat_waterfall():
    m, nt = new_mat("TOM_Waterfall")
    # Streaks: noise stretched down the fall, white cores over blue-grey, thin spots see-through.
    nz = nt.node("ShaderNodeTexNoise", Scale=3.0, Detail=5.0, Roughness=0.6)
    nt.link(nt.obj_coords((3.0, 3.0, 0.15)), nz.inputs["Vector"])
    col = nt.ramp(nz.outputs["Fac"], [(0.35, hexc("9fc6e6")), (0.6, hexc("ffffff"))])
    em = nt.node("ShaderNodeEmission", Strength=1.1)
    nt.link(col, em.inputs["Color"])
    tr = nt.node("ShaderNodeBsdfTransparent")
    alpha = nt.math("MULTIPLY", nt.math("SUBTRACT", nz.outputs["Fac"], 0.25), 2.2, clamp=True)
    mx = nt.node("ShaderNodeMixShader")
    nt.link(alpha, mx.inputs[0])
    nt.link(tr.outputs[0], mx.inputs[1])
    nt.link(em.outputs[0], mx.inputs[2])
    nt.link(mx.outputs[0], nt.out.inputs["Surface"])
    m.surface_render_method = "BLENDED"
    m.diffuse_color = hexc("eaf5ff")
    return m


def mat_cloud():
    m, nt = new_mat("TOM_Cloud")
    geo = nt.node("ShaderNodeNewGeometry")
    sep = nt.node("ShaderNodeSeparateXYZ")
    nt.link(geo.outputs["Normal"], sep.inputs[0])
    up = nt.math("MULTIPLY", nt.math("ADD", sep.outputs["Z"], 0.6), 0.65, clamp=True)
    col = nt.ramp(up, [(0.0, hexc("b4a9d4")), (0.45, hexc("e7def3")), (1.0, hexc("fffaf5"))])
    lw = nt.node("ShaderNodeLayerWeight", Blend=0.25)
    col = nt.mix(nt.math("MULTIPLY", lw.outputs["Fresnel"], 0.6), col, hexc("ffffff"))
    em = nt.node("ShaderNodeEmission", Strength=1.0)
    nt.link(col, em.inputs["Color"])
    nt.link(em.outputs[0], nt.out.inputs["Surface"])
    m.diffuse_color = hexc("f8f3fb")
    haze(nt, 120.0, 900.0, 0.55)
    return m


def build_materials():
    mat_terrain()
    mat_rock()
    mat_rock("TOM_RockDistant", top="ddd3e2", bottom="a8a1c2", z_range=(-60.0, 30.0), hz=(80.0, 420.0))
    mat_stone("TOM_Stone")
    mat_stone("TOM_StoneDark", base="cbbca6", dark="9e8b72")
    flat_mat("TOM_Rune", "3f3584", rough=0.45)
    flat_mat("TOM_Gold", "f0c060", rough=0.3, metal=0.9, emit=1.2)
    flat_mat("TOM_Soil", "7a4a24", rough=0.95, emit=0.08)
    flat_mat("TOM_Mat", "3d3380", rough=0.7)
    flat_mat("TOM_Cushion", "efe4cf", rough=0.85)
    flat_mat("TOM_TreeGlow", "ffd98a", emit=8.0)
    mat_water()
    mat_waterfall()
    mat_cloud()
    mat_image("TOM_Bark", NATURE / "Textures/Bark1/bark1_baseColor.png", alpha=False,
              normal_path=NATURE / "Textures/Bark1/bark1_normal_GL.png")
    mat_image("TOM_Leaf", NATURE / "Textures/F1_Leaves_Map1.png", tint="7cb540", gradient=("3f6a24", "e3f08a"))
    mat_image("TOM_LeafGlow", NATURE / "Textures/F1_Leaves_Map1.png", tint="a6e36a", emit=0.35, gradient=("5b8f33", "f2ffb0"))
    flat_mat("TOM_LeafSoft", "8fd05a", rough=0.6, emit=0.25)
    mat_image("F1_Leaves", NATURE / "Textures/F1_Leaves_Map1.png", tint="80b545", gradient=("3d6623", "e8f29a"))
    mat_image("F1_Foliage", NATURE / "Textures/F1_Foliage_Map1.png", tint="f2fff0")
    mat_image("F1_Grass", NATURE / "Textures/F1_Foliage_Map1.png", tint="d9f2a2", gain=1.8)
    mat_image("F1_Lavender", NATURE / "Textures/F1_Foliage_Map1.png", tint="ffffff", gain=1.3, hue=0.58)
    for i in (1, 2, 3):
        d = RUINS / f"Textures/Atlas{i}"
        mat_image(f"AP4_Atlas{i}", d / f"AP4_Atlas_{i}_BaseColor(Alpha-Smoothness).png", tint="ecdccb", alpha=False,
                  normal_path=d / f"AP4_Atlas_{i}_Normal_OpenGL.png", gain=2.6)
    flat_mat("TOM_PreviewCoat", "1c2036", rough=0.6, hz=False)
    flat_mat("TOM_PreviewSkin", "f1d2bd", rough=0.6, hz=False)
    flat_mat("TOM_PreviewHair", "171a2a", rough=0.5, hz=False)


# ================================================================ mesh builder

class MB:
    """Collects verts / faces (+ per-face material, smoothing, per-loop UVs, vertex colours, optional
    per-vertex custom normals) and makes one object."""

    def __init__(self):
        self.v, self.f, self.m, self.s, self.mats, self.uv, self.vcol = [], [], [], [], [], [], {}
        self.cn = None

    def vert(self, p):
        self.v.append((p[0], p[1], p[2]))
        return len(self.v) - 1

    def face(self, idx, mname, smooth=False, uv=None):
        if mname not in self.mats:
            self.mats.append(mname)
        self.f.append(tuple(idx))
        self.m.append(self.mats.index(mname))
        self.s.append(smooth)
        self.uv.append(uv or [(0.0, 0.0)] * len(idx))

    def face2(self, idx, mname, smooth=False, uv=None):
        """Both sides (Unity culls backs). The back gets its own verts: the same verts reversed is a
        duplicate face to Blender, validate() drops it, and unvalidated it crashed the FBX export."""
        self.face(idx, mname, smooth, uv)
        back = [self.vert(self.v[i]) for i in reversed(idx)]
        if self.cn is not None:
            for i in reversed(idx):
                self.cn.append(self.cn[i])
        self.face(back, mname, smooth, list(reversed(uv)) if uv else None)

    def add_bm(self, bm, mname, smooth=True, mat_fn=None):
        bm.verts.index_update()
        off = len(self.v)
        uvl = bm.loops.layers.uv.active
        for v in bm.verts:
            self.v.append(tuple(v.co))
        for fc in bm.faces:
            uv = [tuple(lp[uvl].uv) for lp in fc.loops] if uvl else None
            self.face([off + v.index for v in fc.verts], mat_fn(fc) if mat_fn else mname, smooth, uv)
        bm.free()

    def build(self, name, coll):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        for n in self.mats:
            me.materials.append(MATS[n])
        me.polygons.foreach_set("material_index", self.m)
        me.polygons.foreach_set("use_smooth", self.s)
        uvl = me.uv_layers.new(name="UVMap")
        uvl.data.foreach_set("uv", [c for f in self.uv for uv in f for c in uv])
        for cname, cols in self.vcol.items():
            ca = me.color_attributes.new(cname, "BYTE_COLOR", "POINT")
            ca.data.foreach_set("color", [c for col in cols for c in col])
        if me.validate(verbose=False):
            print(f"[tree-of-mind] {name}: fixed invalid geometry")
        if self.cn is not None and len(self.cn) == len(me.vertices):
            me.normals_split_custom_set_from_vertices(self.cn)
        me.update()
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        return ob


def apply_mods(ob):
    """Bake the modifier stack into the mesh, so the FBX carries what the renders show."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)


def blob_bm(radius, scale=(1, 1, 1), seed=0.0, amp=0.16, freq=0.9, subdiv=2, flat_bottom=None):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    for v in bm.verts:
        d = noise.noise(v.co * (freq / radius) + off)
        v.co = v.co * (1 + amp * d)
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
        if flat_bottom is not None and v.co.z < flat_bottom:
            v.co.z = flat_bottom
    return bm


def place(bm, loc, rz=0.0):
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, "Z"), verts=bm.verts)
    return bm


def tube(mb, pts, radii, mname, sides=8, cap=True, v_scale=1.0):
    """Tapered tube through pts with parallel-transported frames and cylindrical UVs."""
    rings, u, run = [], None, 0.0
    for k, p in enumerate(pts):
        t = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        u = t.orthogonal().normalized() if u is None else (u - t * u.dot(t)).normalized()
        w = t.cross(u)
        if k:
            run += (pts[k] - pts[k - 1]).length
        rings.append(([mb.vert(p + (u * math.cos(TAU * s / sides) + w * math.sin(TAU * s / sides)) * radii[k])
                       for s in range(sides)], run * v_scale))
    for (a, va), (b, vb) in zip(rings, rings[1:]):
        for s in range(sides):
            s1 = (s + 1) % sides
            u0, u1 = s / sides, (s + 1) / sides
            mb.face([a[s], a[s1], b[s1], b[s]], mname, True, [(u0, va), (u1, va), (u1, vb), (u0, vb)])
    if cap:
        mb.face(rings[-1][0], mname, True)


def annulus(mb, r0, r1, z0, z1, top, side, seg=96, a0=0.0, a1=TAU, cx=0.0, cy=0.0, smooth=False):
    full = abs(a1 - a0 - TAU) < 1e-6
    n = seg if full else max(2, int(seg * (a1 - a0) / TAU))
    cnt = n if full else n + 1

    def ring(r, z):
        return [mb.vert((cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n), z))
                for k in range(cnt)]
    ot, ob = ring(r1, z1), ring(r1, z0)
    it = ring(r0, z1) if r0 > 0 else None
    ib = ring(r0, z0) if r0 > 0 else None
    c = mb.vert((cx, cy, z1)) if r0 <= 0 else None
    for k in range(n):
        k1 = (k + 1) % cnt
        if it:
            mb.face([it[k], ot[k], ot[k1], it[k1]], top, smooth)
            mb.face([ib[k1], ib[k], it[k], it[k1]], side, smooth)
        else:
            mb.face([c, ot[k], ot[k1]], top, smooth)
        mb.face([ob[k], ob[k1], ot[k1], ot[k]], side, smooth)
    if not full and it:
        mb.face([ob[0], ot[0], it[0], ib[0]], side)
        mb.face([ib[n], it[n], ot[n], ob[n]], side)


def strip(mb, a, b, w, z, mname):
    a, b = Vector((a[0], a[1], z)), Vector((b[0], b[1], z))
    s = (b - a).cross(Vector((0, 0, 1))).normalized() * (w / 2)
    mb.face([mb.vert(a - s), mb.vert(b - s), mb.vert(b + s), mb.vert(a + s)], mname)


def box(mb, c, size, rz, mname):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    mb.add_bm(place(bm, c, rz), mname, smooth=False)


def marker(name, loc, face_to=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "ARROWS"
    e.empty_display_size = 0.8
    e.location = loc
    if face_to is not None:
        d = Vector(face_to) - Vector(loc)
        e.rotation_euler = (0, 0, math.atan2(-d.x, d.y))
    EXPORT.objects.link(e)
    return e


def bevel(ob, width=0.04, segments=2):
    md = ob.modifiers.new("Bevel", "BEVEL")
    md.width = width
    md.segments = segments
    md.limit_method = "ANGLE"
    md.angle_limit = math.radians(40)
    md.harden_normals = True
    apply_mods(ob)


def rockify(ob, voxel, strength, scale, stretch=4.0, decimate=0.35, seed=0.0):
    """Voxel-remesh, displace with Voronoi stretched in Z (columnar faces) + clouds, decimate."""
    rm = ob.modifiers.new("Remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = voxel
    tex = bpy.data.textures.new(f"{ob.name}_vor", "VORONOI")
    tex.noise_scale = scale
    ctl = bpy.data.objects.new(f"{ob.name}_texspace", None)
    ctl.scale = (1.0, 1.0, stretch)
    ctl.location = (seed * 17.0, seed * 9.0, 0)
    sc.collection.objects.link(ctl)
    dp = ob.modifiers.new("Displace", "DISPLACE")
    dp.texture = tex
    dp.texture_coords = "OBJECT"
    dp.texture_coords_object = ctl
    dp.strength = strength
    tex2 = bpy.data.textures.new(f"{ob.name}_cl", "CLOUDS")
    tex2.noise_scale = scale * 0.5
    dp2 = ob.modifiers.new("Displace2", "DISPLACE")
    dp2.texture = tex2
    dp2.strength = strength * 0.5
    if decimate < 1:
        dc = ob.modifiers.new("Decimate", "DECIMATE")
        dc.ratio = decimate
    apply_mods(ob)
    bpy.data.objects.remove(ctl)
    for p in ob.data.polygons:
        p.use_smooth = True


# ================================================================ the island's shape

POND_LOBE = math.radians(40)


def R(th):
    a, b = 37.0, 31.0
    base = 1 / math.sqrt((math.cos(th) / a) ** 2 + (math.sin(th) / b) ** 2)
    c, s = math.cos(th), math.sin(th)
    n = n2(c * 1.3, s * 1.3, 0.5) * 0.11 + n2(c * 2.6, s * 2.6, 1.3) * 0.07 + n2(c * 6.0, s * 6.0, 2.1) * 0.025
    lobe = 4.0 * math.exp(-(ang_diff(th, POND_LOBE) / math.radians(25)) ** 2)
    return base * (1 + n) + lobe


def edge_pt(th, k=1.0):
    r = R(th) * k
    return r * math.cos(th), r * math.sin(th)


RING_R = 12.5
MED = (18.0, -15.0)
SPOKES = [
    [(0, -12.5), (0.6, -19), (-0.8, -26), (0, -42)],          # S: the entry
    [(8.8, -8.8), (12.5, -12.0), (15.3, -13.7)],              # SE: the meditation pad
    [(8.8, 8.8), (11.2, 10.8)],                               # NE: the pond shore
    [(-8.8, 8.8), (-13, 14), (-15, 22), (-14, 42)],           # NW: off the north rim
]
SPOKE_ANGLES = [math.radians(a) for a in (-90, -45, 45, 135)]
EXIT_ANGLES = [math.radians(-90), math.atan2(42, -14)]


def path_dist(x, y):
    d = abs(math.hypot(x, y) - RING_R)
    for sp in SPOKES:
        for (ax, ay), (bx, by) in zip(sp, sp[1:]):
            d = min(d, seg_dist(x, y, ax, ay, bx, by))
    return d


PC = (19.0, 16.0)
PRX, PRY, PROT = 9.0, 6.5, math.radians(35)
FALLS = [math.radians(14), math.radians(64)]
FALL_EDGES = [edge_pt(t) for t in FALLS]


def pond_d(x, y):
    dx, dy = x - PC[0], y - PC[1]
    c, s = math.cos(PROT), math.sin(PROT)
    d = math.hypot((dx * c + dy * s) / PRX, (-dx * s + dy * c) / PRY)
    for ex, ey in FALL_EDGES:
        d = min(d, seg_dist(x, y, PC[0], PC[1], ex * 1.1, ey * 1.1) / 1.5)
    return d


MOUNDS = [(-26, 8, 9, 1.8), (-22, -18, 7, 1.2), (3, 25, 7, 1.0), (-9, -27, 5, 0.6), (28, -3, 6, 0.9)]
WATER_Z = -0.28


def h(x, y):
    r = math.hypot(x, y)
    z = n2(x * 0.06, y * 0.06, 3.0) * 0.4 + n2(x * 0.2, y * 0.2, 7.0) * 0.07
    z *= smoothstep(8.5, 13.5, r)
    for mx, my, mr, mh in MOUNDS:
        d = math.hypot(x - mx, y - my) / mr
        if d < 1:
            z += mh * (1 - d * d) ** 2
    pd = path_dist(x, y)
    if pd < 2.5:
        z *= 0.3 + 0.7 * pd / 2.5
        z -= 0.06 * (1 - pd / 2.5)          # the path is worn a little into the meadow
    md = math.hypot(x - MED[0], y - MED[1])
    if md < 5:
        z *= smoothstep(3.2, 5, md)
    p = pond_d(x, y)
    if p < 1.18:
        bed = -0.5 - 0.9 * max(0.0, 1 - p)
        z = bed + (z - bed) * smoothstep(0.98, 1.18, p)
    return z


# ================================================================ terrain, water, cliffs

def build_island():
    NR, NS = (70, 300) if FAST else (115, 520)
    g, water = MB(), MB()
    mask, grid, pos = [], {}, {}

    def put(x, y, z):
        i = g.vert((x, y, z))
        mask.append((1.0 - smoothstep(0.9, 1.7, path_dist(x, y)), 1.0 - smoothstep(0.98, 1.2, pond_d(x, y)), 0.0, 1.0))
        return i

    c = put(0, 0, h(0, 0))
    for i in range(1, NR + 1):
        t = i / NR
        for j in range(NS):
            th = TAU * j / NS
            r = t * R(th)
            x, y = r * math.cos(th), r * math.sin(th)
            pos[i, j] = (x, y)
            grid[i, j] = put(x, y, h(x, y))
    lip = []          # two rings rolling the meadow over the rim
    for k, (out, dz) in enumerate(((0.2, -0.18), (0.55, -0.6))):
        ring = []
        for j in range(NS):
            x, y = pos[NR, j]
            th = math.atan2(y, x)
            ring.append(put(x + out * math.cos(th), y + out * math.sin(th), h(x, y) + dz))
        lip.append(ring)
    for j in range(NS):
        j1 = (j + 1) % NS
        g.face([c, grid[1, j], grid[1, j1]], "TOM_Terrain", True)
        for i in range(1, NR):
            q = [(i, j), (i + 1, j), (i + 1, j1), (i, j1)]
            g.face([grid[k] for k in q], "TOM_Terrain", True)
            xs, ys = [pos[k][0] for k in q], [pos[k][1] for k in q]
            ds = [pond_d(x, y) for x, y in zip(xs, ys)]
            if max(ds) < 1.4 and min(ds) < 1.12:
                water.face([water.vert((x, y, WATER_Z)) for x, y in zip(xs, ys)], "TOM_Water", True)
        prev = [grid[NR, j], grid[NR, j1]]
        for ring in lip:
            g.face([prev[0], ring[j], ring[j1], prev[1]], "TOM_Terrain", True)
            prev = [ring[j], ring[j1]]
    g.vcol["Mask"] = mask
    ground = g.build("Island_Ground", EXPORT)
    uvl = ground.data.uv_layers[0]          # planar UVs, 4 m tiles, for Unity's terrain shader
    for lp in ground.data.loops:
        co = ground.data.vertices[lp.vertex_index].co
        uvl.data[lp.index].uv = (co.x / 4.0, co.y / 4.0)
    water.build("Island_Water", EXPORT)

    # The cliff mass: a closed skirt under the rim plus column prisms round the edge, rockified as one.
    rng = random.Random(11)
    cl = MB()
    levels = [(-0.35, 0.995), (-2.0, 0.975), (-4.5, 0.94), (-7.5, 0.85), (-10.5, 0.68), (-13.0, 0.46), (-15.0, 0.24)]
    rings = []
    for li, (dz, s) in enumerate(levels):
        cur = []
        for j in range(0, NS, 2):
            x, y = pos[NR, j]
            jit = 1 + 0.07 * n2(j * 0.18, li * 0.7, 4.0) + 0.04 * n2(j * 0.9, li, 5.0)
            z = (min(0.0, h(x, y)) + dz) if li < 2 else dz + 0.8 * n2(j * 0.1, li, 6.0)
            cur.append(cl.vert((x * s * jit, y * s * jit, z)))
        rings.append(cur)
    m = len(rings[0])
    top_c = cl.vert((0, 0, -0.6))
    for j in range(m):
        cl.face([top_c, rings[0][(j + 1) % m], rings[0][j]], "TOM_Rock")
    for a, b in zip(rings, rings[1:]):
        for j in range(m):
            j1 = (j + 1) % m
            cl.face([b[j], b[j1], a[j1], a[j]], "TOM_Rock", True)
    bot = cl.vert((2, 2, -18.0))
    for j in range(m):
        cl.face([bot, rings[-1][(j + 1) % m], rings[-1][j]], "TOM_Rock", True)
    th = 0.0
    while th < TAU:
        r = R(th)
        if min(abs(ang_diff(th, a)) for a in FALLS) > math.radians(4):
            x, y = (r - 0.1) * math.cos(th), (r - 0.1) * math.sin(th)
            ze = h(x, y)
            raised = rng.random() < 0.16 and min(abs(ang_diff(th, a)) for a in EXIT_ANGLES) > math.radians(8)
            z1 = ze + (rng.uniform(0.3, 1.1) if raised else rng.uniform(-0.85, -0.4))
            prism(cl, x, y, rng.uniform(1.0, 1.9), rng.uniform(-10.0, -3.5), z1, 7, rng.uniform(0, TAU), rng)
        th += 2.3 / r
    ob = cl.build("Island_Cliffs", EXPORT)
    rockify(ob, voxel=0.5 if FAST else 0.32, strength=0.9, scale=2.2, stretch=5.0, decimate=0.3 if FAST else 0.4)


def prism(mb, cx, cy, rr, z0, z1, sides, rot, rng):
    t, b = [], []
    for k in range(sides):
        a = rot + TAU * k / sides
        j = rr * rng.uniform(0.85, 1.1)
        t.append(mb.vert((cx + j * math.cos(a), cy + j * math.sin(a), z1 + rng.uniform(-0.08, 0.08))))
        b.append(mb.vert((cx + j * 0.75 * math.cos(a), cy + j * 0.75 * math.sin(a), z0)))
    mb.face(t, "TOM_Rock")
    for k in range(sides):
        k1 = (k + 1) % sides
        mb.face([b[k], b[k1], t[k1], t[k]], "TOM_Rock")
    mb.face(list(reversed(b)), "TOM_Rock")


def build_falls():
    fm = MB()
    for idx, th in enumerate(FALLS):
        ex, ey = edge_pt(th)
        o = Vector((math.cos(th), math.sin(th), 0))
        side = o.cross(Vector((0, 0, 1)))
        n = 24
        for wk, push in ((1.0, 0.0), (0.7, 0.25)):         # a sheet and a thinner veil in front
            cols = []
            for k in range(n + 1):
                s = k / n
                w = (1.9 + 1.4 * s) * wk
                p = Vector((ex, ey, WATER_Z)) + o * (2.4 * math.sqrt(s) - 0.5 + push) + Vector((0, 0, -18.0 * s))
                cols.append((fm.vert(p - side * w), fm.vert(p + side * w), s))
            for a, b in zip(cols, cols[1:]):
                fm.face2([a[0], b[0], b[1], a[1]], "TOM_Waterfall", True, [(0, a[2]), (0, b[2]), (1, b[2]), (1, a[2])])
        marker("Marker_Waterfall_" + "EN"[idx], (ex, ey, WATER_Z), face_to=(ex * 2, ey * 2, WATER_Z))
    fm.build("Island_Waterfalls", EXPORT)


# ================================================================ sanctum, meditation pad

PLAT_TOP = 0.35


def build_sanctum():
    mb = MB()
    rng = random.Random(3)
    for k in range(16):
        a0, a1 = TAU * k / 16 + 0.005, TAU * (k + 1) / 16 - 0.005
        annulus(mb, 5.8, 7.2, -0.4, PLAT_TOP + rng.uniform(-0.015, 0.012), "TOM_Stone", "TOM_Stone", 96, a0, a1)
    annulus(mb, 4.45, 5.75, -0.4, PLAT_TOP - 0.01, "TOM_Rune", "TOM_StoneDark")
    for k in range(12):
        a0, a1 = TAU * k / 12 + 0.006, TAU * (k + 1) / 12 - 0.006
        annulus(mb, 2.85, 4.4, -0.4, PLAT_TOP + 0.02, "TOM_Stone", "TOM_Stone", 96, a0, a1)
    annulus(mb, 2.3, 2.8, -0.2, 0.66, "TOM_StoneDark", "TOM_StoneDark", seg=72)
    annulus(mb, 0.0, 2.3, -0.2, 0.5, "TOM_Soil", "TOM_Soil", seg=72)
    for a in SPOKE_ANGLES:
        for i, top in enumerate((0.233, 0.117)):
            d = 7.2 + 0.45 * i + 0.22
            box(mb, (d * math.cos(a), d * math.sin(a), (top - 0.4) / 2), (0.44, 4.2, top + 0.4), a, "TOM_Stone")
    for adeg in (0, 90, 180, -135):
        a = math.radians(adeg)
        box(mb, (7.85 * math.cos(a), 7.85 * math.sin(a), 0.32), (0.8, 1.4, 0.84), a, "TOM_StoneDark")
    bevel(mb.build("Sanctum", EXPORT), 0.035, 2)

    gl = MB()           # raised gold inlay, separate so the bevel does not round it away
    gz = PLAT_TOP + 0.012
    for r in (5.8, 4.42, 3.62, 2.86):
        annulus(gl, r - 0.045, r + 0.045, gz - 0.03, gz, "TOM_Gold", "TOM_Gold")
    zz = [(4.6 if k % 2 == 0 else 5.6, TAU * k / 32) for k in range(33)]
    for (ra, aa), (rb, ab) in zip(zz, zz[1:]):
        strip(gl, (ra * math.cos(aa), ra * math.sin(aa)), (rb * math.cos(ab), rb * math.sin(ab)), 0.06, gz, "TOM_Gold")
    for k in range(8):
        a = TAU * k / 8 + TAU / 16
        strip(gl, (2.95 * math.cos(a), 2.95 * math.sin(a)), (4.3 * math.cos(a), 4.3 * math.sin(a)), 0.05, PLAT_TOP + 0.03, "TOM_Gold")
        p = Vector((5.12 * math.cos(a + TAU / 16), 5.12 * math.sin(a + TAU / 16), gz))
        for q in range(4):
            aq = TAU * q / 4 + a
            strip(gl, p, p + Vector((0.28 * math.cos(aq), 0.28 * math.sin(aq), 0)), 0.04, gz, "TOM_Gold")
    gl.build("Sanctum_Inlay", EXPORT)
    marker("Marker_TreeRoot", (0, 0, 0.5))
    marker("Marker_TreeView", (0, -8.6, PLAT_TOP), face_to=(0, 0, PLAT_TOP))


def build_meditation_spot():
    mb = MB()
    mx, my = MED
    base = h(mx, my)
    top = base + 0.25
    annulus(mb, 0, 3.0, base - 0.4, top, "TOM_Stone", "TOM_Stone", seg=72, cx=mx, cy=my)
    toward = Vector((-mx, -my, 0)).normalized()
    ang = math.atan2(-13.7 - my, 15.3 - mx)
    box(mb, (mx + 3.2 * math.cos(ang), my + 3.2 * math.sin(ang), base - 0.06), (0.6, 2.2, 0.34), ang, "TOM_Stone")
    rz = math.atan2(toward.y, toward.x) - math.pi / 2
    box(mb, (mx, my, top + 0.02), (1.6, 2.3, 0.04), rz, "TOM_Mat")
    bevel(mb.build("MeditationSpot", EXPORT), 0.025, 2)
    deco = MB()
    ez = top + 0.042
    annulus(deco, 2.86, 2.94, top - 0.01, top + 0.012, "TOM_Gold", "TOM_Gold", seg=72, cx=mx, cy=my)
    annulus(deco, 0.42, 0.47, ez - 0.004, ez, "TOM_Gold", "TOM_Gold", seg=40, cx=mx, cy=my)
    for k in range(8):
        a = rz + TAU * k / 8
        ln = 0.66 if k % 2 == 0 else 0.4
        strip(deco, (mx + 0.12 * math.cos(a), my + 0.12 * math.sin(a)), (mx + ln * math.cos(a), my + ln * math.sin(a)), 0.03, ez + 0.002, "TOM_Gold")
    seat = Vector((mx, my, 0)) - toward * 0.62
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.36)
    for v in bm.verts:
        v.co.z *= 0.36
        v.co.x *= 1 + 0.04 * math.cos(math.atan2(v.co.y, v.co.x) * 8)
    deco.add_bm(place(bm, (seat.x, seat.y, top + 0.17)), "TOM_Cushion")
    deco.build("MeditationSpot_Mat", EXPORT)
    marker("Marker_MeditationSeat", (seat.x, seat.y, top + 0.3), face_to=(0, 0, top + 0.3))


# ================================================================ the Tree of Mind

def grow(mb, root, cfg, rng):
    """Recursive branching; returns the terminal branches' point lists."""
    tips = []

    def br(start, d, length, r0, depth):
        n = max(3, min(10, int(length / 0.3) + 2))
        pts = [start.copy()]
        p, dd = start.copy(), d.normalized()
        for _ in range(n):
            j = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * cfg["wiggle"]
            dd = (dd + j + Vector((0, 0, cfg["up"]))).normalized()
            p = p + dd * (length / n)
            pts.append(p.copy())
        radii = [max(cfg["rmin"], r0 * (1 - cfg["taper"] * k / n)) for k in range(n + 1)]
        tube(mb, pts, radii, "TOM_Bark", cfg.get("sides", 8), v_scale=0.5)
        if depth == 0:
            tips.append(pts)
            return
        kids = rng.randint(*cfg["kids"])
        az0 = rng.uniform(0, TAU)
        u = dd.orthogonal().normalized()
        w = dd.cross(u)
        for k in range(kids):
            t = 1.0 if k == 0 else rng.uniform(cfg["spawn"], 0.95)
            idx = min(n, max(1, round(t * n)))
            ang = math.radians(rng.uniform(*cfg["angle"])) * (0.45 if k == 0 else 1.0)
            az = az0 + TAU * k / kids + rng.uniform(-0.4, 0.4)
            nd = (Matrix.Rotation(ang, 3, u * math.cos(az) + w * math.sin(az)) @ dd).normalized()
            br(pts[idx], nd, length * cfg["decay"] * rng.uniform(0.85, 1.1), radii[idx] * cfg["rdecay"], depth - 1)

    br(Vector(root), Vector((0, 0, 1)), cfg["len"], cfg["r"], cfg["depth"])
    return tips


def leaf_shape(mb, base, d, size, mname):
    """A single soft leaf (stages 0-2): a curved blade along a midrib, both sides."""
    u = d.normalized()
    side = u.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-3 else Vector((1, 0, 0))
    nrm = side.cross(u)
    pts = []
    for k in range(6):
        t = k / 5
        wdt = math.sin(math.pi * t) ** 0.8 * size * 0.38
        c = base + u * size * t + nrm * size * 0.12 * math.sin(math.pi * t)
        pts.append((c - side * wdt, c, c + side * wdt))
    for (l0, c0, r0), (l1, c1, r1) in zip(pts, pts[1:]):
        for quad in ((l0, l1, c1, c0), (c0, c1, r1, r0)):
            mb.face2([mb.vert(q) for q in quad], mname, True)


def leaf_cards(mb, center, radius, count, rng, mname, flat=0.75):
    """A canopy cluster: alpha-cut cards of the leaf-cluster texture through a squashed sphere, each
    vertex's custom normal pointing out of the cluster centre (soft, fluffy shading)."""
    for _ in range(count):
        d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
        p = center + Vector((d.x, d.y, d.z * flat)) * radius * rng.uniform(0.45, 1.0)
        s = radius * rng.uniform(0.55, 0.85)
        a = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
        b = a.cross(d)
        if b.length < 1e-3:
            continue
        b.normalize()
        a = d.cross(b).normalized()
        corners = [p + (a * sx + b * sy) * s * 0.5 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        ids = [mb.vert(c) for c in corners]
        for c in corners:
            nv = c - center
            mb.cn.append(tuple(Vector((nv.x, nv.y, nv.z / flat)).normalized()))
        mb.face2(ids, mname, True, [(0, 0), (1, 0), (1, 1), (0, 1)])


STAGES = [
    None,
    dict(len=1.0, r=0.04, depth=2, kids=(2, 3), decay=0.6, rdecay=0.7, angle=(30, 50), spawn=0.45,
         wiggle=0.1, up=0.15, taper=0.5, rmin=0.008, sides=7),
    dict(len=1.6, r=0.1, depth=3, kids=(2, 3), decay=0.66, rdecay=0.68, angle=(28, 48), spawn=0.4,
         wiggle=0.09, up=0.12, taper=0.45, rmin=0.012, sides=8),
    dict(len=2.3, r=0.28, depth=4, kids=(2, 3), decay=0.74, rdecay=0.66, angle=(38, 58), spawn=0.45,
         wiggle=0.08, up=0.05, taper=0.42, rmin=0.025, sides=9),
    dict(len=3.2, r=0.66, depth=4, kids=(3, 3), decay=0.76, rdecay=0.64, angle=(42, 64), spawn=0.4,
         wiggle=0.07, up=0.04, taper=0.4, rmin=0.04, sides=12),
]
BED = Vector((0, 0, 0.5))


def roots(mb, rng):
    for k in range(7):
        a = TAU * k / 7 + rng.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), math.sin(a), 0))
        pts = [BED + Vector((0, 0, 0.55)) + d * 0.2, BED + d * 0.9 + Vector((0, 0, 0.14)),
               BED + d * 1.6 + Vector((0, 0, 0.03)), BED + d * 2.35 + Vector((0, 0, 0.12)),
               BED + d * 2.95 + Vector((0, 0, -0.35))]
        tube(mb, pts, [0.4, 0.27, 0.18, 0.12, 0.06], "TOM_Bark", 9)


def build_tree_stages():
    objs = []
    for i in range(5):
        rng = random.Random(100 + i)
        bark = MB()
        if i == 0:
            pts = [BED, BED + Vector((0.01, 0, 0.12)), BED + Vector((0.03, 0.01, 0.24)), BED + Vector((0.02, 0.02, 0.33))]
            tube(bark, pts, [0.014, 0.011, 0.009, 0.007], "TOM_Bark", 6)
            leaf_shape(bark, pts[-1], Vector((1, 0.2, 0.6)), 0.15, "TOM_LeafSoft")
            leaf_shape(bark, pts[-1], Vector((-1, -0.1, 0.65)), 0.14, "TOM_LeafSoft")
            leaf_shape(bark, pts[1] + Vector((0, 0, 0.05)), Vector((0.2, 1, 0.35)), 0.1, "TOM_LeafSoft")
            objs.append(bark.build("TreeOfMind_Stage0", EXPORT))
            continue
        tips = grow(bark, BED, STAGES[i], rng)
        if i == 4:
            roots(bark, rng)
        if i <= 2:
            size = (0.24, 0.34)[i - 1]
            for pts in tips:
                for k in range(1, len(pts)):
                    dd = (pts[k] - pts[k - 1]).normalized()
                    for _ in range(1 if i == 1 else 2):
                        out = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.1, 0.7)))
                        leaf_shape(bark, pts[k], (dd * 0.5 + out).normalized(), size * rng.uniform(0.75, 1.15), "TOM_LeafSoft")
            objs.append(bark.build(f"TreeOfMind_Stage{i}", EXPORT))
            continue
        ob = bark.build(f"TreeOfMind_Stage{i}", EXPORT)
        canopy = MB()
        canopy.cn = []
        rmin, rmax = ((1.0, 1.4), (1.7, 2.4))[i - 3]
        for pts in tips:
            leaf_cards(canopy, pts[-1] + Vector((0, 0, 0.3)), rng.uniform(rmin, rmax), 26 if i == 3 else 34, rng, "TOM_Leaf")
        c = canopy.build(f"TreeOfMind_Stage{i}_Leaves", EXPORT)
        c.parent = ob
        if i == 4:
            glow = MB()
            for k in range(46):
                pts = rng.choice(tips)
                p = pts[-1] + Vector((rng.uniform(-1.6, 1.6), rng.uniform(-1.6, 1.6), rng.uniform(-2.6, -0.8)))
                glow.add_bm(place(blob_bm(0.09, subdiv=1, amp=0.0), p), "TOM_TreeGlow")
            glow.build("TreeOfMind_Stage4_Glow", EXPORT).parent = ob
        objs.append(ob)
    return objs


# ================================================================ pack props + scatter

def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = []
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
    for o in new:
        if o.type == "MESH":
            o.data.transform(o.matrix_world)
            o.parent = None
            o.matrix_world = Matrix.Identity(4)
            meshes.append(o)
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    return meshes


def merged_proto(name, parts):
    """One mesh object from (mesh object, material name) parts."""
    bm = bmesh.new()
    mats = []
    for o, mname in parts:
        if mname not in mats:
            mats.append(mname)
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        for f in tmp.faces:
            f.material_index = mats.index(mname)
        me_tmp = bpy.data.meshes.new("tmp")
        tmp.to_mesh(me_tmp)
        tmp.free()
        bm.from_mesh(me_tmp)
        bpy.data.meshes.remove(me_tmp)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mname in mats:
        me.materials.append(MATS[mname])
    for p in me.polygons:
        p.use_smooth = True
    return bpy.data.objects.new(name, me)


PROTOS = []          # (prefab name, object); the index is a scatter item's kind


def build_protos():
    coll = collection("Protos", link=False)
    meshes = NATURE / "Meshes"
    spec = []
    for t in ("F1_Tree1", "F1_Tree2", "F1_Tree4"):
        spec.append((t, [(o, "F1_Leaves" if o.name.startswith("F1_L") else "TOM_Bark") for o in import_fbx(meshes / f"{t}.fbx")]))
    for b in ("F1_BushHigh", "F1_BushMid", "F1_BushLow"):
        spec.append((b, [(o, "F1_Leaves") for o in import_fbx(meshes / f"{b}.fbx")]))
    for f in ("F1_LowGrass", "F1_MidGrass", "F1_HighGrass", "F1_Foliage1Patch", "F1_Foliage2Patch",
              "F1_Foliage3Patch", "F1_Foliage4Patch", "F1_Flower3Patch", "F1_Flower4Patch", "F1_Flower1", "F1_Flower2"):
        # Atlas contents: Foliage1 yellow sprigs, 2 white sprigs, 3 red spikes, 4 blue spikes (→ lavender),
        # Flower3Patch white daisies, Flower4Patch blue cups (→ violet), Flower1 pink, Flower2 orange.
        mname = "F1_Grass" if "Grass" in f else "F1_Lavender" if f in ("F1_Flower4Patch", "F1_Foliage4Patch") else "F1_Foliage"
        spec.append((f, [(o, mname) for o in import_fbx(meshes / f"{f}.fbx")]))
    for st in ("AP4_A2_Stone1", "AP4_A2_Stone2", "AP4_A2_Stone3", "AP4_A2_Stone5", "AP4_A2_Stone6", "AP4_A2_Stone8",
               "AP4_A3_LongStone1"):
        path = next((RUINS / "Meshes/Architecture").rglob(f"{st}.fbx"))
        spec.append((st, [(o, f"AP4_Atlas{st[5]}") for o in import_fbx(path)]))
    for idx, (name, parts) in enumerate(spec):
        ob = merged_proto(f"{idx:02d}_{name}", parts)
        coll.objects.link(ob)
        PROTOS.append((name, ob))
        for o, _ in parts:
            bpy.data.objects.remove(o)
    return coll


def kind(name):
    return next(i for i, (n, _) in enumerate(PROTOS) if n == name)


def scatter_object(name, items, protos):
    """Points with kind / rot / scl attributes, instanced from the proto collection by Geometry Nodes."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([it[1] for it in items], [], [])
    for att, typ, vals in (("kind", "INT", [it[0] for it in items]), ("rot", "FLOAT", [it[2] for it in items]),
                           ("scl", "FLOAT", [it[3] for it in items])):
        me.attributes.new(att, typ, "POINT").data.foreach_set("value", vals)
    ob = bpy.data.objects.new(name, me)
    SCATTER.objects.link(ob)
    ng = bpy.data.node_groups.new(f"{name}_GN", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    ci = N.new("GeometryNodeCollectionInfo")
    ci.inputs["Collection"].default_value = protos
    ci.inputs["Separate Children"].default_value = True
    ci.inputs["Reset Children"].default_value = True
    iop = N.new("GeometryNodeInstanceOnPoints")
    iop.inputs["Pick Instance"].default_value = True

    def attr(nm, typ):
        a = N.new("GeometryNodeInputNamedAttribute")
        a.data_type = typ
        a.inputs["Name"].default_value = nm
        return a
    k, r, s = attr("kind", "INT"), attr("rot", "FLOAT"), attr("scl", "FLOAT")
    cxyz = N.new("ShaderNodeCombineXYZ")
    L.new(r.outputs["Attribute"], cxyz.inputs["Z"])
    L.new(gi.outputs[0], iop.inputs["Points"])
    L.new(ci.outputs[0], iop.inputs["Instance"])
    L.new(k.outputs["Attribute"], iop.inputs["Instance Index"])
    L.new(cxyz.outputs[0], iop.inputs["Rotation"])
    L.new(s.outputs["Attribute"], iop.inputs["Scale"])
    L.new(iop.outputs[0], go.inputs[0])
    ob.modifiers.new("Scatter", "NODES").node_group = ng
    return ob


def free_spot(x, y, edge=1.5, path=1.9, sanctum=8.5):
    r, th = math.hypot(x, y), math.atan2(y, x)
    return (r < R(th) - edge and r > sanctum and path_dist(x, y) > path and pond_d(x, y) > 1.25
            and math.hypot(x - MED[0], y - MED[1]) > 3.8)


def sample(rng, rk=(0.3, 0.96), tries=300, **kw):
    for _ in range(tries):
        th = rng.uniform(0, TAU)
        r = R(th) * math.sqrt(rng.uniform(rk[0] ** 2, rk[1] ** 2))
        x, y = r * math.cos(th), r * math.sin(th)
        if free_spot(x, y, **kw):
            return x, y
    return None


def build_scatter():
    rng = random.Random(21)
    items, spots = [], []

    def add(name, x, y, z=None, rot=None, scl=1.0):
        items.append((kind(name), (x, y, h(x, y) if z is None else z), rng.uniform(0, TAU) if rot is None else rot, scl))

    # Trees round the rim, framing the meadow as in the overview concept.
    for _ in range(60):
        p = sample(rng, rk=(0.68, 0.92), edge=3.5)
        if not p or any(math.hypot(p[0] - q[0], p[1] - q[1]) < 7.5 for q in spots):
            continue
        spots.append(p)
        add(rng.choice(("F1_Tree1", "F1_Tree2", "F1_Tree4")), p[0], p[1], h(*p) - 0.15, scl=rng.uniform(0.55, 0.8))
        if len(spots) >= 15:
            break
    for _ in range(70):
        p = sample(rng, rk=(0.45, 0.97), edge=1.0)
        if p:
            add(rng.choice(("F1_BushHigh", "F1_BushMid", "F1_BushLow")), *p, scl=rng.uniform(0.7, 1.15))
            for _ in range(rng.randint(2, 5)):
                q = (p[0] + rng.uniform(-1.8, 1.8), p[1] + rng.uniform(-1.8, 1.8))
                if free_spot(*q, edge=0.6, path=1.4):
                    add(rng.choice(("F1_Foliage4Patch", "F1_Foliage4Patch", "F1_Flower3Patch", "F1_Flower4Patch")), *q, scl=rng.uniform(0.9, 1.4))
    # The meadow: grass everywhere off the paths, flowers drifting in noise-driven patches.
    for _ in range(3000 if FAST else 13000):
        th = rng.uniform(0, TAU)
        r = R(th) * math.sqrt(rng.uniform(0.0, 0.985))
        x, y = r * math.cos(th), r * math.sin(th)
        pd = path_dist(x, y)
        if pd < 1.15 + 0.4 * rng.random() or pond_d(x, y) < 1.1 or r < 7.5 or math.hypot(x - MED[0], y - MED[1]) < 3.2:
            continue
        if n2(x * 0.09, y * 0.09, 11.0) > 0.18 and rng.random() < 0.55:
            nm = rng.choice(("F1_Flower3Patch", "F1_Flower3Patch", "F1_Flower3Patch", "F1_Foliage4Patch", "F1_Foliage4Patch",
                             "F1_Flower4Patch", "F1_Foliage2Patch"))
        else:
            nm = rng.choice(("F1_LowGrass", "F1_LowGrass", "F1_MidGrass", "F1_MidGrass", "F1_HighGrass"))
        add(nm, x, y, scl=rng.uniform(1.0, 1.9) * (0.7 if pd < 2.0 else 1.0))
    for _ in range(260):            # tufts tight round the sanctum's foot
        a = rng.uniform(0, TAU)
        r = rng.uniform(7.3, 8.6)
        if min(abs(ang_diff(a, s)) for s in SPOKE_ANGLES) > math.radians(10):
            add(rng.choice(("F1_MidGrass", "F1_LowGrass", "F1_Flower3Patch")), r * math.cos(a), r * math.sin(a), scl=rng.uniform(0.8, 1.3))
    for _ in range(70):             # and in the bed round the tree
        a, r = rng.uniform(0, TAU), rng.uniform(0.6, 2.1)
        add(rng.choice(("F1_LowGrass", "F1_MidGrass", "F1_Flower3Patch")), r * math.cos(a), r * math.sin(a), 0.5, scl=rng.uniform(0.6, 1.0))
    # The broken stone circle of the ground-view concept: Ruins blocks round r ≈ 10, some sunk.
    stones = ("AP4_A2_Stone1", "AP4_A2_Stone2", "AP4_A2_Stone3", "AP4_A2_Stone5", "AP4_A2_Stone6", "AP4_A2_Stone8")
    k = 0
    while k < 18:
        a = rng.uniform(0, TAU)
        if min(abs(ang_diff(a, s)) for s in SPOKE_ANGLES) < math.radians(8):
            continue
        r = rng.uniform(9.4, 10.6)
        x, y = r * math.cos(a), r * math.sin(a)
        add(rng.choice(stones), x, y, h(x, y) - 0.12, rot=a + rng.uniform(-0.5, 0.5), scl=rng.uniform(1.0, 1.7))
        k += 1
    for a in (math.radians(-20), math.radians(160)):
        x, y = 9.6 * math.cos(a), 9.6 * math.sin(a)
        add("AP4_A3_LongStone1", x, y, h(x, y) - 0.05, rot=a)
    return items


# ================================================================ boulders, islets, clouds

def boulder_mesh(name, rng, r):
    mb = MB()
    mb.add_bm(blob_bm(r, (rng.uniform(1.0, 1.5), 1.0, rng.uniform(0.6, 0.85)), seed=rng.uniform(0, 99), amp=0.1,
                      flat_bottom=-r * 0.45), "TOM_Rock")
    ob = mb.build(name, EXPORT)
    rockify(ob, voxel=max(0.06, r * 0.12), strength=r * 0.35, scale=r * 1.4, stretch=1.5, decimate=0.5, seed=rng.random())
    return ob


def islet(mb, cx, cy, cz, rad, depth, rng, tall=False, segs=28, rugged=0.12, mat="TOM_Rock"):
    seed = rng.uniform(0, 100)

    def rr(a):
        return rad * (1 + 0.18 * n2(math.cos(a) * 1.5 + seed, math.sin(a) * 1.5, seed))
    c = mb.vert((cx, cy, cz + rad * 0.03))
    prev = [mb.vert((cx + rr(TAU * j / segs) * math.cos(TAU * j / segs), cy + rr(TAU * j / segs) * math.sin(TAU * j / segs), cz))
            for j in range(segs)]
    for j in range(segs):
        mb.face([c, prev[j], prev[(j + 1) % segs]], mat, True)
    levels = ([(-0.03, 1.02), (-0.12, 0.98), (-0.25, 0.92), (-0.4, 0.88), (-0.55, 0.82), (-0.7, 0.72),
               (-0.85, 0.55), (-0.95, 0.35), (-1.0, 0.15)] if tall else
              [(-0.06, 1.0), (-0.2, 0.96), (-0.45, 0.85), (-0.7, 0.65), (-0.88, 0.4), (-1.0, 0.12)])
    for zf, s in levels:
        cur = []
        for j in range(segs):
            a = TAU * j / segs
            r = rr(a) * s * (1 + rugged * n2(j * 0.9 + seed, zf * 6.0, seed) + rng.uniform(-0.04, 0.04))
            cur.append(mb.vert((cx + r * math.cos(a), cy + r * math.sin(a), cz + zf * depth)))
        for j in range(segs):
            j1 = (j + 1) % segs
            mb.face([cur[j], cur[j1], prev[j1], prev[j]], mat, True)
        prev = cur
    b = mb.vert((cx, cy, cz - depth * 1.08))
    for j in range(segs):
        mb.face([b, prev[(j + 1) % segs], prev[j]], mat, True)


def grass_cap(mb, cx, cy, cz, rad, rng, segs=24):
    """A meadow disc on an islet's top, drooping over its rim like the main island's lip."""
    seed = rng.uniform(0, 50)

    def rr(j):
        a = TAU * j / segs
        return 1 + 0.12 * n2(math.cos(a) + seed, math.sin(a), seed)
    c = mb.vert((cx, cy, cz + 0.12))
    rings = []
    for rk, dz in ((0.75, 0.1), (1.04, 0.0), (1.1, -0.35)):
        rings.append([mb.vert((cx + rad * rk * rr(j) * math.cos(TAU * j / segs), cy + rad * rk * rr(j) * math.sin(TAU * j / segs), cz + dz))
                      for j in range(segs)])
    for j in range(segs):
        mb.face([c, rings[0][j], rings[0][(j + 1) % segs]], "TOM_Terrain", True)
    for a, b in zip(rings, rings[1:]):
        for j in range(segs):
            j1 = (j + 1) % segs
            mb.face([a[j], b[j], b[j1], a[j1]], "TOM_Terrain", True)


def build_boulders():
    rng = random.Random(41)
    protos = [boulder_mesh(f"Boulder_{i}", rng, r) for i, r in enumerate((0.9, 1.3, 0.6, 1.7))]
    for k in range(34):
        p = sample(rng, rk=(0.35, 0.98), edge=0.6)
        if not p:
            continue
        o = bpy.data.objects.new(f"Rock_{k:02d}", rng.choice(protos).data)
        s = rng.uniform(0.6, 1.3)
        o.location = (p[0], p[1], h(*p) - 0.1 * s)
        o.rotation_euler = (0, 0, rng.uniform(0, TAU))
        o.scale = (s, s, s)
        EXPORT.objects.link(o)
    c, s_ = math.cos(PROT), math.sin(PROT)
    for k in range(16):             # the pond's rim
        a = TAU * k / 16 + rng.uniform(-0.1, 0.1)
        lx, ly = PRX * 1.04 * math.cos(a), PRY * 1.04 * math.sin(a)
        x, y = PC[0] + lx * c - ly * s_, PC[1] + lx * s_ + ly * c
        if min(math.hypot(x - ex, y - ey) for ex, ey in FALL_EDGES) < 4 or path_dist(x, y) < 2:
            continue
        o = bpy.data.objects.new(f"PondRock_{k:02d}", protos[k % 3].data)
        o.location = (x, y, WATER_Z - 0.1)
        sz = rng.uniform(0.6, 0.95)
        o.scale = (sz, sz, sz * 0.8)
        o.rotation_euler = (0, 0, a)
        EXPORT.objects.link(o)
    for k, (dx, dy) in enumerate(((1.5, 1.0), (-3.0, -1.2))):    # two little pillars standing in the pond
        mb = MB()
        islet(mb, PC[0] + dx, PC[1] + dy, 0.25, 1.1, 1.6, random.Random(60 + k), segs=14)
        rockify(mb.build(f"PondPillar_{k}", EXPORT), voxel=0.08, strength=0.12, scale=0.8, stretch=3.0, decimate=0.6, seed=k)
        cap = MB()
        grass_cap(cap, PC[0] + dx, PC[1] + dy, 0.27, 1.05, random.Random(70 + k), segs=14)
        cap.build(f"PondPillar_{k}_Meadow", EXPORT)


def build_surroundings(items):
    rng = random.Random(31)
    isl, caps = MB(), MB()
    for k in range(8):
        th = TAU * k / 8 + rng.uniform(-0.3, 0.3)
        if min(abs(ang_diff(th, a)) for a in EXIT_ANGLES + FALLS) < 0.35:
            th += 0.5
        d = R(th) + rng.uniform(10, 30)
        x, y, z = d * math.cos(th), d * math.sin(th), rng.uniform(-9, -2.5)
        rad = rng.uniform(2.5, 6.5)
        islet(isl, x, y, z - 0.3, rad, rad * rng.uniform(1.4, 2.2), rng)
        grass_cap(caps, x, y, z, rad, rng)
        if rad > 4:
            items.append((kind(rng.choice(("F1_Tree1", "F1_Tree2", "F1_Tree4"))), (x, y, z), rng.uniform(0, TAU), rad * 0.12))
        for _ in range(rng.randint(1, 3)):
            items.append((kind(rng.choice(("F1_BushHigh", "F1_BushMid"))),
                          (x + rng.uniform(-0.5, 0.5) * rad, y + rng.uniform(-0.5, 0.5) * rad, z + 0.1), rng.uniform(0, TAU), 0.9))
    rockify(isl.build("Surround_Islets", EXPORT), voxel=0.25 if FAST else 0.16, strength=0.5, scale=1.6, stretch=4.0, decimate=0.35)
    caps.build("Surround_IsletMeadows", EXPORT)

    back = MB()
    for k in range(11):
        th = math.radians(rng.uniform(15, 165) if k < 8 else rng.uniform(190, 350))
        d = rng.uniform(190, 320)
        islet(back, d * math.cos(th), d * math.sin(th), rng.uniform(-4, 22), rng.uniform(8, 18), rng.uniform(35, 60), rng,
              tall=True, segs=26, rugged=0.22, mat="TOM_RockDistant")
    ax, ay, az = 230 * math.cos(math.radians(122)), 230 * math.sin(math.radians(122)), -14.0
    arc = [Vector((ax + 20 * math.cos(math.radians(a)), ay, az + 20 + 26 * math.sin(math.radians(a)))) for a in range(0, 181, 10)]
    tube(back, arc, [7.5 - 2.5 * math.sin(math.radians(a)) for a in range(0, 181, 10)], "TOM_RockDistant", 14)
    for sx in (-20, 20):
        islet(back, ax + sx, ay, az + 20, 9, 45, rng, tall=True, segs=20, rugged=0.22, mat="TOM_RockDistant")
    ob = back.build("Backdrop_Cliffs", EXPORT)
    rockify(ob, voxel=1.4 if FAST else 0.9, strength=3.0, scale=9.0, stretch=5.0, decimate=0.3)
    tops = MB()                     # their woods, as soft distant leaf-card clumps
    tops.cn = []
    rngb = random.Random(32)
    for v in [vv for vv in ob.data.vertices if vv.normal.z > 0.85 and vv.co.z > -8][::30]:
        leaf_cards(tops, v.co + Vector((0, 0, 2.0)), rngb.uniform(3.0, 5.5), 10, rngb, "F1_Leaves")
    tops.build("Backdrop_Woods", EXPORT)


def metaball_clouds(name, clusters, rng, res):
    """Puffs from metaballs (soft unions), converted to a mesh."""
    data = bpy.data.metaballs.new(name)
    data.resolution = data.render_resolution = res
    ob = bpy.data.objects.new(name + "_mb", data)
    sc.collection.objects.link(ob)
    for cx, cy, cz, size in clusters:
        for _ in range(rng.randint(4, 7)):
            e = data.elements.new()
            e.co = (cx + rng.uniform(-1, 1) * size * 1.2, cy + rng.uniform(-0.7, 0.7) * size, cz + rng.uniform(0, 0.4) * size)
            e.radius = size * rng.uniform(0.55, 1.0)
            e.stiffness = 1.6
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
    bpy.data.objects.remove(ob)
    me.materials.clear()
    me.materials.append(MATS["TOM_Cloud"])
    for p in me.polygons:
        p.use_smooth = True
    out = bpy.data.objects.new(name, me)
    EXPORT.objects.link(out)
    return out


def build_clouds():
    rng = random.Random(51)
    near = []
    for _ in range(30):
        th = rng.uniform(0, TAU)
        if min(abs(ang_diff(th, a)) for a in FALLS) < 0.25:
            continue
        d = R(th) + rng.uniform(-3, 9)
        near.append((d * math.cos(th), d * math.sin(th), rng.uniform(-16, -10), rng.uniform(3.0, 5.5)))
    metaball_clouds("Clouds_Near", near, rng, 0.9 if FAST else 0.6)
    far = []
    for _ in range(70 if FAST else 120):
        th = rng.uniform(0, TAU)
        d = 45 + 320 * rng.random() ** 1.2
        far.append((d * math.cos(th), d * math.sin(th), rng.uniform(-32, -25), rng.uniform(9, 20) * (0.7 + d / 350)))
    metaball_clouds("Clouds_Sea", far, rng, 4.0 if FAST else 2.6)
    floor = MB()
    annulus(floor, 0, 1200, -40, -33, "TOM_Cloud", "TOM_Cloud", seg=48)
    floor.build("Clouds_Floor", EXPORT)


# ================================================================ world, light, camera (preview only)

def build_world():
    w = bpy.data.worlds.new("TOM_Sky")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = load_image(PACKS / "SkyBaseAP/sky_14_8k(AP).png")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0, 0, math.radians(200))
    nt.links.new(tc.outputs["Generated"], mp.inputs[0])
    nt.links.new(mp.outputs[0], env.inputs[0])
    # Warm the horizon toward the ground-view concept's sunset.
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    rmp = nt.nodes.new("ShaderNodeMapRange")
    rmp.inputs["From Min"].default_value = 0.0
    rmp.inputs["From Max"].default_value = 0.25
    rmp.inputs["To Min"].default_value = 0.45
    rmp.inputs["To Max"].default_value = 0.0
    nt.links.new(sep.outputs["Z"], rmp.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "SCREEN"
    nt.links.new(rmp.outputs[0], mix.inputs[0])
    nt.links.new(env.outputs[0], mix.inputs[6])
    mix.inputs[7].default_value = hexc("ffc89a")
    nt.links.new(mix.outputs[2], nt.nodes["Background"].inputs[0])
    nt.nodes["Background"].inputs[1].default_value = 0.75

    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 5.5
    sun.data.color = (1.0, 0.86, 0.7)
    sun.data.angle = math.radians(2.5)
    sun.rotation_euler = (math.radians(60), 0, math.radians(-150))
    PREVIEW.objects.link(sun)
    glow = bpy.data.objects.new("TreeGlowLight", bpy.data.lights.new("TreeGlowLight", "POINT"))
    glow.data.energy = 220
    glow.data.color = (1.0, 0.86, 0.55)
    glow.data.shadow_soft_size = 0.6
    glow.location = (0, 0, 1.4)
    PREVIEW.objects.link(glow)

    sc.render.engine = "BLENDER_EEVEE"
    for attr, val in (("taa_render_samples", 24 if FAST else 96), ("use_raytracing", True), ("use_shadows", True),
                      ("shadow_ray_count", 2), ("use_fast_gi", True)):
        try:
            setattr(sc.eevee, attr, val)
        except (AttributeError, TypeError):
            pass
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Punchy"
    except TypeError:
        pass
    sc.view_settings.exposure = 0.15
    build_compositor()
    return glow


def build_compositor():
    """Bloom on the gold, the glow and the falls (EEVEE no longer blooms by itself)."""
    try:
        ng = bpy.data.node_groups.new("TOM_Comp", "CompositorNodeTree")
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        rl = ng.nodes.new("CompositorNodeRLayers")
        gl = ng.nodes.new("CompositorNodeGlare")
        out = ng.nodes.new("NodeGroupOutput")
        for k, v in (("Type", "Bloom"), ("Quality", "High"), ("Threshold", 1.0), ("Strength", 0.35), ("Size", 0.6)):
            if k in gl.inputs:
                try:
                    gl.inputs[k].default_value = v
                except TypeError:
                    pass
        if hasattr(gl, "glare_type"):
            gl.glare_type = "BLOOM"
        ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
        ng.links.new(gl.outputs["Image"], out.inputs[0])
        sc.compositing_node_group = ng
        sc.render.use_compositing = True
    except Exception as e:          # the compositor API moved in 5.0; a render without bloom is still fine
        print("[tree-of-mind] compositor skipped:", e)


def preview_player(pz):
    """A stand-in for Theo on the path: long navy coat, dark hair."""
    mb = MB()
    y0 = -17.0
    tube(mb, [Vector((0, y0, pz + 0.02)), Vector((0, y0, pz + 0.55)), Vector((0, y0, pz + 1.05)), Vector((0, y0, pz + 1.42))],
         [0.3, 0.25, 0.2, 0.2], "TOM_PreviewCoat", 16)
    for sx in (-0.26, 0.26):
        tube(mb, [Vector((sx, y0, pz + 1.38)), Vector((sx * 1.15, y0, pz + 1.0)), Vector((sx * 1.1, y0 + 0.03, pz + 0.72))],
             [0.07, 0.06, 0.05], "TOM_PreviewCoat", 10)
    tube(mb, [Vector((0, y0, pz + 1.42)), Vector((0, y0, pz + 1.5))], [0.06, 0.055], "TOM_PreviewSkin", 8)
    mb.add_bm(place(blob_bm(0.115, (0.9, 0.95, 1.08), amp=0.0, subdiv=3), (0, y0, pz + 1.62)), "TOM_PreviewSkin")
    mb.add_bm(place(blob_bm(0.13, (0.95, 1.0, 0.95), amp=0.12, freq=3.0, subdiv=3), (0, y0 + 0.02, pz + 1.66)), "TOM_PreviewHair")
    mb.build("PreviewPlayer", PREVIEW)


# ================================================================ build

build_materials()
protos = build_protos()
build_island()
build_falls()
build_sanctum()
build_meditation_spot()
stages = build_tree_stages()
build_boulders()
items = build_scatter()
build_surroundings(items)
scatter_object("Scatter_Island", items, protos)
build_clouds()
marker("Marker_Spawn", (0, -30.0, h(0, -30.0)), face_to=(0, 0, 0))
marker("Marker_Exit", (0, -33.0, h(0, -33.0)), face_to=(0, -60, 0))
marker("Marker_Pond", (PC[0], PC[1], WATER_Z))
for ob in [o for o in bpy.data.objects if o.name.endswith("_texspace")]:
    bpy.data.objects.remove(ob)

with open(OUT / "scatter.json", "w") as f:
    json.dump({"space": "blender (metres, Z up); rot = radians about Z",
               "prefabs": [n for n, _ in PROTOS],
               "items": [{"prefab": PROTOS[k][0], "pos": [round(c, 3) for c in p], "rot": round(r, 4), "scale": round(s, 3)}
                         for k, p, r, s in items]}, f, indent=0)

tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in EXPORT.objects if o.type == "MESH")
print(f"[tree-of-mind] {len(EXPORT.objects)} export objects, {tris} triangles; {len(items)} scatter instances")

bpy.ops.object.select_all(action="DESELECT")
for o in EXPORT.objects:
    o.select_set(True)
bpy.ops.export_scene.fbx(filepath=str(OUT / "tree_of_mind.fbx"), use_selection=True, object_types={"EMPTY", "MESH"},
                         apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL",
                         axis_forward="-Z", axis_up="Y", mesh_smooth_type="FACE", path_mode="STRIP")
for i, o in enumerate(stages):
    for oo in [o] + list(o.children):
        oo.hide_render = oo.hide_viewport = i != 1

glow = build_world()
pz = h(0, -17.0)
preview_player(pz)
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
PREVIEW.objects.link(cam)
sc.camera = cam
cam.data.clip_end = 3000


def shoot(name, loc, target, lens, res, ortho=None):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO" if ortho else "PERSP"
    if ortho:
        cam.data.ortho_scale = ortho
    cam.data.lens = lens
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = str(OUT / "previews" / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("[tree-of-mind] wrote", sc.render.filepath)


def res(w, hgt):
    return (int(w * 0.6), int(hgt * 0.6)) if FAST else (w, hgt)


shoot("player", (0.9, -21.6, pz + 2.1), (0, 3, pz + 1.7), 24, res(1600, 740))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "tree_of_mind.blend"))
shoot("overview", (10, -64, 56), (3, -1, -3), 30, res(1440, 1080))
shoot("plan", (0, 0, 150), (0, 0.001, 0), 50, res(1100, 1100), ortho=86)

for o in list(EXPORT.objects) + list(PREVIEW.objects) + list(SCATTER.objects):
    if o.type == "MESH":
        o.hide_render = True
lx = [-9.0, -6.5, -3.0, 3.5, 14.0]
for i, src in enumerate(stages):
    for part in [src] + list(src.children):
        o = bpy.data.objects.new(f"Lineup{i}_{part.name}", part.data)
        o.location = (lx[i], 0, 300)
        PREVIEW.objects.link(o)
pad = MB()
annulus(pad, 0, 30, -0.5, 0.5, "TOM_Terrain", "TOM_Rock", seg=64)
pad.build("LineupPad", PREVIEW).location = (2, 0, 300)
glow.location = (0, 0, 302)
shoot("stages", (2.5, -48, 307), (2.5, 0, 305.5), 35, res(1800, 760))
