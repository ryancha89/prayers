import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageSourcePropType, LayoutChangeEvent, StyleSheet, View } from 'react-native';

/**
 * Plays a vertical sprite strip: one image holding `frames` frames stacked top to bottom, shown one
 * at a time by sliding it inside a clipped box.
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
  fps: number;
  /** Pause when the strip is off-screen or its screen is not focused. */
  playing?: boolean;
  borderRadius?: number;
}> = ({ source, frames, aspect, fps, playing = true, borderRadius = 0 }) => {
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
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={[styles.window, { height: frameH || undefined, borderRadius }]} onLayout={onLayout}>
      {width > 0 && (
        <Image
          source={source}
          style={{
            width,
            height: frameH * frames,
            transform: [{ translateY: -frame * frameH }],
          }}
          // `stretch`, not `cover`: cover would re-fit the WHOLE strip (1:40) into the box and every
          // frame would be a sliver. The strip is authored at exactly frames x aspect, so stretch is
          // an identity scale.
          resizeMode="stretch"
          fadeDuration={0}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  window: { width: '100%', overflow: 'hidden' },
});
