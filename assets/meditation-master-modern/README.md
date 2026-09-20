# Meditation Master (modern) — Blender working model

Design source: the character reference sheet supplied on September 10, 2026
(`reference/character-sheet.png`), packed into the Blender file as a viewport
reference. Crop top with lotus logo, dropped oversized jacket, high-waist
joggers, messy top bun with scrunchie, fine gold ring necklace, bare feet.

## Files

- `meditation-master-modern.blend`: editable standing character on the humanoid
  rig, materials, studio stage, lighting, camera and the idle+blink loop.
- `meditation-master-modern.glb`: character and rig export with the idle
  action; excludes the stage, lights, camera and reference image.
- `previews/`: actual Cycles renders (front, side, back, three-quarter, face,
  and the two validation frames), plus `turnaround-sheet.png`.
- `validation.json`: measured idle/blink deformation and loop closure.

Open the `.blend` and press Space to play the idle loop (see `validation.json`
for the frame range, 30 fps). The saved file starts in the reference A-pose.

## Construction

| Part | Source |
| --- | --- |
| Body, hands, bare feet, humanoid rig | project `f_char_001` base body (`girl_base_v03.fbx`) |
| Face, eyes, mouth, eyelashes, bun hairstyle, facial bones | project `f_char_002` (`Female_char02_Outfit01_Avatar.fbx`) |
| Idle body loop | `f_char_001` `girl_idle_blink_v03.fbx` (facial channels removed) |
| Blink | `f_char_002` `Female_IdleBlink.fbx` eyelid rotation channels, cycled |
| Crop top, straps, lotus logo, jacket, sleeves, cuffs, joggers, waistband, drawstring, scrunchie, necklace, stage | built by `tools/blender/build_meditation_master_modern.py` |

The `f_char_002` head is scaled onto the `f_char_001` neck, its facial bone
hierarchy replaces the `f_char_001` head subtree on the rig, and the neck is
bridged into one continuous mesh with both skin textures colour-matched at the
seam. Garments are fitted by projecting onto the body and take their skinning
weights from the nearest skin, so they follow the rig for idle-scale motion.
Original source assets are unchanged; preserve their license/provenance when
distributing derivatives. No Higgsfield or other paid generation API is used.

## Current scope and known limits

- First 3D adaptation of the sheet, not a production asset: garments are not
  cloth-simulated, sleeve puffs are skinned to the nearest skin (large arm
  motion will intersect), and no mobile draw-call/polygon optimisation was done.
- The rig is the `f_char_001` humanoid skeleton with `f_char_002` facial bones
  (Eye, Jaw, Lip, Cheek, Brow, Eyelid, Hair joints); Unity Humanoid mapping
  has not been validated in the app.
- Expressions from the sheet (smile, surprised, thinking, sad, speaking) and
  the pose references are not authored; only the idle loop and blink exist.
- The face and hair are the `f_char_002` originals, not a re-sculpt of the
  pictured face.

## Rebuild

Run from the prayers repository with Blender 5.1:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/blender/build_meditation_master_modern.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/blender/finalize_meditation_master_modern.py
```

`MM_PREVIEW=1` renders fast Workbench previews instead of Cycles;
`MM_SAMPLES=24` lowers the Cycles sample count. Rebuilding requires the local
`f_char_001` and `f_char_002` assets at the paths in the build script. The saved
`.blend` packs its textures and opens independently.
