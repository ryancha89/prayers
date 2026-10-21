import React, { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../shared/components/Text';
import { Icon, type IconName } from '../../../shared/components/Icon';
import { Diamond } from '../../../shared/components/Ornaments';
import { GradientScrim } from '../../../shared/components/GradientScrim';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { useScreen } from '../../../shared/device/screen';
import { IVORY, RING_COMPACT, SERIF } from '../../../shared/components/hud/Hud';
import type { TarotConsultant } from '../api/cafeApi';
import { CAFE_ART } from '../assets/art';
import { Bubble, GhostButton, GoldButton, INK, Medallion, PanelBackdrop, PriceChip, ReaderFace } from './CafeChrome';
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
 *  touch. While picking and while the cookie waits, every touch outside the End button goes to Unity as
 *  CAFE_TAP (CafeScreen's TapLayer). */
const STRIP_STAGES = new Set<TableStage>(['arriving', 'spreading', 'picking', 'reading', 'serving', 'cookie']);
/** `reading` is a strip while it waits (the seven are turning over above it, 20-10); with an error it
 *  takes the panel back, for the words and the retry. `presenting` before its first step is a strip too:
 *  the reading came back while the last cards were still turning. */
export const isStripStage = (stage: TableStage, error: TableError | null = null, step = 0) =>
  (STRIP_STAGES.has(stage) && !(stage === 'reading' && error)) || (stage === 'presenting' && step < 0);

/** Stages with only a line or two to show, in the shorter panel. */
const COMPACT_STAGES = new Set<TableStage>(['asking', 'reading', 'brewing']);   // `reading` here = its error

const STRIP_ICON: Partial<Record<TableStage, IconName>> = {
  arriving: 'sparkle', spreading: 'sparkle', picking: 'sparkle', reading: 'sparkle', presenting: 'sparkle', serving: 'coffee', cookie: 'gift',
};

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
 * VIEW_INSETS mean the same thing whichever panel is up. Drawn with CafeChrome (20-10 restyle): a
 * plum glass panel, the reader's words in bubbles, the reading as a card with its place in the spread.
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

  if (isStripStage(s.stage, s.error, s.step)) {
    return (
      <View pointerEvents="box-none" onLayout={onLayout}
        style={[styles.stripDock, { bottom: bottomPad, left: safe.left + spacing.md, right: safe.right + spacing.md }]}>
        <View pointerEvents="box-none" style={styles.strip} testID="cafe-strip">
          <Medallion icon={STRIP_ICON[s.stage] ?? 'sparkle'} size={34} />
          <View pointerEvents="none" style={styles.grow}>
            <StripText table={table} />
          </View>
          {inTarot(s) && <EndButton onPress={table.end} />}
        </View>
      </View>
    );
  }

  // A short exchange (the question, a wait) takes a shorter panel: at 46% the greeting sat over an
  // empty half and the reader was cut off at the shoulders behind it (sim QA 20-10).
  const panelH = COMPACT_STAGES.has(s.stage) ? screen.vh(0.34, 250, 330) : screen.vh(0.46, 280, 430);
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
            ? [styles.panelSide, { paddingRight: safe.right + spacing.md, paddingBottom: bottomPad }]
            : { height: panelH + safe.bottom, paddingBottom: bottomPad, paddingLeft: safe.left + spacing.md, paddingRight: safe.right + spacing.md },
        ]}>
        <PanelBackdrop side={landscape} />
        {s.consultant && inTarot(s) && <ReaderHead reader={s.consultant} onEnd={table.end} />}
        <Body table={table} t={t} />
      </View>
    </KeyboardAvoidingView>
    </View>
  );
};

type Translate = ReturnType<typeof useT>;

/** Seven slots, lit as the cards are picked. */
const PickSlots: React.FC<{ picked: number }> = ({ picked }) => (
  <View style={styles.slots}>
    {Array.from({ length: SPREAD_SIZE }, (_, i) => (
      <View key={i} style={[styles.slot, i < picked && styles.slotOn]} />
    ))}
  </View>
);

const StripText: React.FC<{ table: CafeTable }> = ({ table }) => {
  const t = useT();
  const s = table.state;
  switch (s.stage) {
    case 'arriving':
      return <Text style={styles.stripLine}>{t('cafe.tarot.arriving', { name: s.consultant?.name ?? '' })}</Text>;
    case 'spreading':
      return <Text style={styles.stripLine}>{t('cafe.tarot.spreading')}</Text>;
    case 'reading':
      return <Text style={styles.stripLine} testID="cafe-reading-wait">{t('cafe.tarot.reading')}</Text>;
    case 'presenting':
      return <Text style={styles.stripLine}>{t('cafe.tarot.flipping')}</Text>;
    case 'picking':
      return (
        <View style={styles.pickCol}>
          <Text style={styles.stripLine} numberOfLines={2}>{s.line}</Text>
          <View style={styles.pickRow}>
            <PickSlots picked={s.picked} />
            <Text style={styles.counter} testID="cafe-pick-count">{t('cafe.tarot.count', { count: s.picked })}</Text>
          </View>
        </View>
      );
    case 'serving':
      return <Text style={styles.stripLine}>{t('cafe.coffee.serving')}</Text>;
    case 'cookie':
      return <Text style={styles.stripLine} testID="cafe-cookie-prompt">{t('cafe.coffee.tapCookie')}</Text>;
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
      // The question stays on the table as the player's bubble; the box empties once it is sent. If the
      // 30-coin sheet was cancelled, the same question can still be read (Begin) or a new one typed.
      return (
        <>
          <Lines follow>
            {s.question ? <Bubble mine who={t('cafe.you')} text={s.question} textID="cafe-question-said" /> : null}
            <Said who={s.consultant?.name ?? ''} text={s.line} />
            {s.question && !s.confirm ? (
              <GoldButton testID="cafe-tarot-begin" label={t('cafe.tarot.begin')} icon="sparkle" style={styles.selfStart}
                onPress={() => { sfx.select(); table.askReading(); }} />
            ) : null}
          </Lines>
          <Composer
            key="question"
            initial=""
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
          {s.error ? <ErrorRow table={table} error={s.error} t={t} /> : <Waiting icon="sparkle" text={t('cafe.tarot.reading')} />}
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
                <Bubble mine who={t('cafe.you')} text={f.q} />
                <Bubble who={s.consultant?.name} text={f.a} textID={`cafe-answer-${i}`} />
              </View>
            ))}
            {s.pending && !s.confirm ? (
              <View style={styles.exchange}>
                <Bubble mine who={t('cafe.you')} text={s.pending} />
                {s.error ? <ErrorRow table={table} error={s.error} t={t} /> : <Bubble who={s.consultant?.name} text={t('cafe.thinking')} muted />}
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
              <GhostButton label={t('cafe.back')} onPress={table.cancelCoffee} style={styles.selfStart} />
            </>
          ) : (
            <Waiting icon="coffee" text={t('cafe.coffee.brewing')} />
          )}
        </Lines>
      );
    default:
      return null;
  }
};

/** A line that is waiting on something, beside the thing's emblem. */
const Waiting: React.FC<{ icon: IconName; text: string }> = ({ icon, text }) => (
  <View style={styles.waitRow}>
    <Medallion icon={icon} size={36} />
    <Text style={[styles.waiting, styles.grow]}>{text}</Text>
  </View>
);

/** Seated, nothing ordered yet — or the reader just said goodbye, which is the line above the menu. */
const Menu: React.FC<{ table: CafeTable; t: Translate }> = ({ table, t }) => {
  const s = table.state;
  return (
    <ScrollView style={styles.lines} contentContainerStyle={styles.linesBody} testID="cafe-menu">
      {s.line ? <Bubble text={s.line} textID="cafe-farewell" /> : null}
      <View style={styles.headingRow}>
        <Diamond size={8} filled />
        <Text style={styles.heading}>{t('cafe.table.prompt')}</Text>
      </View>
      <View style={styles.services}>
        <ServiceTile art={CAFE_ART.coffee} label={t('cafe.table.coffee')} note={t('cafe.table.coffeeNote')}
          price={CAFE_PRICE.coffee} onPress={table.orderCoffee} testID="cafe-order-coffee" />
        <ServiceTile art={CAFE_ART.tarot} label={t('cafe.table.tarot')} note={t('cafe.table.tarotNote')}
          price={CAFE_PRICE.reading} onPress={table.openTarot} testID="cafe-order-tarot" />
      </View>
      <GhostButton label={t('cafe.table.leave')} icon="stand" onPress={table.leaveTable} testID="cafe-leave-table" style={styles.selfStart} />
    </ScrollView>
  );
};

/** One of the two things the table serves: its picture, its name and its price. */
export const ServiceTile: React.FC<{
  art: number;
  label: string;
  note: string;
  price: number;
  onPress: () => void;
  testID: string;
}> = ({ art, label, note, price, onPress, testID }) => {
  const t = useT();
  return (
    <Pressable testID={testID} onPress={() => { sfx.select(); onPress(); }} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.service, pressed && styles.pressed]}>
      <View style={styles.serviceArt}>
        <Image source={art} style={styles.serviceImg} resizeMode="cover" accessibilityIgnoresInvertColors />
        <GradientScrim height={44} opacity={0.75} color="#120B2A" />
        <View style={styles.servicePrice}>
          <PriceChip price={price} label={t('cafe.price', { price })} />
        </View>
      </View>
      <View style={styles.serviceText}>
        <Text style={styles.serviceLabel} numberOfLines={2}>{label}</Text>
        <Text style={styles.serviceNote} numberOfLines={2}>{note}</Text>
      </View>
    </Pressable>
  );
};

const Readers: React.FC<{ table: CafeTable; t: Translate }> = ({ table, t }) => {
  const s = table.state;
  return (
    <>
      <View style={styles.headRow}>
        <Pressable onPress={() => { sfx.back(); table.backToMenu(); }} accessibilityRole="button" accessibilityLabel={t('cafe.back')} hitSlop={8}
          style={({ pressed }) => [styles.backRing, pressed && styles.pressed]}>
          <Icon name="back" size={16} color={IVORY} />
        </Pressable>
        <Text style={[styles.heading, styles.grow]} numberOfLines={1}>{t('cafe.tarot.pick')}</Text>
      </View>
      <ScrollView style={styles.lines} contentContainerStyle={styles.linesBody} testID="cafe-readers">
        {s.consultantsFailed ? (
          <>
            <Text style={styles.waiting}>{t('cafe.tarot.loadFailed')}</Text>
            <GhostButton label={t('cafe.retry')} onPress={table.loadConsultants} style={styles.selfStart} />
          </>
        ) : s.consultants == null ? (
          <Waiting icon="sparkle" text={t('cafe.tarot.loading')} />
        ) : s.consultants.length === 0 ? (
          <Text style={styles.waiting}>{t('cafe.tarot.none')}</Text>
        ) : (
          s.consultants.map(c => (
            <ReaderRow key={c.id} reader={c} onPress={() => table.chooseConsultant(c)} testID={`cafe-reader-${c.id}`} />
          ))
        )}
      </ScrollView>
    </>
  );
};

/** A reader to choose: their face, name and what they read for. */
export const ReaderRow: React.FC<{ reader: TarotConsultant; onPress: () => void; testID: string }> = ({ reader, onPress, testID }) => (
  <Pressable testID={testID} onPress={() => { sfx.select(); onPress(); }}
    accessibilityRole="button" accessibilityLabel={reader.name} style={({ pressed }) => [styles.readerRow, pressed && styles.pressed]}>
    <ReaderFace reader={reader} size={52} glow />
    <View style={styles.grow}>
      <Text style={styles.readerName} numberOfLines={1}>{reader.name}</Text>
      {reader.title ? <Text style={styles.readerTitle} numberOfLines={2}>{reader.title}</Text> : null}
    </View>
    <View style={styles.chevron}>
      <Icon name="arrowRight" size={14} color={colors.gold} />
    </View>
  </Pressable>
);

const ReaderHead: React.FC<{ reader: TarotConsultant; onEnd: () => void }> = ({ reader, onEnd }) => (
  <View style={styles.headRow}>
    <ReaderFace reader={reader} size={42} glow />
    <View style={styles.grow}>
      <Text style={styles.guest} numberOfLines={1}>{reader.name}</Text>
      {reader.title ? <Text style={styles.readerTitle} numberOfLines={1}>{reader.title}</Text> : null}
    </View>
    <EndButton onPress={onEnd} />
  </View>
);

const EndButton: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const t = useT();
  return <GhostButton label={t('cafe.tarot.end')} icon="close" onPress={onPress} testID="cafe-tarot-end" />;
};

/** The reading, one step at a time: each card (its slot lit in the room), the whole, the advice. */
const Presenting: React.FC<{ table: CafeTable; t: Translate }> = ({ table, t }) => {
  const s = table.state;
  const r = s.reading;
  if (!r || s.step < 0) {
    return <Lines><Waiting icon="sparkle" text={t('cafe.tarot.flipping')} /></Lines>;
  }
  let head: string;
  let title: string;
  let body: string;
  let orientation: string | null = null;
  if (s.step < SPREAD_SIZE) {
    const c = r.cards[s.step];
    head = [t('cafe.tarot.cardOf', { n: s.step + 1 }), c.position].filter(Boolean).join(' · ');
    title = c.name;
    orientation = t(c.orientation === 'reversed' ? 'cafe.tarot.reversed' : 'cafe.tarot.upright');
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
  const last = s.step >= STEP_ADVICE;
  return (
    <>
      <ScrollView style={styles.lines} contentContainerStyle={styles.linesBody} testID="cafe-reading">
        <View style={styles.readingCard}>
          {head ? <Text style={styles.cardHead}>{head}</Text> : null}
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, styles.grow]} testID="cafe-reading-title">
              {orientation ? `${title} · ${orientation}` : title}
            </Text>
          </View>
          <View style={styles.cardRule} />
          <Text style={styles.reply} testID="cafe-reading-body">{body}</Text>
        </View>
      </ScrollView>
      <View style={styles.footRow}>
        <Progress step={s.step} />
        <GoldButton testID="cafe-reading-next" label={t('cafe.tarot.next')} icon={last ? undefined : 'arrowRight'}
          onPress={() => { sfx.tap(); table.next(); }} />
      </View>
    </>
  );
};

/** Where the reading is: seven card pips, then the overall and the advice as diamonds. */
const Progress: React.FC<{ step: number }> = ({ step }) => (
  <View style={[styles.dots, styles.grow]}>
    {Array.from({ length: STEP_ADVICE + 1 }, (_, i) =>
      i < SPREAD_SIZE ? (
        <View key={i} style={[styles.pip, i <= step && styles.pipDone, i === step && styles.pipOn]} />
      ) : (
        <Diamond key={i} size={i === step ? 11 : 9} filled={i <= step} />
      ),
    )}
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

/** The reader's line. Their name is in the panel's head already, so the bubble does not repeat it. */
const Said: React.FC<{ who: string; text: string }> = ({ text }) =>
  text ? <Bubble text={text} textID="cafe-reader-line" /> : null;

const ErrorRow: React.FC<{ table: CafeTable; error: TableError; t: Translate }> = ({ table, error, t }) => (
  <View style={styles.errorBox} testID="cafe-table-error">
    <View style={styles.waitRow}>
      <Icon name="bolt" size={16} color="#F5B38B" />
      <Text style={[styles.errorText, styles.grow]}>{t(ERROR_COPY[error])}</Text>
    </View>
    <View style={styles.errorButtons}>
      {error === 'insufficient' && (
        <GoldButton label={t('cafe.pay.getCoins')} onPress={() => { sfx.tap(); table.getCoins(); }} />
      )}
      {error !== 'invalidCards' && error !== 'notFound' && (
        <GhostButton testID="cafe-table-retry" label={t('cafe.retry')} onPress={table.retry} />
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
        accessibilityState={{ disabled: off }} style={({ pressed }) => [styles.send, price != null && styles.sendWide, off && styles.muted, pressed && styles.pressed]}>
        {price != null && <PriceChip price={price} label={t('cafe.price', { price })} onGold />}
        <Icon name="send" size={18} color={INK} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  grow: { flex: 1 },
  selfStart: { alignSelf: 'flex-start' },
  bottomDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sideDock: { position: 'absolute', right: 0, bottom: 0 },
  panel: {
    overflow: 'hidden', paddingTop: spacing.lg, paddingHorizontal: spacing.md, gap: spacing.md,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
  },
  panelSide: { flex: 1, paddingTop: spacing.md, borderTopRightRadius: 0, borderBottomLeftRadius: radius.xl },
  stripDock: { position: 'absolute', alignItems: 'center' },
  strip: {
    width: '100%', maxWidth: 440, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingLeft: spacing.sm, paddingRight: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.xl,
    backgroundColor: 'rgba(22,14,46,0.88)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.45)',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  stripLine: { ...typography.body, color: colors.textPrimary },
  pickCol: { gap: 6 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  slots: { flexDirection: 'row', gap: 4, flex: 1 },
  slot: { width: 12, height: 17, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(233,196,106,0.5)', backgroundColor: 'rgba(233,196,106,0.06)' },
  slotOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  counter: { fontFamily: SERIF, fontSize: 18, color: colors.gold },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heading: { fontFamily: SERIF, fontSize: 18, color: IVORY, letterSpacing: 0.3 },
  guest: { fontFamily: SERIF, fontSize: 18, color: IVORY },
  backRing: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.55)',
  },
  lines: { flex: 1 },
  linesBody: { gap: spacing.md, paddingBottom: spacing.xs },
  exchange: { gap: spacing.sm },
  reply: { ...typography.body, color: colors.textPrimary, lineHeight: 23 },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  waiting: { ...typography.body, color: colors.textSecondary, fontStyle: 'italic' },
  services: { flexDirection: 'row', gap: spacing.sm },
  service: {
    flex: 1, borderRadius: radius.md, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.4)',
  },
  serviceArt: { height: 92, backgroundColor: '#1B1236' },
  serviceImg: { width: '100%', height: '100%' },
  servicePrice: { position: 'absolute', left: spacing.sm, bottom: spacing.sm },
  serviceText: { padding: spacing.sm, gap: 2 },
  serviceLabel: { fontFamily: SERIF, fontSize: 15, color: IVORY },
  serviceNote: { ...typography.tiny, color: colors.textSecondary, fontWeight: '500' },
  readerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.22)',
  },
  readerName: { fontFamily: SERIF, fontSize: 17, color: IVORY },
  readerTitle: { ...typography.caption, color: 'rgba(233,196,106,0.8)' },
  chevron: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(233,196,106,0.12)',
  },
  readingCard: {
    padding: spacing.md, gap: spacing.sm, borderRadius: radius.md,
    backgroundColor: 'rgba(244,235,221,0.05)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.3)',
  },
  cardHead: { ...typography.tiny, color: colors.gold, letterSpacing: 1, textTransform: 'uppercase' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontFamily: SERIF, fontSize: 20, color: IVORY },
  cardRule: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(233,196,106,0.45)' },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pip: { width: 8, height: 12, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(233,196,106,0.45)' },
  pipDone: { backgroundColor: 'rgba(233,196,106,0.45)' },
  pipOn: { backgroundColor: colors.gold, borderColor: colors.gold, transform: [{ scale: 1.15 }] },
  errorBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(245,179,139,0.08)', borderWidth: 1, borderColor: 'rgba(245,179,139,0.3)' },
  errorText: { ...typography.body, color: colors.textPrimary },
  errorButtons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1, ...typography.body, color: colors.textPrimary, minHeight: 46,
    paddingHorizontal: spacing.lg, paddingTop: 13, paddingBottom: 13, borderRadius: 23,
    backgroundColor: 'rgba(10,8,26,0.55)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  send: {
    minWidth: 46, height: 46, paddingHorizontal: spacing.sm, borderRadius: 23, flexDirection: 'row', gap: 6,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  sendWide: { paddingLeft: 6, paddingRight: spacing.md },
  muted: { opacity: 0.45, shadowOpacity: 0 },
  pressed: { opacity: 0.78 },
});
