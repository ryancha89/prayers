import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Polyline } from 'react-native-svg';

/**
 * Feather-style stroke icons on a 24×24 grid so every glyph shares one visual
 * language (weight, corner radius, tint). Replaces the emoji MVP set, which
 * ignored tint color and clashed with the line icons.
 */
export type IconName =
  | 'home'
  | 'chat'
  | 'compass'
  | 'person'
  | 'search'
  | 'bell'
  | 'heart'
  | 'heartFilled'
  | 'back'
  | 'more'
  | 'send'
  | 'mic'
  | 'speaker'
  | 'plus'
  | 'sparkle'
  | 'play';

type Draw = (color: string) => React.ReactNode;

const HEART_PATH =
  'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';

const ICONS: Record<IconName, Draw> = {
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
