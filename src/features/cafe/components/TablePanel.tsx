import React, { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../shared/components/Text';
import { Icon, type IconName } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { useScreen } from '../../../shared/device/screen';
import { IVORY, RING_COMPACT, SERIF } from '../../../shared/components/hud/Hud';
import type { TarotConsultant } from '../api/cafeApi';
import { readerPortrait } from '../table/portrait';
import {
  CAFE_PRICE,
  SPREAD_SIZE,
  STEP_ADVICE,
  STEP_OVERALL,
  inTarot,
  type CafeTable,
  type TableError,
  type TableStage,
} from '../table/useCafeTable';

/** Stages that only say where things are, in a strip: the table (and the cards on it) stay free to
 *  touch. While picking and while the cookie waits, every touch outside the End button reaches Unity. */
const STRIP_STAGES = new Set<TableStage>(['arriving', 'spreading', 'picking', 'serving', 'cookie']);
export const isStripStage = (stage: TableStage) => STRIP_STAGES.has(stage);

const ERROR_COPY: Record<TableError, TranslationKey> = {
  unavailable: 'cafe.pay.err.unavailable',
  failed: 'cafe.pay.err.failed',
  invalidCards: 'cafe.pay.err.invalidCards',
  insufficient: 'cafe.pay.err.insufficient',
  notFound: 'cafe.pay.err.notFound',
};

/**
 * The table's half of the cafe UI (spec 007), from CAFE_SEATED until the player stands: the menu,
 * the reader list, the conversation with the reader, the reading card by card, and the coffee's
 * waiting lines. The paid confirmation and the fortune card are overlays CafeScreen draws over it.
 *
 * Bottom panel upright, right-hand column sideways — the guest conversation's dock, so the cafe's
 * VIEW_INSETS mean the same thing whichever panel is up.
 */
export const TablePanel: React.FC<{
  table: CafeTable;
  safe: { top: number; right: number; bottom: number; left: number };
  onLayout: (e: LayoutChangeEvent) => void;
}> = ({ table, safe, onLayout }) => {
  const t = useT();
  const screen = useScreen();
  const landscape = screen.landscape;
  const s = table.state;
  const bottomPad = safe.bottom + spacing.sm;

  if (!s.seated || s.stage === 'fortune') return null;

  if (isStripStage(s.stage)) {
    return (
      <View pointerEvents="box-none" onLayout={onLayout}
        style={[styles.stripDock, { bottom: bottomPad, left: safe.left + spacing.md, right: safe.right + spacing.md }]}>
        <View pointerEvents="box-none" style={styles.strip} testID="cafe-strip">
          <View pointerEvents="none" style={styles.grow}>
            <StripText table={table} />
          </View>
          {inTarot(s) && <EndButton onPress={table.end} />}
        </View>
      </View>
    );
  }

  const panelH = screen.vh(0.46, 260, 420);
  // Sideways the column starts under the cafe's top row (back · title · coins), not at the top edge:
  // from 0 it sat over the coin pill (19-10).
  const sideTop = safe.top + spacing.sm + RING_COMPACT + spacing.sm;
  return (
    // Measured on the dock, not the panel: the dock is a child of the cafe's stage, so its frame is in
    // the UnityView's coordinates; the panel's own onLayout would be relative to the dock (y = 0).
    <View pointerEvents="box-none" onLayout={onLayout}
      style={landscape ? [styles.sideDock, { top: sideTop, width: screen.sidePanel }] : styles.bottomDock}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none" style={landscape ? styles.grow : undefined}>
      <View
        testID="cafe-table"
        style={[
          styles.panel,
          landscape
            ? [styles.panelSide, { paddingTop: spacing.md, paddingRight: safe.right + spacing.md, paddingBottom: bottomPad }]
            : { height: panelH + safe.bottom, paddingBottom: bottomPad, paddingLeft: safe.left + spacing.md, paddingRight: safe.right + spacing.md },
        ]}>
        {s.consultant && inTarot(s) && <ReaderHead reader={s.consultant} onEnd={table.end} />}
        <Body table={table} t={t} />
      </View>
    </KeyboardAvoidingView>
    </View>
  );
};

type Translate = ReturnType<typeof useT>;

const StripText: React.FC<{ table: CafeTable }> = ({ table }) => {
  const t = useT();
  const s = table.state;
  switch (s.stage) {
    case 'arriving':
      return <Text style={styles.stripLine}>{t('cafe.tarot.arriving', { name: s.consultant?.name ?? '' })}</Text>;
    case 'spreading':
      return <Text style={styles.stripLine}>{t('cafe.tarot.spreading')}</Text>;
    case 'picking':
      return (
        <View style={styles.pickRow}>
          <Text style={[styles.stripLine, styles.grow]} numberOfLines={3}>{s.line}</Text>
          <Text style={styles.counter} testID="cafe-pick-count">{t('cafe.tarot.count', { count: s.picked })}</Text>
        </View>
      );
    case 'serving':
      return <Text style={styles.stripLine}>{t('cafe.coffee.serving')}</Text>;
    case 'cookie':
      return (
        <View style={styles.pickRow}>
          <Icon name="gift" size={18} color={colors.gold} />
          <Text style={[styles.stripLine, styles.grow]} testID="cafe-cookie-prompt">{t('cafe.coffee.tapCookie')}</Text>
        </View>
      );
    default:
      return null;
  }
};

const Body: React.FC<{ table: CafeTable; t: Translate }> = ({ table, t }) => {
  const s = table.state;
  switch (s.stage) {
    case 'menu':
      return <Menu table={table} t={t} />;
    case 'consultants':
      return <Readers table={table} t={t} />;
    case 'asking':
      return (
        <>
          <Lines>
            <Said who={s.consultant?.name ?? ''} text={s.line} />
          </Lines>
          <Composer
            key="question"
            initial={s.question}
            placeholder={t('cafe.tarot.questionPlaceholder')}
            label={t('cafe.tarot.ask')}
            onSend={table.submitQuestion}
            testID="cafe-question"
          />
        </>
      );
    case 'reading':
      return (
        <Lines>
          {s.error ? <ErrorRow table={table} error={s.error} t={t} /> : <Text style={styles.waiting}>{t('cafe.tarot.reading')}</Text>}
        </Lines>
      );
    case 'presenting':
      return <Presenting table={table} t={t} />;
    case 'followup':
      return (
        <>
          <Lines follow>
            <Said who={s.consultant?.name ?? ''} text={s.line} />
            {s.followups.map((f, i) => (
              <View key={i} style={styles.exchange}>
                <Text style={styles.you}>{`${t('cafe.you')} · ${f.q}`}</Text>
                <Text style={styles.reply} testID={`cafe-answer-${i}`}>{f.a}</Text>
              </View>
            ))}
            {s.pending && !s.confirm ? (
              <View style={styles.exchange}>
                <Text style={styles.you}>{`${t('cafe.you')} · ${s.pending}`}</Text>
                {s.error ? <ErrorRow table={table} error={s.error} t={t} /> : <Text style={styles.waiting}>{t('cafe.thinking')}</Text>}
              </View>
            ) : null}
          </Lines>
          <Composer
            key="followup"
            initial=""
            placeholder={t('cafe.tarot.followupPlaceholder')}
            label={t('cafe.send')}
            disabled={s.busy || !!s.pending}
            onSend={table.submitFollowup}
            testID="cafe-followup"
            price={CAFE_PRICE.followup}
          />
        </>
      );
    case 'brewing':
      return (
        <Lines>
          {s.error ? (
            <>
              <ErrorRow table={table} error={s.error} t={t} />
              <Pressable onPress={() => { sfx.back(); table.cancelCoffee(); }} accessibilityRole="button" accessibilityLabel={t('cafe.back')}
                style={({ pressed }) => [styles.ghost, styles.selfStart, pressed && styles.pressed]}>
                <Text style={styles.ghostText}>{t('cafe.back')}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.waiting}>{t('cafe.coffee.brewing')}</Text>
          )}
        </Lines>
      );
    default:
      return null;
  }
};

/** Seated, nothing ordered yet — or the reader just said goodbye, which is the line above the menu. */
const Menu: React.FC<{ table: CafeTable; t: Translate }> = ({ table, t }) => {
  const s = table.state;
  return (
    <ScrollView style={styles.lines} contentContainerStyle={styles.linesBody} testID="cafe-menu">
      {s.line ? <Text style={styles.reply} testID="cafe-farewell">{s.line}</Text> : null}
      <Text style={styles.heading}>{t('cafe.table.prompt')}</Text>
      <MenuRow icon="coffee" label={t('cafe.table.coffee')} tag={t('cafe.price', { price: CAFE_PRICE.coffee })} onPress={table.orderCoffee} testID="cafe-order-coffee" />
      <MenuRow icon="sparkle" label={t('cafe.table.tarot')} tag={t('cafe.price', { price: CAFE_PRICE.reading })} onPress={table.openTarot} testID="cafe-order-tarot" />
      <Pressable onPress={() => { sfx.back(); table.leaveTable(); }} accessibilityRole="button" accessibilityLabel={t('cafe.table.leave')}
        style={({ pressed }) => [styles.ghost, styles.selfStart, pressed && styles.pressed]} testID="cafe-leave-table">
        <Text style={styles.ghostText}>{t('cafe.table.leave')}</Text>
      </Pressable>
    </ScrollView>
  );
};

const MenuRow: React.FC<{ icon: IconName; label: string; tag: string; onPress: () => void; testID: string }> = ({ icon, label, tag, onPress, testID }) => (
  <Pressable testID={testID} onPress={() => { sfx.select(); onPress(); }} accessibilityRole="button" accessibilityLabel={label}
    style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
    <Icon name={icon} size={22} color={colors.gold} />
    <Text style={[styles.menuLabel, styles.grow]} numberOfLines={2}>{label}</Text>
    <View style={styles.tag}><Text style={styles.tagText} numberOfLines={1}>{tag}</Text></View>
  </Pressable>
);

const Readers: React.FC<{ table: CafeTable; t: Translate }> = ({ table, t }) => {
  const s = table.state;
  return (
    <>
      <View style={styles.headRow}>
        <Pressable onPress={() => { sfx.back(); table.backToMenu(); }} accessibilityRole="button" accessibilityLabel={t('cafe.back')} hitSlop={8}>
          <Icon name="back" size={20} color={IVORY} />
        </Pressable>
        <Text style={[styles.heading, styles.grow]} numberOfLines={1}>{t('cafe.tarot.pick')}</Text>
      </View>
      <ScrollView style={styles.lines} contentContainerStyle={styles.linesBody} testID="cafe-readers">
        {s.consultantsFailed ? (
          <>
            <Text style={styles.waiting}>{t('cafe.tarot.loadFailed')}</Text>
            <Pressable onPress={() => { sfx.tap(); table.loadConsultants(); }} accessibilityRole="button" accessibilityLabel={t('cafe.retry')}
              style={({ pressed }) => [styles.ghost, styles.selfStart, pressed && styles.pressed]}>
              <Text style={styles.ghostText}>{t('cafe.retry')}</Text>
            </Pressable>
          </>
        ) : s.consultants == null ? (
          <Text style={styles.waiting}>{t('cafe.tarot.loading')}</Text>
        ) : s.consultants.length === 0 ? (
          <Text style={styles.waiting}>{t('cafe.tarot.none')}</Text>
        ) : (
          s.consultants.map(c => (
            <Pressable key={c.id} testID={`cafe-reader-${c.id}`} onPress={() => { sfx.select(); table.chooseConsultant(c); }}
              accessibilityRole="button" accessibilityLabel={c.name} style={({ pressed }) => [styles.readerRow, pressed && styles.pressed]}>
              <Portrait reader={c} size={52} />
              <View style={styles.grow}>
                <Text style={styles.readerName} numberOfLines={1}>{c.name}</Text>
                {c.title ? <Text style={styles.readerTitle} numberOfLines={2}>{c.title}</Text> : null}
              </View>
              <Icon name="chevronRight" size={18} color={colors.textSecondary} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </>
  );
};

const Portrait: React.FC<{ reader: TarotConsultant; size: number }> = ({ reader, size }) => {
  const p = readerPortrait(reader.portraitKey);
  const box = { width: size, height: size, borderRadius: size / 2, backgroundColor: p.accent };
  return (
    <View style={[styles.portrait, box]}>
      {p.image ? (
        <Image source={p.image} style={styles.portraitImg} resizeMode="cover" />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{reader.name.charAt(0)}</Text>
      )}
    </View>
  );
};

const ReaderHead: React.FC<{ reader: TarotConsultant; onEnd: () => void }> = ({ reader, onEnd }) => (
  <View style={styles.headRow}>
    <Portrait reader={reader} size={36} />
    <View style={styles.grow}>
      <Text style={styles.guest} numberOfLines={1}>{reader.name}</Text>
      {reader.title ? <Text style={styles.readerTitle} numberOfLines={1}>{reader.title}</Text> : null}
    </View>
    <EndButton onPress={onEnd} />
  </View>
);

const EndButton: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const t = useT();
  return (
    <Pressable testID="cafe-tarot-end" onPress={() => { sfx.tap(); onPress(); }} accessibilityRole="button" accessibilityLabel={t('cafe.tarot.end')}
      hitSlop={6} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
      <Text style={styles.ghostText}>{t('cafe.tarot.end')}</Text>
    </Pressable>
  );
};

/** The reading, one step at a time: each card (its slot lit in the room), the whole, the advice. */
const Presenting: React.FC<{ table: CafeTable; t: Translate }> = ({ table, t }) => {
  const s = table.state;
  const r = s.reading;
  if (!r || s.step < 0) {
    return <Lines><Text style={styles.waiting}>{t('cafe.tarot.flipping')}</Text></Lines>;
  }
  let head: string;
  let title: string;
  let body: string;
  if (s.step < SPREAD_SIZE) {
    const c = r.cards[s.step];
    head = [t('cafe.tarot.cardOf', { n: s.step + 1 }), c.position].filter(Boolean).join(' · ');
    title = `${c.name} · ${t(c.orientation === 'reversed' ? 'cafe.tarot.reversed' : 'cafe.tarot.upright')}`;
    body = c.meaning;
  } else if (s.step === STEP_OVERALL) {
    head = '';
    title = t('cafe.tarot.overall');
    body = r.overall;
  } else {
    head = '';
    title = t('cafe.tarot.advice');
    body = r.advice;
  }
  return (
    <>
      <ScrollView style={styles.lines} contentContainerStyle={styles.linesBody} testID="cafe-reading">
        {head ? <Text style={styles.cardHead}>{head}</Text> : null}
        <Text style={styles.cardTitle} testID="cafe-reading-title">{title}</Text>
        <Text style={styles.reply} testID="cafe-reading-body">{body}</Text>
      </ScrollView>
      <View style={styles.footRow}>
        <Dots step={s.step} />
        <Pressable testID="cafe-reading-next" onPress={() => { sfx.tap(); table.next(); }} accessibilityRole="button" accessibilityLabel={t('cafe.tarot.next')}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          <Text style={styles.ctaText}>{t('cafe.tarot.next')}</Text>
          <Icon name="arrowRight" size={14} color={INK} />
        </Pressable>
      </View>
    </>
  );
};

const Dots: React.FC<{ step: number }> = ({ step }) => (
  <View style={[styles.dots, styles.grow]}>
    {Array.from({ length: STEP_ADVICE + 1 }, (_, i) => (
      <View key={i} style={[styles.dot, i === step && styles.dotOn, i >= SPREAD_SIZE && styles.dotWide]} />
    ))}
  </View>
);

/** The panel's text. `follow`: keep the newest line in view as it grows (the follow-up exchange,
 *  whose newest answer otherwise lands under the composer, cut off). */
const Lines: React.FC<{ children: React.ReactNode; follow?: boolean }> = ({ children, follow }) => {
  const ref = React.useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={ref}
      style={styles.lines}
      contentContainerStyle={styles.linesBody}
      onContentSizeChange={follow ? () => ref.current?.scrollToEnd({ animated: true }) : undefined}>
      {children}
    </ScrollView>
  );
};

const Said: React.FC<{ who: string; text: string }> = ({ who, text }) =>
  text ? (
    <View style={styles.exchange}>
      {who ? <Text style={styles.you}>{who}</Text> : null}
      <Text style={styles.reply} testID="cafe-reader-line">{text}</Text>
    </View>
  ) : null;

const ErrorRow: React.FC<{ table: CafeTable; error: TableError; t: Translate }> = ({ table, error, t }) => (
  <View style={styles.errorBox} testID="cafe-table-error">
    <Text style={styles.errorText}>{t(ERROR_COPY[error])}</Text>
    <View style={styles.errorButtons}>
      {error === 'insufficient' && (
        <Pressable onPress={() => { sfx.tap(); table.getCoins(); }} accessibilityRole="button" accessibilityLabel={t('cafe.pay.getCoins')}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          <Text style={styles.ctaText}>{t('cafe.pay.getCoins')}</Text>
        </Pressable>
      )}
      {error !== 'invalidCards' && error !== 'notFound' && (
        <Pressable testID="cafe-table-retry" onPress={() => { sfx.tap(); table.retry(); }} accessibilityRole="button" accessibilityLabel={t('cafe.retry')}
          style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
          <Text style={styles.ghostText}>{t('cafe.retry')}</Text>
        </Pressable>
      )}
    </View>
  </View>
);

/** A text box and its send button. `initial` re-seeds it when it mounts (a cancelled question comes
 *  back in the box rather than vanishing). */
const Composer: React.FC<{
  initial: string;
  placeholder: string;
  label: string;
  onSend: (text: string) => void;
  testID: string;
  disabled?: boolean;
  price?: number;
}> = ({ initial, placeholder, label, onSend, testID, disabled, price }) => {
  const t = useT();
  const screen = useScreen();
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);
  const off = disabled || !draft.trim();
  const send = () => {
    if (off) return;
    sfx.send();
    onSend(draft);
    setDraft('');
  };
  return (
    <View style={styles.inputRow}>
      <TextInput
        testID={`${testID}-input`}
        style={[styles.input, { maxHeight: screen.vh(0.12, 64, 110) }]}
        value={draft}
        onChangeText={setDraft}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={500}
      />
      <Pressable testID={`${testID}-send`} onPress={send} disabled={off} accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={{ disabled: off }} style={({ pressed }) => [styles.send, off && styles.muted, pressed && styles.pressed]}>
        <Icon name="send" size={18} color={INK} />
        {price != null && <Text style={styles.sendPrice}>{t('cafe.price', { price })}</Text>}
      </Pressable>
    </View>
  );
};

const INK = '#1A1330';

const styles = StyleSheet.create({
  grow: { flex: 1 },
  selfStart: { alignSelf: 'flex-start' },
  bottomDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sideDock: { position: 'absolute', right: 0, bottom: 0 },
  panel: {
    backgroundColor: 'rgba(14,12,40,0.92)', borderColor: 'rgba(233,196,106,0.35)', borderTopWidth: 1,
    paddingTop: spacing.md, paddingHorizontal: spacing.md, gap: spacing.sm,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
  panelSide: { flex: 1, borderLeftWidth: 1, borderTopRightRadius: 0 },
  stripDock: { position: 'absolute', alignItems: 'center' },
  strip: {
    width: '100%', maxWidth: 420, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg,
    backgroundColor: 'rgba(18,14,40,0.82)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  stripLine: { ...typography.body, color: colors.textPrimary },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  counter: { fontFamily: SERIF, fontSize: 20, color: colors.gold },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heading: { fontFamily: SERIF, fontSize: 17, color: IVORY },
  guest: { fontFamily: SERIF, fontSize: 17, color: IVORY },
  lines: { flex: 1 },
  linesBody: { gap: spacing.sm, paddingBottom: spacing.xs },
  exchange: { gap: 2 },
  you: { ...typography.caption, color: colors.textSecondary },
  reply: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  waiting: { ...typography.body, color: colors.textSecondary, fontStyle: 'italic' },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.3)',
  },
  menuLabel: { ...typography.bodyStrong, color: IVORY },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: 'rgba(233,196,106,0.16)' },
  tagText: { ...typography.caption, color: colors.gold, fontWeight: '700' },
  readerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.05)',
  },
  readerName: { fontFamily: SERIF, fontSize: 17, color: IVORY },
  readerTitle: { ...typography.caption, color: colors.textSecondary },
  portrait: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  portraitImg: { width: '100%', height: '100%' },
  initial: { fontFamily: SERIF, color: IVORY },
  cardHead: { ...typography.caption, color: colors.gold, letterSpacing: 0.4 },
  cardTitle: { fontFamily: SERIF, fontSize: 19, color: IVORY },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(233,196,106,0.3)' },
  dotWide: { width: 12 },
  dotOn: { backgroundColor: colors.gold },
  errorBox: { gap: spacing.sm },
  errorText: { ...typography.body, color: colors.textSecondary, fontStyle: 'italic' },
  errorButtons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.gold,
  },
  ctaText: { ...typography.bodyStrong, color: INK },
  ghost: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)' },
  ghostText: { ...typography.caption, color: IVORY },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1, ...typography.body, color: colors.textPrimary, minHeight: 44,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.25)',
  },
  send: { minWidth: 44, height: 44, paddingHorizontal: spacing.sm, borderRadius: 22, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  sendPrice: { ...typography.caption, color: INK, fontWeight: '700' },
  muted: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
