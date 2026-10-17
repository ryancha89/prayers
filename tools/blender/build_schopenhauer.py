"""Schopenhauer lecture character: OldMan.fbx (static, no rig) + Theo's (m_char_004) skeleton.

Run (headless, Blender 5.1):
  Blender -b --python tools/blender/build_schopenhauer.py -- <OldMan.fbx> <texdir> <theo_anim_dir> <outdir> [stage]

What it does
  1. Imports the static model, assigns 1_<material>_BaseColor.png, bakes the FBX group's
     0.01 / +90°X transform into the meshes (metres, Z-up, feet at z=0, facing -Y) and joins
     them into one mesh `Schopenhauer_Geo` with four material slots.
  2. Builds a skeleton with Theo's BODY bone names and hierarchy (no face / hair / skirt /
     twist bones), its joints moved onto this much shorter, big-headed body (SCHOP_JOINTS,
     measured off 10 cm grid renders of the model). Each bone keeps Theo's rest orientation,
     rotated by the minimal rotation that re-aims Theo's joint->child vector at ours, so
     Theo's clips transfer as "same bone orientation in the world" (limbs point where his do).
  3. Skins with automatic (heat) weights computed on a helper armature whose bones run
     joint->child (Theo's FBX bones point sideways, Maya X-along-bone, useless for heat
     weighting), then hands the vertex groups to the export armature. Hair/head are rigid on
     Head_Jnt; the coat skirt is blended toward Hip_Jnt so tails don't follow each thigh.
  4. Retargets Theo's GENERIC clips (every rig in the Unity project is Generic, so Unity
     cannot retarget them itself): per frame, per bone, world rotation copied, Hip
     translation scaled by the leg-length ratio; other bones keep our offsets.
  5. Exports outdir/Schopenhauer.fbx (mesh+rig, rest pose) and outdir/Schopenhauer@<Clip>.fbx
     (rig + one baked take each), Unity-ready (-Z forward, Y up, scale 1 = metres).
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
FBX, TEXDIR, ANIMDIR, OUT = argv[:4]
STAGE = argv[4] if len(argv) > 4 else "all"
os.makedirs(OUT, exist_ok=True)

CLIPS = ["Male_Idle", "Male_IdleBlink", "Male_TalkLoop", "Male_Talking", "Male_Thinking", "Male_ThinkingLoop"]
SOURCE_RIG = "Male_Idle"   # rest skeleton is read from this clip's FBX

# Body bones kept from Theo's rig (same names → same Unity paths in every exported file).
KEEP = [
    "Root_Character", "Hip_Jnt", "Spine01_Jnt", "Chest_Jnt", "Neck00_Jnt", "Head_Jnt", "Head_End",
    "Thigh_Jnt_L", "Shin_Jnt_L", "Foot_Jnt_L", "Ball_Jnt_L", "Toe_Jnt_L",
    "Thigh_Jnt_R", "Shin_Jnt_R", "Foot_Jnt_R", "Ball_Jnt_R", "Toe_Jnt_R",
]
for s in "LR":
    KEEP += [f"shoulder_Jnt_{s}", f"Arm_Jnt_{s}", f"Elbow_Jnt_{s}", f"Hand_Jnt_{s}", f"Handend_Jnt_{s}"]
    for f in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
        KEEP += [f"Finger_{s}_{f}_0{i}" for i in (1, 2, 3)]
NO_DEFORM = {"Root_Character", "Head_End", "Handend_Jnt_L", "Handend_Jnt_R", "Toe_Jnt_L", "Toe_Jnt_R"}

# Our joints (metres, Blender world, character faces -Y, his left = +X), read off grid renders.
SCHOP_JOINTS = {
    "Root_Character": (0, 0, 0),
    "Hip_Jnt": (0, 0.01, 0.70),
    "Spine01_Jnt": (0, 0.01, 0.82),
    "Chest_Jnt": (0, 0.015, 0.95),
    "Neck00_Jnt": (0, 0.02, 1.165),
    "Head_Jnt": (0, 0.0, 1.255),
    "Head_End": (0, 0.0, 1.48),
    "shoulder_Jnt_L": (0.035, 0.035, 1.12),
    "Arm_Jnt_L": (0.205, 0.045, 1.115),
    "Elbow_Jnt_L": (0.295, 0.035, 0.935),
    "Hand_Jnt_L": (0.338, -0.025, 0.725),
    "Handend_Jnt_L": (0.35, -0.04, 0.665),
    "Thigh_Jnt_L": (0.085, 0.015, 0.665),
    "Shin_Jnt_L": (0.125, 0.02, 0.365),
    "Foot_Jnt_L": (0.155, 0.045, 0.085),
    "Ball_Jnt_L": (0.175, -0.07, 0.03),
    "Toe_Jnt_L": (0.185, -0.13, 0.025),
}
for k in list(SCHOP_JOINTS):
    if k.endswith("_L"):
        x, y, z = SCHOP_JOINTS[k]
        SCHOP_JOINTS[k[:-2] + "_R"] = (-x, y, z)
HAND_SCALE = 1.0  # finger offsets relative to the wrist: his hands are about Theo's size


def log(*a):
    print("[schop]", *a, flush=True)


def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ── 1. the model ────────────────────────────────────────────────────────────────────────────
def import_model():
    bpy.ops.import_scene.fbx(filepath=FBX)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in [o for o in bpy.context.scene.objects if o.type == "EMPTY"]:
        bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for m in list(bpy.data.materials):
        if m.name.startswith("Schop_"):
            continue
        key = m.name.split(".")[0]
        path = os.path.join(TEXDIR, f"1_{key}_BaseColor.png")
        if not os.path.exists(path):
            log("no texture for material", m.name)
            continue
        m.use_nodes = True
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        for l in list(bsdf.inputs["Base Color"].links):
            nt.links.remove(l)
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(path, check_existing=True)
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.65
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.3
        m.name = "Schop_" + key
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = body.data.name = "Schopenhauer_Geo"
    lo = min(v.co.z for v in body.data.vertices)
    hi = max(v.co.z for v in body.data.vertices)
    log("model joined:", len(body.data.vertices), "verts, z", round(lo, 3), "..", round(hi, 3),
        "materials", [m.name for m in body.data.materials])
    return body


# ── 2. the skeleton ─────────────────────────────────────────────────────────────────────────
def import_theo(name):
    """Import one of Theo's clip FBXs; return its armature (meshes deleted)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(ANIMDIR, name + ".fbx"))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    for o in new:
        if o is not arm and o.type == "MESH":
            bpy.data.objects.remove(o)
    arm.name = "THEO_" + name
    return arm


def theo_rest(arm):
    """bone -> (world head, world 3x3 rotation) of Theo's rest skeleton."""
    mw = arm.matrix_world
    rot = mw.to_3x3().normalized()
    out = {}
    for b in arm.data.bones:
        out[b.name] = (mw @ b.head_local, (rot @ b.matrix_local.to_3x3()).normalized())
    return out


def primary_child(name):
    if name in ("Head_End",):
        return None
    order = {"Root_Character": "Hip_Jnt", "Hip_Jnt": "Spine01_Jnt", "Spine01_Jnt": "Chest_Jnt",
             "Chest_Jnt": "Neck00_Jnt", "Neck00_Jnt": "Head_Jnt", "Head_Jnt": "Head_End"}
    if name in order:
        return order[name]
    s = name[-1]
    chain = {f"shoulder_Jnt_{s}": f"Arm_Jnt_{s}", f"Arm_Jnt_{s}": f"Elbow_Jnt_{s}",
             f"Elbow_Jnt_{s}": f"Hand_Jnt_{s}", f"Hand_Jnt_{s}": f"Handend_Jnt_{s}",
             f"Thigh_Jnt_{s}": f"Shin_Jnt_{s}", f"Shin_Jnt_{s}": f"Foot_Jnt_{s}",
             f"Foot_Jnt_{s}": f"Ball_Jnt_{s}", f"Ball_Jnt_{s}": f"Toe_Jnt_{s}"}
    if name in chain:
        return chain[name]
    if name.startswith("Finger_") and name[-1] in "12":
        return name[:-1] + str(int(name[-1]) + 1)
    return None


def fit_joints(theo, parents):
    """Our joint positions: anchors from SCHOP_JOINTS, the rest (fingers) carried along."""
    pos = {}
    for n in KEEP:
        if n in SCHOP_JOINTS:
            pos[n] = Vector(SCHOP_JOINTS[n])
    # fingers: offset from the wrist, rotated with the hand's re-aim
    for n in KEEP:
        if n in pos:
            continue
        s = n.split("_")[1]
        wrist = f"Hand_Jnt_{s}"
        hand_end = f"Handend_Jnt_{s}"
        dt = (theo[hand_end][0] - theo[wrist][0]).normalized()
        ds = (pos[hand_end] - pos[wrist]).normalized()
        q = dt.rotation_difference(ds)
        pos[n] = pos[wrist] + q @ ((theo[n][0] - theo[wrist][0]) * HAND_SCALE)
    return pos


def build_armatures(theo, parents, pos):
    """-> (export armature E, weighting armature W). Same bone names and parents."""
    corr = {}
    for n in KEEP:  # re-aim rotation per bone
        c = primary_child(n)
        if c and c in pos:
            dt = theo[c][0] - theo[n][0]
            ds = pos[c] - pos[n]
            corr[n] = dt.normalized().rotation_difference(ds.normalized()).to_matrix()
    for n in KEEP:
        if n not in corr:
            p = parents.get(n)
            corr[n] = corr.get(p, Matrix.Identity(3)) if p else Matrix.Identity(3)
            # parents are visited first in KEEP order for everything that lacks a child

    def make(name, export):
        d = bpy.data.armatures.new(name)
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        ebs = {}
        for n in KEEP:
            eb = d.edit_bones.new(n)
            c = primary_child(n)
            if export:
                r = corr[n] @ theo[n][1]
                length = (pos[c] - pos[n]).length if c and c in pos else 0.03
                m = Matrix.Translation(pos[n]) @ r.to_4x4()
                eb.length = max(length, 0.01)
                eb.matrix = m
                eb.length = max(length, 0.01)
            else:
                eb.head = pos[n]
                if c and c in pos and (pos[c] - pos[n]).length > 1e-4:
                    eb.tail = pos[c]
                else:
                    p = parents.get(n)
                    dirv = (pos[n] - pos[p]).normalized() if p else Vector((0, 0, 1))
                    eb.tail = pos[n] + dirv * 0.025
            ebs[n] = eb
        for n in KEEP:
            p = parents.get(n)
            if p:
                ebs[n].parent = ebs[p]
                ebs[n].use_connect = False
        bpy.ops.object.mode_set(mode="OBJECT")
        for n in NO_DEFORM:
            d.bones[n].use_deform = False
        return o

    E = make("Armature", True)
    W = make("WeightRig", False)
    return E, W, corr


# ── 3. skinning ─────────────────────────────────────────────────────────────────────────────
def rigid_small_islands(me, vg, names, max_verts=400):
    """Buttons, cuff buttons, chain links: small floating pieces get mixed heat weights (half
    shoulder, half hand) and smear into long gold sticks on every gesture. Each one instead takes,
    whole, the weights of the nearest vertex of the big cloth piece it sits on."""
    from mathutils.kdtree import KDTree
    parent = list(range(len(me.vertices)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for e in me.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    islands = {}
    for v in me.vertices:
        islands.setdefault(find(v.index), []).append(v.index)
    small = [ids for ids in islands.values() if len(ids) <= max_verts]
    big = set(i for ids in islands.values() if len(ids) > max_verts for i in ids)
    kd = KDTree(len(big))
    for i in big:
        kd.insert(me.vertices[i].co, i)
    kd.balance()
    def copy_from(i, j):
        src = [(g.group, g.weight) for g in me.vertices[j].groups if g.weight > 1e-4]
        for g in list(me.vertices[i].groups):
            vg[names[g.group]].remove([i])
        for gi, w in src:
            vg[names[gi]].add([i], w, "REPLACE")

    for ids in small:
        cos = [me.vertices[i].co for i in ids]
        lo = Vector((min(c.x for c in cos), min(c.y for c in cos), min(c.z for c in cos)))
        hi = Vector((max(c.x for c in cos), max(c.y for c in cos), max(c.z for c in cos)))
        if (hi - lo).length < 0.10:
            # a button / a chain link: rigid, from the cloth under its centre
            _, j, _ = kd.find((lo + hi) / 2)
            for i in ids:
                copy_from(i, j)
        else:
            # a long thin piece (the coat's edge piping runs collar to hem): rigid would pin the
            # whole strip to the chest — each vertex follows the cloth right under it instead
            for i in ids:
                _, j, _ = kd.find(me.vertices[i].co)
                copy_from(i, j)
    log("rigid small islands:", len(small), "of", len(islands))


def skin(body, E, W):
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    W.select_set(True)
    bpy.context.view_layer.objects.active = W
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    vg = body.vertex_groups
    me = body.data
    n_unweighted = sum(1 for v in me.vertices if not any(g.weight > 1e-4 for g in v.groups))
    log("auto weights:", len(vg), "groups;", n_unweighted, "vertices with no weight")

    def part(name):
        """Vertices of the part textured with 1_<name>: read off the faces' material slots (each
        source mesh carried exactly one material into the join)."""
        out = [False] * len(me.vertices)
        idx = next((i for i, m in enumerate(me.materials) if m and m.name == "Schop_" + name), None)
        if idx is None:
            log("no material slot for part", name)
            return out
        for poly in me.polygons:
            if poly.material_index == idx:
                for vi in poly.vertices:
                    out[vi] = True
        return out

    names_all = {g.index: g.name for g in vg}
    skin_hair = part("m4")
    coat = part("blinn1")
    waistcoat = part("m2")
    arm_names = ("Arm_", "Elbow_", "Hand_", "Finger_")

    def sleeve(v):
        """Cuffs and sleeves hang at the coat's sides: mostly arm-weighted, and left alone."""
        return sum(g.weight for g in v.groups if names_all[g.group].startswith(arm_names)) > 0.5
    head = vg.get("Head_Jnt") or vg.new(name="Head_Jnt")
    hip = vg["Hip_Jnt"]
    names = {g.index: g.name for g in vg}
    rigid_small_islands(me, vg, names)
    for v in me.vertices:
        co = v.co
        if skin_hair[v.index] and co.z > 1.235 and abs(co.x) < 0.3:
            # head, face and the wild hair: rigid on the head (no neck shear through the tufts)
            for g in list(v.groups):
                vg[names[g.group]].remove([v.index])
            head.add([v.index], 1.0, "REPLACE")
        elif (coat[v.index] or waistcoat[v.index]) and co.z < 0.90 and abs(co.x) < 0.25 and not sleeve(v):
            # Coat skirt and waistcoat points below the waist. Heat weighting gets these badly wrong
            # (the free-hanging front panels came out on Chest/shoulders/Arm and hung a stick off
            # the hem whenever an arm moved), so they are AUTHORED: mostly the hips, with a share
            # of the thigh on their own side that grows toward the hem; blended into the heat
            # weights over the top 10 cm so the waist has no seam.
            t = min(1.0, max(0.0, (0.80 - co.z) / 0.40))
            side = min(1.0, abs(co.x) / 0.12) * 0.35 * t
            thigh = "Thigh_Jnt_L" if co.x > 0 else "Thigh_Jnt_R"
            want = {"Hip_Jnt": 1.0 - side, thigh: side}
            k = min(1.0, max(0.0, (0.90 - co.z) / 0.10))   # 0 at 0.90 (heat) … 1 at 0.80 (authored)
            old_w = {names[g.group]: g.weight for g in v.groups}
            tot = sum(old_w.values()) or 1.0
            mix = {n: (1 - k) * w / tot for n, w in old_w.items()}
            for n, w in want.items():
                mix[n] = mix.get(n, 0.0) + k * w
            for n in old_w:
                vg[n].remove([v.index])
            for n, w in mix.items():
                if w > 1e-4:
                    (vg.get(n) or vg.new(name=n)).add([v.index], w, "REPLACE")
        elif abs(co.x) < 0.17 and 0.5 < co.z < 1.2 and not skin_hair[v.index]:
            # torso cloth (waistcoat, watch chain, coat front): heat weighting leaks the arms into
            # the thin gold chain and trims, which then stretch out to the hand on every gesture.
            arm_w = [(g.group, g.weight) for g in v.groups
                     if names[g.group].startswith(("Arm_", "Elbow_", "Hand_", "Finger_"))]
            for gi, _ in arm_w:
                vg[names[gi]].remove([v.index])
    unweighted = [v.index for v in me.vertices if not any(g.weight > 1e-4 for g in v.groups)]
    if unweighted:
        # heat weighting misses some floating pieces (buttons, chain) — nearest weighted vertex
        from mathutils.kdtree import KDTree
        kd = KDTree(len(me.vertices))
        for v in me.vertices:
            if v.index not in set(unweighted):
                kd.insert(v.co, v.index)
        kd.balance()
        uw = set(unweighted)
        for i in unweighted:
            _, j, _ = kd.find(me.vertices[i].co)
            for g in me.vertices[j].groups:
                vg[names[g.group]].add([i], g.weight, "REPLACE")
        log("filled", len(unweighted), "unweighted vertices from neighbours")
    bpy.ops.object.vertex_group_normalize_all(lock_active=False) if False else None
    # hand the groups to the export rig
    body.parent = None
    for m in list(body.modifiers):
        body.modifiers.remove(m)
    body.parent = E
    body.matrix_parent_inverse = Matrix.Identity(4)
    mod = body.modifiers.new("Armature", "ARMATURE")
    mod.object = E
    bpy.data.objects.remove(W)


# ── 4. retarget ─────────────────────────────────────────────────────────────────────────────
def retarget(E, clip, theo_rest_rot, leg_ratio):
    src = import_theo(clip)
    sc = bpy.context.scene
    act = src.animation_data.action
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    srot = src.matrix_world.to_3x3().normalized()
    E.animation_data_clear()
    E.animation_data_create()
    order = [n for n in KEEP]  # parents precede children in KEEP
    rest = {b.name: b.matrix_local.copy() for b in E.data.bones}
    hip_rest_src = src.matrix_world @ src.data.bones["Hip_Jnt"].head_local
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        posed = {}
        for n in order:
            b = E.data.bones[n]
            pb = E.pose.bones[n]
            spb = src.pose.bones.get(n)
            p = b.parent.name if b.parent else None
            # where our joint sits given the parent's pose
            if p:
                head = posed[p] @ (rest[p].inverted() @ rest[n])
            else:
                head = rest[n].copy()
            if spb is not None:
                r = (srot @ spb.matrix.to_3x3()).normalized()
                if n == "Hip_Jnt":
                    sh = src.matrix_world @ spb.head
                    t = rest[n].to_translation() + (sh - hip_rest_src) * leg_ratio
                else:
                    t = head.to_translation()
                want = Matrix.Translation(t) @ r.to_4x4()
            else:
                want = head
            posed[n] = want
            parent_pose = posed[p] if p else Matrix.Identity(4)
            parent_rest = rest[p] if p else Matrix.Identity(4)
            basis = (parent_pose @ (parent_rest.inverted() @ rest[n])).inverted() @ want
            pb.rotation_mode = "QUATERNION"
            pb.location = basis.to_translation()
            pb.rotation_quaternion = basis.to_quaternion()
            pb.scale = (1, 1, 1)
            pb.keyframe_insert("rotation_quaternion", frame=f - f0)
            pb.keyframe_insert("location", frame=f - f0)
    a = E.animation_data.action
    a.name = clip.replace("Male_", "Schop_")
    bpy.data.objects.remove(src)
    log("retargeted", clip, "frames", f0, f1)
    return a, f1 - f0


def export_fbx(path, objs, anim):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.fbx(
        filepath=path, use_selection=True, object_types={"ARMATURE", "MESH"},
        apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL", axis_forward="-Z", axis_up="Y",
        add_leaf_bones=False, primary_bone_axis="Y", secondary_bone_axis="X",
        use_armature_deform_only=False, bake_anim=anim, bake_anim_use_all_actions=False,
        bake_anim_use_nla_strips=False, bake_anim_force_startend_keying=True,
        bake_anim_simplify_factor=0.0, path_mode="COPY", embed_textures=False, mesh_smooth_type="FACE")
    log("exported", path)


def main():
    clean()
    body = import_model()
    theo_arm = import_theo(SOURCE_RIG)
    theo = theo_rest(theo_arm)
    parents = {b.name: (b.parent.name if b.parent else None) for b in theo_arm.data.bones}
    for n in KEEP:
        p = parents.get(n)
        while p and p not in KEEP:
            p = parents.get(p)
        parents[n] = p
    bpy.data.objects.remove(theo_arm)
    pos = fit_joints(theo, parents)
    E, W, corr = build_armatures(theo, parents, pos)
    leg_ratio = (pos["Hip_Jnt"].z) / theo["Hip_Jnt"][0].z
    log("leg ratio", round(leg_ratio, 3))
    if STAGE == "fit":
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "schop_fit.blend"))
        return
    skin(body, E, W)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "schop_rigged.blend"))
    export_fbx(os.path.join(OUT, "Schopenhauer.fbx"), [E, body], anim=False)
    for clip in CLIPS:
        if not os.path.exists(os.path.join(ANIMDIR, clip + ".fbx")):
            log("missing clip", clip)
            continue
        act, n = retarget(E, clip, theo, leg_ratio)
        export_fbx(os.path.join(OUT, f"Schopenhauer@{act.name.replace('Schop_', '')}.fbx"), [E], anim=True)
        act.use_fake_user = True
    E.animation_data_clear()
    for pb in E.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "schop_rigged.blend"))


main()
