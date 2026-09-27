import React from 'react';
import { Image, StyleSheet } from 'react-native';
import type { BackgroundMedia } from '../types';
import { Scenery } from './Scenery';

/**
 * What fills the train window: a drawn scene, an image, or a video.
 *
 * VIDEO is part of the contract now so the AI footage can be dropped into the journey data without
 * touching a screen. The app does not ship a video player yet, so a video shows its poster scene.
 * Linking one (`react-native-video`, then pod install) means rendering it in the `video` branch
 * below — only here. It is not `require`d speculatively: Metro fails the whole bundle on a module
 * that is not installed, try/catch or not.
 */
export const JourneyBackdrop: React.FC<{ media: BackgroundMedia; speed?: number }> = ({ media, speed = 1 }) => {
  if (media.type === 'scene') return <Scenery scene={media.scene} speed={speed} />;
  if (media.type === 'image') {
    return <Image source={media.source} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  }
  return <Scenery scene={media.poster ?? 'station'} speed={speed} />;
};
