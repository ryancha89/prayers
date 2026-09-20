# Meditation master — Blender working model

Design source: the two images supplied by the user on September 10, 2026,
stored under `reference/` and packed into the Blender file as viewport references.

## Files

- `meditation-master.blend`: editable seated character, materials, jewellery,
  display stage, lighting, camera, and six-second breathing animation.
- `meditation-master.glb`: character and seated rig export; excludes the stage,
  lights, camera and reference images.
- `previews/`: actual Blender renders, not AI-generated representations of a mesh.
- `validation.json`: measured head deformation and breathing loop closure.

Open the `.blend` in Blender and press Space to play frames 1–181 at 30 fps.
The camera view is configured for material preview. The reference collection is
excluded from rendering. The character and presentation stage are separate collections.

## Authorship and current scope

This is a first 3D adaptation of the reference, not an exact reconstruction of
the pictured face or a finished production asset. It uses the existing local
`saju_world_unity/Assets/Art/1.character/f_char_002` character's authored face,
hand topology, texture UVs, and closed-eye pose from `Female_IdleBlink.fbx`.
Original source assets are unchanged. Preserve the original character asset's
license/provenance when distributing derivatives.

The torso, garments, long hair, metallic flowers, crown, chains, pendants,
tassels, cushion and presentation stage were constructed in Blender by
`tools/blender/build_meditation_master.py`.

The rig is dedicated to a seated meditation pose: Root, Chest, Head and Hands.
It supports the included breathing loop; it is not a Unity Humanoid locomotion
rig. Walking, pose transitions, speech lip sync and production cloth simulation
are not implemented. Fine facial likeness, cloth tailoring and mobile mesh/draw
call optimization remain production work. It has not been installed into the app.

## Rebuild

Run from the prayers repository with Blender 5.1:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/blender/build_meditation_master.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/blender/finalize_meditation_master.py
```

Rebuilding requires the original local `f_char_002` assets at the path in the
build script. The saved Blender file packs its referenced textures and can be
opened independently. No Higgsfield or other paid generation API is used.
