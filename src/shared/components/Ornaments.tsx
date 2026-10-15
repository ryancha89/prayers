import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, Polygon, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../theme';

/**
 * The gold ornaments of the My Room HUD (07-10 mockup): the compass star on the profile badge and
 * the item prompt, the four-pointed star of the motto and the joystick's knob, the diamond marks.
 * Drawn, not bitmaps, so they stay sharp at any size and take the theme's gold.
 *
 * Unlike Icon (one stroke colour on a 24-grid), these are filled shapes with their own geometry, so
 * each takes a pixel size and draws on its own viewBox.
 */

/** A star polygon's points: `n` tips alternating between the given tip radii, `inner` between them.
 *  Angle 0 points up. Pure, shared by every star below. */
export function starPoints(cx: number, cy: number, tips: number[], inner: number, n: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? tips[(i / 2) % tips.length] : inner;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Four long points and four short ones in a thin ring: the compass rose of the badge. */
export const CompassStar: React.FC<{ size: number; color?: string; ring?: boolean; style?: StyleProp<ViewStyle> }> = ({
  size, color = colors.gold, ring = true, style,
}) => {
  const c = size / 2;
  const R = ring ? c * 0.78 : c * 0.98;
  return (
    <Svg width={size} height={size} style={style}>
      {ring && <Circle cx={c} cy={c} r={c - 1} fill="none" stroke={color} strokeWidth={1} />}
      {ring && <Circle cx={c} cy={c} r={c * 0.86} fill="none" stroke={color} strokeWidth={0.5} opacity={0.6} />}
      {/* The diagonals first, so the cardinal points read on top. */}
      <Polygon points={starPoints(c, c, [R * 0.55], R * 0.14, 4).split(' ').map(p => rot(p, c, Math.PI / 4)).join(' ')} fill={color} opacity={0.75} />
      <Polygon points={starPoints(c, c, [R], R * 0.16, 4)} fill={color} />
      <Circle cx={c} cy={c} r={Math.max(1, R * 0.08)} fill="#1A1330" />
    </Svg>
  );
};

/** Rotate "x,y" about (c, c) by `a` radians. */
function rot(p: string, c: number, a: number): string {
  const [x, y] = p.split(',').map(Number);
  const dx = x - c;
  const dy = y - c;
  return `${(c + dx * Math.cos(a) - dy * Math.sin(a)).toFixed(2)},${(c + dx * Math.sin(a) + dy * Math.cos(a)).toFixed(2)}`;
}

/** A four-pointed star, filled. */
export const FourPointStar: React.FC<{ size: number; color?: string; style?: StyleProp<ViewStyle> }> = ({
  size, color = colors.gold, style,
}) => {
  const c = size / 2;
  return (
    <Svg width={size} height={size} style={style}>
      <Polygon points={starPoints(c, c, [c], c * 0.22, 4)} fill={color} />
    </Svg>
  );
};

/** A small diamond mark: outlined, or filled. */
export const Diamond: React.FC<{ size: number; color?: string; filled?: boolean; style?: StyleProp<ViewStyle> }> = ({
  size, color = colors.gold, filled = false, style,
}) => {
  const c = size / 2;
  const r = c - 0.75;
  return (
    <Svg width={size} height={size} style={style}>
      <Polygon
        points={`${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}`}
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1}
      />
    </Svg>
  );
};

/** The motto's divider: a four-pointed star with long hairlines running out to both sides, fading
 *  at their ends. `width` is the whole span. */
export const StarRule: React.FC<{ width: number; star?: number; color?: string }> = ({ width, star = 18, color = colors.gold }) => {
  const h = star;
  const c = width / 2;
  const gap = star * 0.7;
  return (
    <Svg width={width} height={h}>
      <Line x1={0} y1={h / 2} x2={c - gap} y2={h / 2} stroke={color} strokeWidth={0.8} opacity={0.75} />
      <Line x1={c + gap} y1={h / 2} x2={width} y2={h / 2} stroke={color} strokeWidth={0.8} opacity={0.75} />
      <Polygon points={starPoints(c, h / 2, [h / 2], h * 0.1, 4)} fill={color} />
    </Svg>
  );
};

/** The joystick's knob face: cream to gold, glossy, a small star in the middle. */
export const GoldKnob: React.FC<{ size: number }> = ({ size }) => {
  const c = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="knob" cx="40%" cy="34%" r="70%">
          <Stop offset="0" stopColor="#FFF8E6" />
          <Stop offset="0.55" stopColor="#F2DDA4" />
          <Stop offset="1" stopColor="#C99A3E" />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c - 1} fill="url(#knob)" stroke="#B88A35" strokeWidth={1} />
      <Circle cx={c} cy={c} r={c * 0.62} fill="none" stroke="#B88A35" strokeWidth={0.6} opacity={0.6} />
      <Polygon points={starPoints(c, c, [c * 0.3], c * 0.07, 4)} fill="#A9782A" />
    </Svg>
  );
};
