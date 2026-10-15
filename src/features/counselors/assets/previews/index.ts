import { ImageSourcePropType } from 'react-native';

/**
 * Preview animations, as vertical sprite strips: PREVIEW_FRAMES frames of PREVIEW_ASPECT stacked
 * top to bottom in one image.
 *
 * WHY A SPRITE STRIP AND NOT A VIDEO
 * The app ships no video player (`react-native-video` is not a dependency) and animated GIF/WebP
 * needs extra Fresco modules on Android, so a real clip would mean a native dependency for five
 * seconds of motion. A strip plays with `<Image>` and a translateY — no dependency, identical
 * behaviour on both platforms.
 *
 * WHAT THESE ACTUALLY ARE
 * Real frames of the real 3D models, rendered out of the Unity project from the counselor's own
 * animation clips (Female_Gentle, Boy_Base2_Prayers_Welcome, …) — not drawn, not a mock. So only
 * the two counselors that HAVE a model appear here. The other four have no model to render, and a
 * fabricated preview of a character that does not exist is the exact promise the card art was just
 * fixed for making. They get an explicit "no preview yet" state instead.
 *
 * Regenerate with the Unity snippet in the `card-art-must-match-model` note, then
 * `Tools/gen_counselor_preview_strips.py`. Traps, all of which were hit:
 *  - the stage must live in its own additive scene on a dedicated layer, or the camera films
 *    whatever scene happens to be open (the first jiho strip came out showing the female counselor
 *    from ConsultationSolo);
 *  - every SkinnedMeshRenderer needs `forceMatrixRecalculationPerRender = true`, or the GPU keeps
 *    the previous sample's skinning and all twenty frames are byte-identical while the bones really
 *    are moving;
 *  - Unity renders at 2x and Python downsamples, because the RenderTexture pass on its own leaves
 *    hard stair-steps on every silhouette edge.
 *
 * One strip is one bitmap: 600 x 450 x 20 x 4 bytes is ~21MB decoded while it is on screen. That is
 * the ceiling on frame size, and it is about RAM, not the JPEG on disk.
 */
export const PREVIEW_FRAMES = 20;
/**
 * Width / height of ONE frame. The strips are 600x450.
 *
 * It was 2:1 first, and that was the whole reason the previews looked wrong: a standing figure in a
 * letterbox is a small subject adrift in a wide dark field. 4:3 framed on the bust fills it.
 */
export const PREVIEW_ASPECT = 4 / 3;
/** The clips are 2s; 20 frames at 10fps plays them back at their authored speed. */
export const PREVIEW_FPS = 10;

export const PREVIEW_STRIPS: Record<string, Record<string, ImageSourcePropType>> = {
  yuna: {
    hello: require('./yuna_hello.jpg'),
    smile: require('./yuna_smile.jpg'),
    thinking: require('./yuna_thinking.jpg'),
    explaining: require('./yuna_explaining.jpg'),
    nod: require('./yuna_nod.jpg'),
  },
  jiho: {
    hello: require('./jiho_hello.jpg'),
    smile: require('./jiho_smile.jpg'),
    thinking: require('./jiho_thinking.jpg'),
    explaining: require('./jiho_explaining.jpg'),
    bless: require('./jiho_bless.jpg'),
  },
  // Two actions, because f_char_003 has two gesture clips since the 2026-09-14 delivery — and both
  // are filmed in HER room (ConsultationSolo02), not in the other counselors'. The strip is only
  // ever as honest as the clip list behind it; add rows here as clips arrive, not before.
  yunjung: {
    smile: require('./yunjung_smile.jpg'),
    explaining: require('./yunjung_explaining.jpg'),
    // The third was already on disk: `Female_SitSoftLaugh` is her largest gesture — 115 moving
    // bones against the talking clip's 86 — and it had simply never been given a row. Nothing new
    // was delivered for her on 18-09; the preview had been under-selling what she can already do.
    laugh: require('./yunjung_laugh.jpg'),
  },
  // FOUR since the 18-09 delivery, and every one of them is a clip he really has. He arrived on
  // 16-09 with an idle and a talking loop and nothing else — his card carried four actions while he
  // was unbuildable, as an order list for the animator, and the moment he became playable that list
  // stopped being a request and became a promise, three quarters of it false. It was cut to one.
  //
  // ⚠️ AND THAT ONE WAS FILMING A STATIC POSE. `theo_explaining` pointed at `Male_TalkLoop`, which
  // has zero moving bones: twenty identical frames, assembled and shipped without a single warning,
  // because every step of the pipeline succeeded. It plays `Male_Talking` now. The lesson is in the
  // renderer's own comment — the preview must play what the CONTROLLER plays.
  theo: {
    smile: require('./theo_smile.jpg'),
    thinking: require('./theo_thinking.jpg'),
    explaining: require('./theo_explaining.jpg'),
    surprised: require('./theo_surprised.jpg'),
  },

};
