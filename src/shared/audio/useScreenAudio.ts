import { useCallback, useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

/** Cut speech before the native closing animation finishes, even if the screen stays mounted. */
export function useScreenAudio(onLeave: () => void, onEnter?: () => void) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const active = useRef(navigation.isFocused?.() ?? true);
  const leave = useRef(onLeave);
  leave.current = onLeave;
  const enter = useRef(onEnter);
  enter.current = onEnter;
  const silence = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    leave.current();
  }, []);
  useEffect(() => {
    active.current = navigation.isFocused?.() ?? true;
    if (active.current) enter.current?.();
    const offFocus = navigation.addListener('focus', () => {
      active.current = true;
      enter.current?.();
    });
    const offBlur = navigation.addListener('blur', silence);
    const offRemove = navigation.addListener('beforeRemove', silence);
    const offTransition = navigation.addListener('transitionStart', e => {
      if (e.data.closing) silence();
    });
    // A cancelled back gesture leaves the screen paused, ready for an explicit Play.
    const offEnd = navigation.addListener('transitionEnd', () => {
      active.current = navigation.isFocused?.() ?? true;
      if (active.current) enter.current?.();
    });
    return () => {
      silence();
      offFocus(); offBlur(); offRemove(); offTransition(); offEnd();
    };
  }, [navigation, silence]);
  return { active, silence };
}
