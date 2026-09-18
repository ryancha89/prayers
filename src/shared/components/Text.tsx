import React from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
} from 'react-native';

/**
 * The app's Text and TextInput: identical to React Native's, with one default the whole app needs.
 *
 * Nothing here ever set `maxFontSizeMultiplier`, so the OS "Larger Text" setting scaled every
 * label without limit while the boxes around them stayed put — a 52pt sign-in button, a 40pt send
 * button, a 76pt report label, a two-line suggestion pill. At the top accessibility sizes those
 * labels are clipped or spill out of their container, which is worse for the person who turned the
 * setting on than a slightly smaller letter would have been.
 *
 * 1.35 is a compromise, not a number that means anything on its own: it is roughly the point where
 * this layout still holds at every font size iOS and Android offer. Growing beyond it needs the
 * containers to grow too — that is a layout pass, not a prop.
 *
 * A caller may still override it (`maxFontSizeMultiplier={2}` on a screen that can take it) because
 * the spread comes after the default.
 *
 * ⚠️ React 19 dropped `defaultProps` on function components, and RN's Text is one — so the old
 * `Text.defaultProps.maxFontSizeMultiplier = …` trick is silently ignored. This wrapper is the
 * replacement, which is why screens import Text from here rather than from 'react-native'.
 */
export const MAX_FONT_SCALE = 1.35;

export const Text = React.forwardRef<RNText, TextProps>((props, ref) => (
  <RNText ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />
));
Text.displayName = 'Text';

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(
  (props, ref) => (
    <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />
  ),
);
TextInput.displayName = 'TextInput';
