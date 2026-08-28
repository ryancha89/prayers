import React, { useEffect, useRef } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import UnityView from '@azesmway/react-native-unity';
import { nativeUnityBridge } from '../bridge';

/**
 * Mounts the embedded Unity player and wires it to the NativeUnityBridge
 * singleton. Mount this exactly once (in the counseling room) — unmounting
 * tears the Unity engine down (see UnityView.componentWillUnmount upstream).
 */
export const UnityHost: React.FC<{ style?: ViewStyle }> = ({ style }) => {
  const viewRef = useRef<UnityView>(null);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    nativeUnityBridge.registerView(view);
    return () => {
      // Whatever unmounts this host (back, error boundary, nav reset), the
      // room's audio must not outlive it.
      try {
        view.postMessage('RNBridge', 'OnMessage', JSON.stringify({ type: 'SESSION_END' }));
      } catch {}
      nativeUnityBridge.unregisterView(view);
    };
  }, []);

  return (
    <UnityView
      ref={viewRef}
      style={[styles.unity, style]}
      androidKeepPlayerMounted={false}
      onUnityMessage={e => nativeUnityBridge.receiveFromUnity(e.nativeEvent.message)}
    />
  );
};

const styles = StyleSheet.create({
  unity: { flex: 1 },
});
