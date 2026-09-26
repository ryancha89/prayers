import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import type { CounselorEmotion } from '../types';
import { absoluteFill } from '../../../shared/theme';
import { CAT_ART } from './catArt.generated';
import { layersFor, PixelLayer } from './pixelArt';
import type { CatGesture } from './cues';

/**
 * Nabi's room: the pixel stage a pixel counselor is consulted in, where a 3D counselor has Unity.
 *
 * WHICH CLIP PLAYS. There are two layers and they never fight:
 *   1. a one-shot GESTURE (wave, nod, bow, …) when the flow cues one — it plays to its last frame
 *      and ends;
 *   2. underneath, a LOOP chosen from what the room is doing right now: thinking about a reading,
 *      talking, waiting for the player's question, or just sitting there, each in the face the
 *      engine says he is making.
 * A gesture that arrives while another is playing replaces it — the newest cue is the one that
 * matches what is being said.
 *
 * CRISP PIXELS. The room is drawn at a whole number of DEVICE pixels per art pixel, so every rect
 * edge lands on a pixel boundary. A fractional scale would anti-alias each edge into a faint seam
 * between neighbouring colours.
 */
export const PixelCatStage: React.FC<{
  /** The engine says a take is playing. In a room with no audio that is only ever an instant, so
   *  the mouth mostly runs off `utterance` instead. */
  speaking: boolean;
  /** What he is saying now — the line on the card, or the answer growing in the transcript. A
   *  change starts him talking for as long as the new words take to read. */
  utterance: string;
  /** Waiting on the reading — paw on chin. */
  thinking: boolean;
  /** The box is open for the player's question. */
  listening: boolean;
  emotion: CounselorEmotion;
  /** The latest one-shot; `seq` changes on every cue so the same gesture twice plays twice. */
  gesture: { name: CatGesture; seq: number } | null;
}> = ({ speaking, utterance, thinking, listening, emotion, gesture }) => {
  const { width, height } = useWindowDimensions();
  const { room } = CAT_ART;

  // Art pixel size in points, snapped to whole device pixels. Wide enough to fill the width;
  // anything left over at the sides is wall colour from the container.
  const ratio = PixelRatio.get();
  const px = Math.ceil((width * ratio) / room.w) / ratio;
  const roomW = room.w * px;
  const roomH = room.h * px;
  // A quarter of the spare height above the room, the rest below it: that keeps his face well
  // clear of the dialogue card at the bottom. The room's top rows are the same colour as the
  // container, so the gap above reads as more wall. A room taller than the screen is pinned to
  // the top instead.
  const top = Math.round(Math.max(0, (height - roomH) * 0.25) * ratio) / ratio;
  const left = Math.round(((width - roomW) / 2) * ratio) / ratio;

  const talking = useTalkTimer(utterance) || speaking;
  const loopName = pickLoop({ speaking: talking, thinking, listening, emotion });
  const [oneShot, setOneShot] = useState<CatGesture | null>(null);
  useEffect(() => {
    if (gesture) setOneShot(gesture.name);
  }, [gesture]);

  const clip = oneShot ?? loopName;
  const anim = CAT_ART.anims[clip] ?? CAT_ART.anims.idle;

  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  useEffect(() => {
    frameRef.current = 0;
    setFrame(0);
    const id = setInterval(() => {
      const next = frameRef.current + 1;
      if (next >= anim.frames.length) {
        if (!anim.loop) {
          // Hold the last frame for this tick, then drop back to the loop underneath.
          setOneShot(null);
          return;
        }
        frameRef.current = 0;
      } else {
        frameRef.current = next;
      }
      setFrame(frameRef.current);
    }, Math.round(1000 / anim.fps));
    return () => clearInterval(id);
    // `gesture.seq` restarts a gesture cued twice in a row.
  }, [anim, gesture?.seq]);

  // Stars, lantern and incense on their own slow clock, so the room breathes even while he is
  // still.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % CAT_ART.ambient.length), 450);
    return () => clearInterval(id);
  }, []);

  const background = useMemo(() => layersFor(CAT_ART, CAT_ART.background, room.w), [room.w]);
  const ambient = layersFor(CAT_ART, CAT_ART.ambient[tick], room.w);
  const cat = layersFor(CAT_ART, anim.frames[Math.min(frame, anim.frames.length - 1)], room.catSize);

  return (
    <View style={styles.fill} pointerEvents="none">
      {/* The floor carries on below the drawn room on tall phones. */}
      <View style={[styles.floor, { top: top + roomH - px }]} />
      <Svg
        width={roomW}
        height={roomH}
        viewBox={`0 0 ${room.w} ${room.h}`}
        style={{ position: 'absolute', left, top }}
      >
        <Layers layers={background} />
        <Layers layers={ambient} />
        <G x={room.catX} y={room.catY}>
          <Layers layers={cat} />
        </G>
      </Svg>
    </View>
  );
};

/**
 * True while the newest words would still be being said aloud.
 *
 * The pixel room has no voice track to say when a line ends, so the mouth follows the TEXT: every
 * time the utterance grows or changes, he talks for about as long as the new part takes to read,
 * floored so a two-word line still gets a visible mouth and capped so a long paragraph does not
 * leave him chattering after the reader has moved on. Measured against the NEW characters only —
 * a loop answer grows chunk by chunk, and re-timing the whole thing each time would keep him
 * talking long after the last chunk landed.
 */
export function talkMsFor(prev: string, next: string): number {
  const fresh = next.startsWith(prev) ? next.slice(prev.length) : next;
  const chars = fresh.trim().length;
  if (chars === 0) return 0;
  return Math.max(900, Math.min(6000, chars * 65));
}

function useTalkTimer(utterance: string): boolean {
  const [talking, setTalking] = useState(false);
  const prev = useRef('');
  useEffect(() => {
    const ms = talkMsFor(prev.current, utterance);
    prev.current = utterance;
    if (ms === 0) return;
    setTalking(true);
    const id = setTimeout(() => setTalking(false), ms);
    return () => clearTimeout(id);
  }, [utterance]);
  return talking;
}

const Layers: React.FC<{ layers: PixelLayer[] }> = ({ layers }) => (
  <>
    {layers.map(l => (
      <Path key={l.index} d={l.d} fill={l.color} />
    ))}
  </>
);

/** The loop for this moment. Exported for the tests: which face goes with which state is the
 *  part of this file most likely to be "tidied" wrong. */
export function pickLoop(s: {
  speaking: boolean;
  thinking: boolean;
  listening: boolean;
  emotion: CounselorEmotion;
}): string {
  // Thinking first: while the reading is in flight nothing he says is his answer yet.
  if (s.thinking) return 'think';
  if (s.speaking) {
    switch (s.emotion) {
      case 'happy':
        return 'talk_happy';
      case 'concerned':
        return 'talk_concerned';
      case 'surprised':
        return 'talk_surprised';
      case 'thinking':
        return 'talk_think';
      default:
        return 'talk';
    }
  }
  if (s.listening) return 'listen';
  switch (s.emotion) {
    case 'happy':
      return 'idle_happy';
    case 'concerned':
      return 'idle_concerned';
    case 'surprised':
      return 'idle_surprised';
    default:
      return 'idle';
  }
}

const styles = StyleSheet.create({
  fill: { ...absoluteFill, backgroundColor: '#211a39', overflow: 'hidden' },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#5c3a28' },
});
