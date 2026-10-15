import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, PixelRatio, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { CAT_ART } from './catArt.generated';
import { layersFor } from './pixelArt';

/**
 * One of Nabi's clips, looping in a crop of his room — the detail screen's action preview.
 *
 * Drawn live instead of from a pre-rendered strip for the same reason the room is: a bitmap of
 * pixel art gets linearly filtered when RN scales it, and the preview box is never the bitmap's
 * size. Here the art pixel is snapped to whole device pixels, so every edge stays hard.
 *
 * `view` is the crop in art pixels. The default is 4:3 like the other counselors' strips, the whole of him at his table.
 */
export const PixelCatClip: React.FC<{
  clip: string;
  view?: { x: number; y: number; w: number; h: number };
  playing?: boolean;
  borderRadius?: number;
}> = ({ clip, view = { x: 0, y: 30, w: 64, h: 48 }, playing = true, borderRadius = 0 }) => {
  const [width, setWidth] = useState(0);
  const anim = CAT_ART.anims[clip] ?? CAT_ART.anims.idle;
  const [frame, setFrame] = useState(0);
  const { room } = CAT_ART;

  useEffect(() => {
    setFrame(0);
    if (!playing) return;
    // One-shots loop here with a beat of rest at the end, so a wave reads as a wave and not a
    // twitch.
    const len = anim.frames.length + (anim.loop ? 0 : Math.round(anim.fps * 0.6));
    const id = setInterval(() => setFrame(f => (f + 1) % len), Math.round(1000 / anim.fps));
    return () => clearInterval(id);
  }, [anim, playing]);

  const bg = useMemo(() => layersFor(CAT_ART, CAT_ART.background, room.w), [room.w]);
  const cat = layersFor(CAT_ART, anim.frames[Math.min(frame, anim.frames.length - 1)], room.catSize);

  // Snap the art pixel to device pixels; the box is as tall as the crop at that scale.
  const ratio = PixelRatio.get();
  const px = width > 0 ? Math.ceil((width * ratio) / view.w) / ratio : 0;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={{ width: '100%', height: px ? Math.floor(view.h * px * ratio) / ratio : undefined, aspectRatio: px ? undefined : view.w / view.h, overflow: 'hidden', borderRadius }}
    >
      {px > 0 && (
        <Svg
          width={room.w * px}
          height={room.h * px}
          viewBox={`0 0 ${room.w} ${room.h}`}
          style={{ position: 'absolute', left: -view.x * px, top: -view.y * px }}
        >
          {bg.map(l => (
            <Path key={l.index} d={l.d} fill={l.color} />
          ))}
          <G x={room.catX} y={room.catY}>
            {cat.map(l => (
              <Path key={l.index} d={l.d} fill={l.color} />
            ))}
          </G>
        </Svg>
      )}
    </View>
  );
};
