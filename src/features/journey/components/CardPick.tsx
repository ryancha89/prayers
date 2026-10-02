import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { CARD_BACKS } from '../art';
import { playJourneySfx } from '../player/journeySfx';

/**
 * The career station's pick (mockup panels 6–7), animated (02-10: "thêm vfx với animation cho thẻ
 * hiện lên, lúc chọn thẻ xong cũng cần"):
 *  - DEAL: the three backs rise from below into a fan, one after another, then float gently with a
 *    pulsing gold halo and a few twinkles each, inviting a touch.
 *  - PICK: the chosen card lifts to the centre while the other two sink away, flips over (back →
 *    face) with a gold ring and a burst of sparks at the turn, and its face shows the station's card.
 *  - Then `footer` (Continue) fades in under it.
 * All on the native driver (transform/opacity only). The cabin plays its own effect with each beat
 * (journeyPlayer fires `sparkle` on the deal and `stars` on the pick).
 */
export const CardPick: React.FC<{
  picked: number | null;
  onPick(index: number): void;
  title: string;
  line?: string;
  small: boolean;
  footer: React.ReactNode;
}> = ({ picked, onPick, title, line, small, footer }) => {
  const W = small ? 72 : 86;
  const H = small ? 108 : 128;
  const GAP = small ? spacing.sm : spacing.md;

  // Per card: rise-in, float loop, and (picked) lift/flip; others: dismiss.
  const deal = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const float = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;   // 0 in the row → 1 at the centre, larger
  const away = useRef(new Animated.Value(0)).current;   // the two not chosen
  const flip = useRef(new Animated.Value(0)).current;   // 0 back → 1 face
  const burst = useRef(new Animated.Value(0)).current;  // the ring and the sparks at the turn
  const reveal = useRef(new Animated.Value(0)).current; // the footer
  const [faceUp, setFaceUp] = useState(false);
  const [chosen, setChosen] = useState<number | null>(picked);

  // Deal on mount; float + halo loop forever while face-down. Each card lands with its own swish.
  useEffect(() => {
    const swish = [0, 1, 2].map(i => setTimeout(() => playJourneySfx('cardDeal'), 60 + i * 140));
    Animated.stagger(140, deal.map(v => Animated.spring(v, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }))).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(halo, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(halo, { toValue: 0.25, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    pulse.start();
    return () => { loop.stop(); pulse.stop(); swish.forEach(clearTimeout); };
  }, [deal, float, halo]);

  // The pick: lift the chosen one, send the others away, flip at the top, burst, then the footer.
  useEffect(() => {
    if (picked == null || chosen != null && faceUp) return;
    setChosen(picked);
    playJourneySfx('cardFlip');
    Animated.sequence([
      Animated.parallel([
        Animated.timing(lift, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(away, { toValue: 1, duration: 360, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.timing(flip, { toValue: 0.5, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      setFaceUp(true);
      playJourneySfx('cardReveal');
      Animated.parallel([
        Animated.timing(flip, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(reveal, { toValue: 1, duration: 500, delay: 350, useNativeDriver: true }),
      ]).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  // Spark directions for the burst (fixed, so a re-render never reshuffles them).
  const sparks = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
    const d = 70 + (i % 3) * 22;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: i % 3 === 0 ? 6 : 4 };
  }), []);
  // A few twinkles around each face-down card.
  const twinkles = useMemo(() => [[-0.45, -0.4], [0.5, -0.2], [-0.35, 0.45], [0.42, 0.5]], []);

  const span = W + GAP;
  const rowX = (i: number) => (i - 1) * span;

  return (
    <View style={styles.wrap}>
      <View style={{ width: span * 3, height: H * 1.6, alignItems: 'center', justifyContent: 'center' }}>
        {[0, 1, 2].map(i => {
          const isChosen = chosen === i;
          const fan = (i - 1) * 8; // degrees
          const rise = deal[i].interpolate({ inputRange: [0, 1], outputRange: [120, 0] });
          const bob = float.interpolate({ inputRange: [0, 1], outputRange: i === 1 ? [-4, 4] : [3, -3] });
          const x = isChosen ? lift.interpolate({ inputRange: [0, 1], outputRange: [rowX(i), 0] }) : rowX(i);
          const y = isChosen ? Animated.add(rise, lift.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }))
            : chosen != null ? Animated.add(rise, away.interpolate({ inputRange: [0, 1], outputRange: [0, 90] })) : Animated.add(rise, bob);
          const scale = isChosen ? lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) : 1;
          const rot = isChosen ? lift.interpolate({ inputRange: [0, 1], outputRange: [`${fan}deg`, '0deg'] }) : `${fan}deg`;
          const opacity = chosen != null && !isChosen ? away.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : deal[i];
          const turn = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '0deg'] });
          return (
            <Animated.View key={i} pointerEvents={chosen != null ? 'none' : 'auto'}
              style={[styles.slot, { width: W, height: H, opacity, zIndex: isChosen ? 2 : 1,
                transform: [{ translateX: x }, { translateY: y }, { scale }, { rotate: rot },
                  { perspective: 800 }, { rotateY: isChosen ? turn : '0deg' }] }]}>
              {/* The gold halo behind a face-down card. */}
              {!isChosen || !faceUp ? (
                <Animated.View pointerEvents="none" style={[styles.halo, { width: W + 18, height: H + 18, opacity: halo }]} />
              ) : null}
              <Pressable style={[styles.card, { width: W, height: H }]} onPress={() => onPick(i)}
                accessibilityRole="button" accessibilityLabel={`${i + 1}`}>
                {isChosen && faceUp ? (
                  <View style={styles.face}>
                    <Text style={[styles.faceTitle, small && styles.faceTitleSmall]} numberOfLines={3}>{title}</Text>
                  </View>
                ) : (
                  <Image source={CARD_BACKS[i]} style={styles.art} resizeMode="cover" />
                )}
              </Pressable>
              {/* Twinkles around a waiting card. */}
              {chosen == null && twinkles.map(([tx, ty], k) => (
                <Animated.View key={k} pointerEvents="none" style={[styles.twinkle, {
                  left: W / 2 + tx * W - 2, top: H / 2 + ty * H - 2,
                  opacity: halo.interpolate({ inputRange: [0.25, 1], outputRange: k % 2 ? [1, 0.1] : [0.1, 1] }),
                }]} />
              ))}
            </Animated.View>
          );
        })}
        {/* The burst at the turn: a gold ring and sparks flying out from the chosen card. */}
        {faceUp && (
          <>
            <Animated.View pointerEvents="none" style={[styles.ring, {
              opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }),
              transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.4] }) }],
            }]} />
            {sparks.map((p, k) => (
              <Animated.View key={k} pointerEvents="none" style={[styles.spark, { width: p.s, height: p.s, borderRadius: p.s / 2,
                opacity: burst.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                transform: [
                  { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) },
                  { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.y] }) },
                ] }]} />
            ))}
          </>
        )}
      </View>
      {faceUp && line ? (
        <Animated.View style={{ opacity: reveal }}><Text style={styles.line}>{line}</Text></Animated.View>
      ) : null}
      {faceUp ? <Animated.View style={{ opacity: reveal }}>{footer}</Animated.View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md },
  slot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#2A1F5A', borderWidth: 1, borderColor: colors.gold },
  art: { width: '100%', height: '100%' },
  halo: {
    position: 'absolute', borderRadius: radius.md + 6, backgroundColor: 'rgba(233,196,106,0.18)',
    shadowColor: colors.gold, shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  twinkle: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFF3C4',
    shadowColor: colors.gold, shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  face: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.sm, backgroundColor: 'rgba(18,14,40,0.95)' },
  faceTitle: { ...typography.bodyStrong, color: colors.gold, textAlign: 'center' },
  faceTitleSmall: { fontSize: 12 },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: colors.gold },
  spark: { position: 'absolute', backgroundColor: '#FFE7A1',
    shadowColor: colors.gold, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  line: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: spacing.lg },
});
