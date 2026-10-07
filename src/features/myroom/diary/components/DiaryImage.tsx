import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { devlog } from '../../../../shared/devlog';
import { photoSource } from '../diaryApi';

/**
 * One diary photo: the phone's copy when there is one, else the server's — which on the dev disk
 * store answers only with the account's headers, so the source is built asynchronously.
 *
 * A source that fails to load falls back to the blank plate and says why in the devlog: a tile that
 * renders nothing and logs nothing is how the 07-10 blank previews went unexplained.
 */
export const DiaryImage: React.FC<{ localUri?: string; url?: string; style: StyleProp<ImageStyle>; testID?: string }> = ({
  localUri, url, style, testID,
}) => {
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(
    localUri ? { uri: localUri } : null,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (localUri) setSource({ uri: localUri });
    else if (url) photoSource(url).then(s => { if (alive) setSource(s); });
    else setSource(null);
    return () => { alive = false; };
  }, [localUri, url]);
  if (!source || failed) return <View style={[style as object, styles.blank]} testID={testID} />;
  return (
    <Image
      source={source}
      style={style}
      resizeMode="cover"
      testID={testID}
      onError={e => {
        devlog(`[diary] image failed ${source.uri} ${e?.nativeEvent?.error ?? 'unknown'}`);
        setFailed(true);
      }}
    />
  );
};

const styles = StyleSheet.create({ blank: { backgroundColor: 'rgba(255,255,255,0.08)' } });
