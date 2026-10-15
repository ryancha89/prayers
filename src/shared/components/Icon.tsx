import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';

/**
 * Feather-style stroke icons on a 24×24 grid so every glyph shares one visual
 * language (weight, corner radius, tint). Replaces the emoji MVP set, which
 * ignored tint color and clashed with the line icons.
 */
export type IconName =
  | 'home'
  | 'archive'
  | 'chat'
  | 'compass'
  | 'person'
  | 'search'
  | 'bell'
  | 'heart'
  | 'heartFilled'
  | 'back'
  | 'arrowRight'
  | 'more'
  | 'send'
  | 'mic'
  | 'stop'
  | 'speaker'
  | 'plus'
  | 'sparkle'
  | 'play'
  | 'pause'
  | 'prev'
  | 'next'
  | 'back15'
  | 'fwd15'
  | 'lotus'
  | 'lock'
  | 'coin'
  | 'castle'
  | 'map'
  | 'quest'
  | 'menu'
  | 'run'
  | 'train'
  | 'bag'
  | 'close'
  | 'moon'
  | 'bolt'
  | 'shirt'
  | 'image'
  | 'wind'
  | 'armchair'
  | 'bed'
  | 'lamp'
  | 'book'
  | 'pen'
  | 'mail'
  | 'gift'
  | 'share';

type Draw = (color: string) => React.ReactNode;

const HEART_PATH =
  'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';

const ICONS: Record<IconName, Draw> = {
  // Three petals and a waterline, in the same 24×24 stroke language as the rest. Drawn rather than
  // borrowed: the tab it labels is the only place in this app where nobody is talking, and a
  // speech-adjacent glyph (a candle, a moon) would have read as another counselor.
  lotus: c => (
    <>
      <Path d="M12 4c2.2 2.1 3.2 4.2 3.2 6.4 0 2.1-1.1 3.9-3.2 5.3-2.1-1.4-3.2-3.2-3.2-5.3C8.8 8.2 9.8 6.1 12 4Z" stroke={c} />
      <Path d="M5.2 9.2c2.6.6 4.3 1.8 5.2 3.6.8 1.7.6 3.4-.6 5.2-2.3-.5-3.9-1.6-4.8-3.4-.9-1.7-.8-3.5.2-5.4Z" stroke={c} />
      <Path d="M18.8 9.2c1 1.9 1.1 3.7.2 5.4-.9 1.8-2.5 2.9-4.8 3.4-1.2-1.8-1.4-3.5-.6-5.2.9-1.8 2.6-3 5.2-3.6Z" stroke={c} />
      <Path d="M3.5 19.5c2.6.8 5.4 1.2 8.5 1.2s5.9-.4 8.5-1.2" stroke={c} />
    </>
  ),
  home: c => (
    <>
      <Path d="M3 9.5 12 3l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20Z" stroke={c} />
      <Polyline points="9 21.5 9 13 15 13 15 21.5" stroke={c} />
    </>
  ),
  chat: c => (
    <Path
      d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8Z"
      stroke={c}
    />
  ),
  compass: c => (
    <>
      <Circle cx="12" cy="12" r="9.5" stroke={c} />
      <Polygon points="16 8 14.2 14.2 8 16 9.8 9.8" stroke={c} />
    </>
  ),
  person: c => (
    <>
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke={c} />
      <Circle cx="12" cy="7.5" r="4" stroke={c} />
    </>
  ),
  search: c => (
    <>
      <Circle cx="11" cy="11" r="7.5" stroke={c} />
      <Line x1="21" y1="21" x2="16.3" y2="16.3" stroke={c} />
    </>
  ),
  bell: c => (
    <>
      <Path d="M18 8.5a6 6 0 0 0-12 0c0 7-3 8.5-3 8.5h18s-3-1.5-3-8.5" stroke={c} />
      <Path d="M13.73 20.5a2 2 0 0 1-3.46 0" stroke={c} />
    </>
  ),
  heart: c => <Path d={HEART_PATH} stroke={c} />,
  heartFilled: c => <Path d={HEART_PATH} stroke={c} fill={c} />,
  back: c => <Polyline points="15 5 8 12 15 19" stroke={c} />,
  arrowRight: c => (
    <>
      <Line x1="5" y1="12" x2="19" y2="12" stroke={c} />
      <Polyline points="13 6 19 12 13 18" stroke={c} />
    </>
  ),
  more: c => (
    <>
      <Circle cx="5" cy="12" r="1.4" stroke={c} fill={c} />
      <Circle cx="12" cy="12" r="1.4" stroke={c} fill={c} />
      <Circle cx="19" cy="12" r="1.4" stroke={c} fill={c} />
    </>
  ),
  send: c => (
    <>
      <Line x1="22" y1="2" x2="11" y2="13" stroke={c} />
      <Polygon points="22 2 15 22 11 13 2 9" stroke={c} />
    </>
  ),
  mic: c => (
    <>
      <Path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" stroke={c} />
      <Path d="M19 11v1a7 7 0 0 1-14 0v-1" stroke={c} />
      <Line x1="12" y1="19" x2="12" y2="22" stroke={c} />
    </>
  ),
  // A filled square: the one shape that means "stop" without a label, in every app the player
  // already uses. Used both to end a recording and to cut the counselor off mid-answer.
  stop: c => <Path d="M7 7h10v10H7z" stroke={c} fill={c} />,
  speaker: c => (
    <>
      <Polygon points="11 5 6.5 9 3 9 3 15 6.5 15 11 19" stroke={c} />
      <Path d="M15.5 8.5a5 5 0 0 1 0 7" stroke={c} />
      <Path d="M18.5 5.5a9.5 9.5 0 0 1 0 13" stroke={c} />
    </>
  ),
  plus: c => (
    <>
      <Line x1="12" y1="5" x2="12" y2="19" stroke={c} />
      <Line x1="5" y1="12" x2="19" y2="12" stroke={c} />
    </>
  ),
  sparkle: c => (
    <Path d="M12 3l2.1 5.6L20 11l-5.9 2.4L12 19l-2.1-5.6L4 11l5.9-2.4Z" stroke={c} />
  ),
  play: c => <Polygon points="7 4 20 12 7 20" stroke={c} fill={c} />,
  // The Journey player's transport (27-09).
  pause: c => (
    <>
      <Path d="M7 5h3v14H7z" stroke={c} fill={c} />
      <Path d="M14 5h3v14h-3z" stroke={c} fill={c} />
    </>
  ),
  prev: c => (
    <>
      <Polygon points="18 5 8 12 18 19" stroke={c} fill={c} />
      <Line x1="6" y1="5" x2="6" y2="19" stroke={c} />
    </>
  ),
  next: c => (
    <>
      <Polygon points="6 5 16 12 6 19" stroke={c} fill={c} />
      <Line x1="18" y1="5" x2="18" y2="19" stroke={c} />
    </>
  ),
  back15: c => (
    <>
      <Path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" stroke={c} />
      <Polyline points="4 3.5 6.7 6.7 3.5 8.6" stroke={c} />
      <SvgText x="12" y="15.2" fontSize="7.5" fontWeight="700" fill={c} stroke="none" textAnchor="middle">15</SvgText>
    </>
  ),
  fwd15: c => (
    <>
      <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" stroke={c} />
      <Polyline points="20 3.5 17.3 6.7 20.5 8.6" stroke={c} />
      <SvgText x="12" y="15.2" fontSize="7.5" fontWeight="700" fill={c} stroke="none" textAnchor="middle">15</SvgText>
    </>
  ),
  // The Journey's paid moment (01-10). Drawn, not 🔒/🪙: emoji came out as "?" boxes on the
  // simulator's font set (the mini player's 🚂 did), and 🪙 is newer still.
  lock: c => (
    <>
      <Path d="M6 11h12v9H6z" stroke={c} />
      <Path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" stroke={c} />
    </>
  ),
  coin: c => (
    <>
      <Circle cx="12" cy="12" r="8.5" stroke={c} />
      <Circle cx="12" cy="12" r="5" stroke={c} />
    </>
  ),
  // The 3D world (spec 004): the Home header's "3D" pill and the 월드 tab. Two towers and a keep with
  // a spire — the mockup's castle — in the same stroke as the rest rather than a filled emoji 🏰,
  // which ignores tint and came out as a "?" box on the simulator's font set.
  castle: c => (
    <>
      <Path d="M3 21V9.5l2-2 2 2V21" stroke={c} />
      <Path d="M17 21V9.5l2-2 2 2V21" stroke={c} />
      <Path d="M7 21v-8.5h10V21" stroke={c} />
      <Path d="M9.5 12.5V7.5L12 3l2.5 4.5v5" stroke={c} />
      <Path d="M10.5 21v-2.8a1.5 1.5 0 0 1 3 0V21" stroke={c} />
      <Line x1="2" y1="21" x2="22" y2="21" stroke={c} />
    </>
  ),
  map: c => (
    <>
      <Polygon points="2 6 2 21 8 18 16 21 22 18 22 3 16 6 8 3 2 6" stroke={c} />
      <Line x1="8" y1="3" x2="8" y2="18" stroke={c} />
      <Line x1="16" y1="6" x2="16" y2="21" stroke={c} />
    </>
  ),
  // A gem in a gem — the mockup's Quest button.
  quest: c => (
    <>
      <Polygon points="12 2.5 20 12 12 21.5 4 12" stroke={c} />
      <Polygon points="12 8 15 12 12 16 9 12" stroke={c} />
    </>
  ),
  menu: c => (
    <>
      <Line x1="4" y1="6" x2="20" y2="6" stroke={c} />
      <Line x1="4" y1="12" x2="20" y2="12" stroke={c} />
      <Line x1="4" y1="18" x2="20" y2="18" stroke={c} />
    </>
  ),
  run: c => (
    <>
      <Circle cx="15" cy="4.5" r="1.8" stroke={c} />
      <Path d="M13 8.5l-2.5 6 3.5 3V22" stroke={c} />
      <Path d="M10.5 14.5 8 18H4" stroke={c} />
      <Path d="M6.5 11l3.5-2.5h3l2.5 3.5H19" stroke={c} />
    </>
  ),
  train: c => (
    <>
      <Path d="M6 3h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke={c} />
      <Line x1="4" y1="10" x2="20" y2="10" stroke={c} />
      <Circle cx="8.5" cy="13.5" r="1" stroke={c} />
      <Circle cx="15.5" cy="13.5" r="1" stroke={c} />
      <Path d="M8 21l1.5-4M16 21l-1.5-4" stroke={c} />
    </>
  ),
  bag: c => (
    <>
      <Path d="M5 8h14l-1 13H6Z" stroke={c} />
      <Path d="M9 8V6.5a3 3 0 0 1 6 0V8" stroke={c} />
    </>
  ),
  close: c => (
    <>
      <Line x1="6" y1="6" x2="18" y2="18" stroke={c} />
      <Line x1="18" y1="6" x2="6" y2="18" stroke={c} />
    </>
  ),
  moon: c => <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" stroke={c} />,
  // My Room's furniture actions (07-10 mockup): sit, rest, the lamps, the bookshelf.
  armchair: c => (
    <>
      <Path d="M6 11V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" stroke={c} />
      <Path d="M4 11a2 2 0 0 1 2 2v1h12v-1a2 2 0 1 1 4 0v4H2v-4a2 2 0 0 1 2-2Z" stroke={c} />
      <Line x1="5" y1="17" x2="5" y2="20" stroke={c} />
      <Line x1="19" y1="17" x2="19" y2="20" stroke={c} />
    </>
  ),
  bed: c => (
    <>
      <Path d="M3 6v13M3 14h18v5M21 14v-2a3 3 0 0 0-3-3h-7v5" stroke={c} />
      <Circle cx="7" cy="11" r="1.8" stroke={c} />
    </>
  ),
  lamp: c => (
    <>
      <Path d="M8 3h8l3 8H5l3-8Z" stroke={c} />
      <Line x1="12" y1="11" x2="12" y2="19" stroke={c} />
      <Line x1="8" y1="21" x2="16" y2="21" stroke={c} />
    </>
  ),
  book: c => (
    <>
      <Path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2Z" stroke={c} />
      <Line x1="12" y1="6.5" x2="12" y2="19.5" stroke={c} />
    </>
  ),
  // The diary book's Write (spec 006).
  pen: c => (
    <>
      <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" stroke={c} />
      <Line x1="14" y1="6" x2="17" y2="9" stroke={c} />
    </>
  ),
  // My Room's top-right row and share button (07-10 mockup): bare line icons over the room.
  mail: c => (
    <>
      <Rect x="3" y="5.5" width="18" height="13" rx="1.8" stroke={c} />
      <Polyline points="3.5 6.5 12 13 20.5 6.5" stroke={c} />
    </>
  ),
  gift: c => (
    <>
      <Rect x="3.5" y="8.5" width="17" height="4" rx="1" stroke={c} />
      <Path d="M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5" stroke={c} />
      <Line x1="12" y1="8.5" x2="12" y2="21" stroke={c} />
      <Path d="M12 8.5C10.5 5 7 4.5 7 6.5S10 8.5 12 8.5Zm0 0c1.5-3.5 5-4 5-2S14 8.5 12 8.5Z" stroke={c} />
    </>
  ),
  // An arrow up out of a tray: the share sheet's own glyph on iOS.
  share: c => (
    <>
      <Path d="M8 9.5H6.5A1.5 1.5 0 0 0 5 11v8.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V11a1.5 1.5 0 0 0-1.5-1.5H16" stroke={c} />
      <Line x1="12" y1="3" x2="12" y2="14.5" stroke={c} />
      <Polyline points="8.5 6.5 12 3 15.5 6.5" stroke={c} />
    </>
  ),
  bolt: c => <Polygon points="13 2 4 14 11 14 10 22 20 9 13 9 13 2" stroke={c} />,
  shirt: c => (
    <Path d="M9 3 4 5.5 2.5 10l3 1V21h13V11l3-1L20 5.5 15 3c-.5 1.5-1.6 2.3-3 2.3S9.5 4.5 9 3Z" stroke={c} />
  ),
  image: c => (
    <>
      <Rect x="3.5" y="3.5" width="17" height="17" rx="2" stroke={c} />
      <Circle cx="9" cy="9" r="1.5" stroke={c} />
      <Polyline points="20.5 15 15 10 4 20.5" stroke={c} />
    </>
  ),
  // Breath: three gusts, for 호흡 명상.
  wind: c => (
    <>
      <Path d="M3 8h10a3 3 0 1 0-3-3" stroke={c} />
      <Path d="M3 12h15a3 3 0 1 1-3 3" stroke={c} />
      <Line x1="3" y1="16" x2="9" y2="16" stroke={c} />
    </>
  ),
  // A closed book with a bookmark — the 아카이브 tab.
  archive: c => (
    <>
      <Path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5V4.5Z" stroke={c} />
      <Path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" stroke={c} />
      <Path d="M14 3v7l-2-1.5L10 10V3" stroke={c} />
    </>
  ),
};

export const Icon: React.FC<{
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}> = ({ name, size = 22, color = '#FFFFFF', style }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}>
    {ICONS[name](color)}
  </Svg>
);
