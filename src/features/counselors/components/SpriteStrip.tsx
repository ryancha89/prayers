import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageSourcePropType, LayoutChangeEvent, StyleSheet, View } from 'react-native';

/**
 * Plays a sprite sheet: one image holding `frames` frames in a grid of `columns` across, read left
 * to right then top to bottom, shown one at a time by sliding it inside a clipped box.
 *
 * A GRID, NOT A TALL STRIP (11-04, "blur처리되어있는데 잘 보이게해"). The sheets were 600x9000 —
 * twenty frames stacked. Android's image pipeline (Fresco, DownsampleMode.AUTO) shrinks any bitmap
 * past 2048px on a side, so the strip was decoded at about 136px wide and stretched back to the
 * card: blocky on every Android phone, sharp on iOS. A 5x4 grid of 600x450 is 3000x1800 — inside
 * the 4096px texture limit every GPU has — and `resizeMethod="none"` stops Fresco shrinking it.
 *
 * Sliding rather than swapping N separate images: Metro would have to resolve twenty requires per
 * clip, and the first play would stutter while each frame decoded. One image decodes once.
 *
 * The frame height is derived from the MEASURED width, not from a prop — this box is full-bleed
 * inside a padded screen, so a hardcoded height would tear the frame on any phone whose width is
 * not the one it was written on.
 */
export const SpriteStrip: React.FC<{
  source: ImageSourcePropType;
  frames: number;
  /** Frame width / height. */
  aspect: number;
  /** Frames per row of the sheet. */
  columns?: number;
  fps: number;
  /** Pause when the strip is off-screen or its screen is not focused. */
  playing?: boolean;
  borderRadius?: number;
}> = ({ source, frames, aspect, columns = 1, fps, playing = true, borderRadius = 0 }) => {
  const [width, setWidth] = useState(0);
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!playing || width === 0) return;
    const id = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % frames;
      setFrame(frameRef.current);
    }, Math.max(16, Math.round(1000 / fps)));
    return () => clearInterval(id);
  }, [playing, width, frames, fps]);

  // Restart from frame 0 whenever the clip changes, so a gesture never begins mid-swing.
  useEffect(() => {
    frameRef.current = 0;
    setFrame(0);
  }, [source]);

  const frameH = width / aspect;
  const cols = Math.max(1, columns);
  const rows = Math.ceil(frames / cols);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={[styles.window, { height: frameH || undefined, borderRadius }]} onLayout={onLayout}>
      {width > 0 && (
        <Image
          source={source}
          style={{
            width: width * cols,
            height: frameH * rows,
            transform: [
              { translateX: -(frame % cols) * width },
              { translateY: -Math.floor(frame / cols) * frameH },
            ],
          }}
          // `stretch`, not `cover`: cover would re-fit the WHOLE sheet into the box and every frame
          // would be a sliver. The sheet is authored at exactly cols x rows frames of `aspect`, so
          // stretch is an identity scale.
          resizeMode="stretch"
          // Android: never let Fresco downsample the sheet (see the note at the top).
          resizeMethod="none"
          fadeDuration={0}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  window: { width: '100%', overflow: 'hidden' },
});
