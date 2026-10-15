import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { devlog } from '../../../../shared/devlog';
import { photoSource } from '../diaryApi';
import { currentLocalUri } from '../photos';

/**
 * One diary photo: the phone's copy when there is one, else the server's — which on the dev disk
 * store answers only with the account's headers, so the source is built asynchronously.
 *
 * A phone copy that fails to load (gone, or a container path from before an app update) falls
 * back to the server's copy when there is one.
 *
 * A source that fails to load falls back to the blank plate and says why in the devlog: a tile that
 * renders nothing and logs nothing is how the 07-10 blank previews went unexplained.
 */
export const DiaryImage: React.FC<{
  localUri?: string; url?: string; style: StyleProp<ImageStyle>; testID?: string;
  /** 'cover' for tiles; the full-screen viewer shows the whole photo. */
  resizeMode?: 'cover' | 'contain';
}> = ({
  localUri: storedUri, url, style, testID, resizeMode = 'cover',
}) => {
  const localUri = currentLocalUri(storedUri);
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(
    localUri ? { uri: localUri } : null,
  );
  const [failed, setFailed] = useState(false);
  const [localFailed, setLocalFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (localUri && !localFailed) setSource({ uri: localUri });
    else if (url) photoSource(url).then(s => { if (alive) setSource(s); });
    else setSource(null);
    return () => { alive = false; };
  }, [localUri, url, localFailed]);
  useEffect(() => setLocalFailed(false), [localUri]);
  if (!source || failed) return <View style={[style as object, styles.blank]} testID={testID} />;
  return (
    <Image
      source={source}
      style={style}
      resizeMode={resizeMode}
      testID={testID}
      onError={e => {
        devlog(`[diary] image failed ${source.uri} ${e?.nativeEvent?.error ?? 'unknown'}`);
        if (localUri && source.uri === localUri && url && !localFailed) setLocalFailed(true);
        else setFailed(true);
      }}
    />
  );
};

const styles = StyleSheet.create({ blank: { backgroundColor: 'rgba(255,255,255,0.08)' } });
