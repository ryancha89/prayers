import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * The diary's five moods as drawn faces (07-10 mockup: soft round faces, the chosen one gold), not
 * emoji. The emoji drew as "?" boxes on the simulator, and they ignore the app's colours anyway.
 */
export const MoodFace: React.FC<{ mood: string; size?: number; color: string; fill?: string }> = ({ mood, size = 30, color, fill = 'none' }) => {
  const mouth: Record<string, string> = {
    great: 'M8 14.2c1.1 2.4 2.5 3.5 4 3.5s2.9-1.1 4-3.5Z',        // open grin
    good: 'M8.3 14.6c1 1.5 2.2 2.2 3.7 2.2s2.7-.7 3.7-2.2',         // smile
    okay: 'M8.6 15.4h6.8',                                           // flat
    down: 'M8.4 16.6c1-1.3 2.2-1.9 3.6-1.9s2.6.6 3.6 1.9',           // frown
    tired: 'M9.6 16h4.8',                                            // small flat, with sleepy eyes
  };
  const sleepy = mood === 'tired';
  const sad = mood === 'down';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth={1.4} fill={fill} />
      {sleepy ? (
        <>
          <Path d="M7.6 10.4h2.6" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
          <Path d="M13.8 10.4h2.6" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Circle cx="9" cy={sad ? 10.6 : 10} r="1.05" fill={color} />
          <Circle cx="15" cy={sad ? 10.6 : 10} r="1.05" fill={color} />
        </>
      )}
      <Path
        d={mouth[mood] ?? mouth.okay}
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={mood === 'great' ? color : 'none'}
        fillOpacity={mood === 'great' ? 0.25 : 0}
      />
    </Svg>
  );
};
