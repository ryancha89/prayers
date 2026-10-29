import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang, TranslationKey } from '../../../shared/i18n';
import { devlog } from '../../../shared/devlog';
import { useCoins } from '../../coins/store/coinStore';
import { refreshCoins } from '../../coins/api/coinsApi';
import type { CafeBridge, CafeCard, CafeTarotSpeak, UnityToRNEvent } from '../../counseling/types';
import {
  askFollowup,
  createReading,
  fetchTarotConsultants,
  isRetryable,
  newRequestId,
  offersRetry,
  orderCoffee,
  warmVoice,
  type CafeFailure,
  type TarotConsultant,
  type TarotReading,
} from '../api/cafeApi';
import { needsTarotMove, TAROT_TABLE } from './tarotTable';

/**
 * What the table sells, in Prayer Coins — mirrored from the contract so the confirmation can name
 * the price and say "not enough" before anything is sent. The SERVER charges, and its answer (a
 * 402 with the balance) wins over these numbers.
 */
export const CAFE_PRICE = { reading: 30, followup: 10, coffee: 30 } as const;
export type CafePaid = keyof typeof CAFE_PRICE;

/** Magic Seven. */
export const SPREAD_SIZE = 7;

/** How long a move to the tarot table waits for Unity's first word (CAFE_PHASE seating, or a refusal)
 *  before it gives up and puts the menu back. Unity answers a CAFE_SIT in the same frame; silence means
 *  it never took it (CafeEntry.Sit returns quietly while the cafe is not active), and `moving` had no
 *  way out but the world (QA 21-10). Also the wait for CAFE_PHASE exploring after Cancel. */
export const MOVE_ANSWER_MS = 3000;
/** …and once walking, how long until CAFE_SEATED (or the walk back's seating/busy) must have come:
 *  Unity's own limit for a plain walk (CafeExperience.SeatSeconds, 18 s) plus slack. Unity gives up
 *  first and says so; this only catches the answer that never arrives. */
export const MOVE_WALK_MS = (18 + 5) * 1000;

/**
 * Where the table is. One stage at a time, in the order the contract's flow walks them:
 *
 *   menu ─ tarot ─(away from the tarot table: moving)→ consultants → arriving → asking ─(confirm 30)→ spreading → picking → reading
 *        │                                                   → presenting (7 cards, overall, advice)
 *        │                                                   → followup ⟲ (confirm 10 each)
 *        └ coffee ─(confirm 30)→ brewing → serving → cookie → fortune → menu
 *
 * End (any tarot stage) and a finished fortune come back to `menu`, still seated. `moving` (21-10,
 * PM: "if user select tarot consultation, should move to the tarot table") is the walk from another
 * table to the tarot one; the readers open there, and a tarot table somebody else holds leaves the
 * player at the menu where they sat.
 */
export type TableStage =
  | 'menu'
  | 'moving'
  | 'consultants'
  | 'arriving'
  | 'asking'
  | 'spreading'
  | 'picking'
  | 'reading'
  | 'presenting'
  | 'followup'
  | 'brewing'
  | 'serving'
  | 'cookie'
  | 'fortune';

export type TableError = CafeFailure['kind'];

/** Steps of `presenting`: 0–6 the cards, then the overall reading, then the advice. */
export const STEP_OVERALL = SPREAD_SIZE;
export const STEP_ADVICE = SPREAD_SIZE + 1;

/** What the reader says at one step — spoken by showStep, and warmed on the server ahead of it. */
function stepLine(reading: TarotReading, step: number): CafeTarotSpeak {
  if (step < SPREAD_SIZE) {
    const card = reading.cards[step];
    // The model usually opens the meaning with the card's name already; say it once.
    const named = card.meaning.toLowerCase().includes(card.name.toLowerCase());
    return { slot: step, text: named ? card.meaning : `${card.name}. ${card.meaning}`, mood: 'explain' };
  }
  if (step === STEP_OVERALL) return { text: reading.overall, mood: 'explain' };
  return { text: reading.advice, mood: 'warm' };
}

export interface TableState {
  /** CAFE_SEATED came and the player has not stood up since. Everything below needs it. */
  seated: boolean;
  /** The table they sit at (CAFE_SEATED.spot). */
  spot: string;
  stage: TableStage;
  /** `menu` with the services showing. Closed, the player just sits: a strip with Menu and Leave, and
   *  the room in view (PM 22-10: "need just sitting not ordering anything"). Closed on every sit and
   *  when a coffee or a reading is over; the moves and errors that land on `menu` keep it as it was. */
  menuOpen: boolean;
  /** `moving`, but back to the seat the player came from: the tarot table was taken on the way
   *  (CAFE_PHASE seating/busy). The strip says so instead of "Moving to the tarot table…". */
  returning: boolean;
  consultants: TarotConsultant[] | null;
  consultantsFailed: boolean;
  consultant: TarotConsultant | null;
  /** What the reader just said (greeting, "choose seven", the farewell…), shown as their line. */
  line: string;
  question: string;
  /** Cards picked so far (CAFE_CARD_PICKED.count). */
  picked: number;
  chosen: CafeCard[] | null;
  reading: TarotReading | null;
  /** `presenting`: -1 while the cards turn over, then 0..STEP_ADVICE. */
  step: number;
  followups: { q: string; a: string }[];
  /** The follow-up awaiting its confirmation or its answer. */
  pending: string;
  /** The paid thing the confirmation sheet is asking about, if it is open. */
  confirm: CafePaid | null;
  busy: boolean;
  /** End, Leave or the screen's Back was pressed while a paid answer is on its way: the sheet asks
   *  before it is given up (29-10). Shown only while `paidInFlight` — an answer that lands first
   *  closes the question by itself. */
  leaveAsk: LeaveKind | null;
  error: TableError | null;
  fortune: string | null;
}

/** What the player was doing when the leave sheet asked: End the reading, stand up from the table,
 *  or go back to the world (the screen's Back — the screen navigates, the table only asks). */
export type LeaveKind = 'end' | 'leave' | 'world';

const OFF: TableState = {
  seated: false,
  spot: '',
  stage: 'menu',
  menuOpen: false,
  returning: false,
  consultants: null,
  consultantsFailed: false,
  consultant: null,
  line: '',
  question: '',
  picked: 0,
  chosen: null,
  reading: null,
  step: -1,
  followups: [],
  pending: '',
  confirm: null,
  busy: false,
  leaveAsk: null,
  error: null,
  fortune: null,
};

/** Stages with a reader at (or on the way to) the table — the ones End is offered in. */
const TAROT_STAGES = new Set<TableStage>(['arriving', 'asking', 'spreading', 'picking', 'reading', 'presenting', 'followup']);
export const inTarot = (s: TableState) => s.seated && TAROT_STAGES.has(s.stage);
/** Another reader can be asked for (10-23, "상담끝나거나 시작전에 상담사 변경가능해야함"): seated with
 *  this one before any question (nothing paid), or once a reading is over — never mid-reading. */
export const canChangeReader = (s: TableState) =>
  s.seated && !s.busy && !s.confirm && !s.pending &&
  ((s.stage === 'asking' && !s.question) || s.stage === 'followup');

/**
 * The paid thing being written right now, or null. `busy` is only ever set by the three paid calls
 * (runReading, runFollowup, runCoffee), each in its own stage. The server charges as the request
 * arrives (CafeLedger.run: charge → write → refund only on failure), so leaving now throws away an
 * answer that is already paid for — the replay by request_id is only reachable from this table.
 */
export const paidInFlight = (s: TableState): CafePaid | null => {
  if (!s.busy) return null;
  if (s.stage === 'reading') return 'reading';
  if (s.stage === 'followup') return 'followup';
  if (s.stage === 'brewing') return 'coffee';
  return null;
};

/**
 * The paid thing that failed with no answer — 'failed' is the one failure that may have been charged
 * (the request went out, nothing readable came back; a 503 is refunded). Its request_id is still open,
 * and Retry replays the stored answer if the server did write it. Leaving drops that id, so End, Leave
 * and Back ask first and offer the Retry (29-10; the in-flight question above only covered `busy`).
 */
export const unansweredPaid = (s: TableState): CafePaid | null => {
  if (s.busy || s.error !== 'failed') return null;
  if (s.stage === 'reading') return 'reading';
  if (s.stage === 'followup' && s.pending) return 'followup';
  if (s.stage === 'brewing') return 'coffee';
  return null;
};

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

/**
 * The table service of spec 007 — tarot with an AI reader, coffee with a fortune cookie — as one
 * state machine over the cafe's bridge. RN owns every word and every server call; Unity is told only
 * what to stage, and only after the server has said yes to anything paid.
 *
 * Results that come back after the player has moved on (End, standing up) are dropped by
 * generation: `gen` moves on every reset, and an answer from an older one is not this table's. A paid
 * answer still being written is not given up without asking (`leaveAsk`, 29-10).
 */
export function useCafeTable(bridge: CafeBridge, lang: Lang, t: Translate) {
  const [state, setState] = useState<TableState>(OFF);
  const ref = useRef(state);
  ref.current = state;
  const patch = useCallback((p: Partial<TableState>) => setState(prev => ({ ...prev, ...p })), []);
  const tRef = useRef(t);
  tRef.current = t;
  const langRef = useRef(lang);
  langRef.current = lang;

  const gen = useRef(0);
  /** The move's watchdog (MOVE_ANSWER_MS / MOVE_WALK_MS): `moving` never outlives Unity's silence. */
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearMove = () => {
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = null;
  };
  /** Cancel was pressed: a watchdog that fires after it puts the menu back without the "could not
   *  move" line — the player asked for it. */
  const moveCancelled = useRef(false);
  const armMove = (ms: number) => {
    clearMove();
    const g = gen.current;
    moveTimer.current = setTimeout(() => {
      moveTimer.current = null;
      if (g !== gen.current || ref.current.stage !== 'moving') return;
      devlog(`[cafe] move to the tarot table: no answer from Unity in ${ms} ms`);
      const line = moveCancelled.current ? '' : tRef.current('cafe.move.stalled');
      ref.current = { ...ref.current, stage: 'menu', returning: false, line };
      patch({ stage: 'menu', returning: false, line });
    }, ms);
  };
  // Gone from the screen (Back to the World, Leave anyway, any exit): an answer still on its way is
  // another generation's. Nothing bumped `gen` here before 29-10, so a late reading still fired seven
  // warmVoice syntheses and sent CAFE_TAROT_REVEAL/SPEAK to a cafe the player had left.
  useEffect(() => () => { gen.current += 1; clearMove(); }, []);

  /** One purchase intent → one request_id, kept across retries (cafeApi's rule). */
  const intent = useRef<{ paid: CafePaid; id: string } | null>(null);
  const keyFor = (paid: CafePaid) => {
    if (intent.current?.paid !== paid) intent.current = { paid, id: newRequestId() };
    return intent.current.id;
  };
  const endIntent = () => { intent.current = null; };
  const settle = (r: CafeFailure) => {
    if (!isRetryable(r)) endIntent();
    devlog(`[cafe] table ${ref.current.stage}: ${r.kind}`);
  };

  const speak = (s: CafeTarotSpeak) => bridge.sendCafeTarotSpeak(s);

  /** The seat ids the scene has (CAFE_READY): whether there is a tarot table to walk to. */
  const spots = useRef<string[]>([]);

  /* ---- tarot --------------------------------------------------------------------------------- */

  const loadConsultants = useCallback(async () => {
    const g = gen.current;
    patch({ consultants: null, consultantsFailed: false });
    const list = await fetchTarotConsultants(langRef.current);
    if (g !== gen.current) return;
    patch(list ? { consultants: list } : { consultantsFailed: true });
  }, [patch]);

  const listReaders = () => {
    patch({ stage: 'consultants', line: '', error: null });
    loadConsultants();
  };

  /** Tarot from the menu. Readings happen at the tarot table: from any other, the player gets up and
   *  walks over by themselves (CAFE_SIT while seated = a move; no barista escort since 21-10, PM:
   *  "select anywhere and sit"), and the readers open there. */
  const openTarot = () => {
    const s = ref.current;
    if (!needsTarotMove(s.spot, spots.current)) { listReaders(); return; }
    ref.current = { ...s, stage: 'moving', returning: false, line: '', error: null };
    patch({ stage: 'moving', returning: false, line: '', error: null });
    moveCancelled.current = false;
    armMove(MOVE_ANSWER_MS);
    bridge.sendCafeSit(TAROT_TABLE);
  };

  /** Cancel on the moving strip. Unity has no "cancel a move": the old seat was given up when the
   *  player stood (CafeExperience.MoveSeat), so the one way out is the on-foot seating's own Cancel —
   *  CAFE_STAND, which ends the walk wherever it is (EndConversation) and answers CAFE_PHASE exploring.
   *  That answer clears the table like any standing up; the strip stays until it comes, so RN and Unity
   *  change state together. No answer at all (Unity never got the move) → the watchdog's menu. */
  const cancelMove = () => {
    if (ref.current.stage !== 'moving') return;
    moveCancelled.current = true;
    armMove(MOVE_ANSWER_MS);
    bridge.sendCafeStand();
  };

  const chooseConsultant = (c: TarotConsultant) => {
    patch({ consultant: c, stage: 'arriving', line: '', question: '', followups: [], reading: null, chosen: null });
    bridge.sendCafeTarotStart({ consultantId: c.id, portraitKey: c.portraitKey, voice: c.voice });
  };

  const submitQuestion = (text: string) => {
    const q = text.trim();
    if (!q || ref.current.stage !== 'asking') return;
    const ack = tRef.current('cafe.tarot.ack');
    patch({ question: q, line: ack });
    speak({ text: ack, mood: 'think' });
    askToPay('reading');
  };

  /** Narrate one step of the reading: a card (its slot lit), then the overall, then the advice. */
  const showStep = (step: number) => {
    const reading = ref.current.reading;
    if (!reading) return;
    patch({ step });
    speak(stepLine(reading, step));
  };

  const runReading = async () => {
    const s = ref.current;
    if (!s.chosen || !s.consultant) return;
    const g = gen.current;
    patch({ busy: true, error: null });
    const r = await createReading({
      requestId: keyFor('reading'),
      consultantId: s.consultant.id,
      question: s.question,
      cards: s.chosen,
      lang: langRef.current,
    });
    if (g !== gen.current) return;
    if (!r.ok) {
      settle(r);
      patch({ busy: false, leaveAsk: null, error: r.kind });
      return;
    }
    endIntent();
    const reading = r.reading;
    // Every line of the reading, synthesised now (in order, all at once) so each Next speaks at once.
    for (let i = 0; i <= STEP_ADVICE; i++) void warmVoice(stepLine(reading, i).text, s.consultant.voice, langRef.current);
    ref.current = { ...ref.current, reading, stage: 'presenting', step: -1 };
    patch({ busy: false, leaveAsk: null, reading, stage: 'presenting', step: -1 });
    // The seven stay face down until the reader comes to each: Unity turns a card over when its SPEAK
    // arrives (stepwise), as a reader at a real table does (21-10 review). They used to flip all at once
    // the moment the seventh was picked.
    bridge.sendCafeTarotReveal(reading.cards.map(c => ({ id: c.id, orientation: c.orientation, name: c.name })), true);
    showStep(0);
  };

  const next = () => {
    const s = ref.current;
    if (s.stage !== 'presenting' || s.step < 0) return;
    if (s.step < STEP_ADVICE) { showStep(s.step + 1); return; }
    const prompt = tRef.current('cafe.tarot.followupPrompt');
    patch({ stage: 'followup', line: prompt });
    speak({ text: prompt, mood: 'warm' });
  };

  const submitFollowup = (text: string) => {
    const q = text.trim();
    if (!q || ref.current.stage !== 'followup' || ref.current.busy) return;
    patch({ pending: q, confirm: 'followup', error: null });
  };

  const runFollowup = async () => {
    const s = ref.current;
    if (!s.reading || !s.pending) return;
    const g = gen.current;
    patch({ busy: true, error: null });
    const r = await askFollowup({ readingId: s.reading.readingId, requestId: keyFor('followup'), question: s.pending, lang: langRef.current });
    if (g !== gen.current) return;
    if (!r.ok) {
      settle(r);
      // A refusal Retry cannot fix (404 READING_NOT_FOUND, a bad question) lets the question go: it
      // used to stay `pending`, which disabled the composer and refused Ask another and Change reader —
      // the follow-up area was locked until End (29-10). The error stays on its own row.
      patch({ busy: false, leaveAsk: null, error: r.kind, ...(offersRetry(r.kind) ? {} : { pending: '' }) });
      return;
    }
    endIntent();
    setState(prev => ({ ...prev, busy: false, leaveAsk: null, followups: [...prev.followups, { q: prev.pending, a: r.answer }], pending: '' }));
    speak({ text: r.answer, mood: 'explain' });
  };

  /** "Ask another question" once the reading is done: the same reader stays seated and asks for the
   *  new question. The seven stay on the table until the next deal gathers them back into the deck
   *  (CafeTarot.Spread from a finished reading). Another reading, another 30 PC. */
  const askAnother = () => {
    const s = ref.current;
    if (s.stage !== 'followup' || s.busy || s.pending) return;
    endIntent();
    const line = tRef.current('cafe.tarot.againPrompt');
    patch({ stage: 'asking', line, question: '', picked: 0, chosen: null, reading: null, step: -1, followups: [], error: null });
    speak({ text: line, mood: 'warm' });
  };

  /**
   * A way out pressed while a paid answer is being written: ask first (29-10). End and Back used to
   * bump `gen` at once — the server still charged, and the answer that came back ~50 s later was
   * dropped as another generation's. Returns true when it asked (the caller stops there).
   */
  const askBeforeLeaving = (kind: LeaveKind): boolean => {
    if (!paidInFlight(ref.current) && !unansweredPaid(ref.current)) return false;
    ref.current = { ...ref.current, leaveAsk: kind };
    patch({ leaveAsk: kind });
    return true;
  };

  /** End the reading, at any point: the reader says goodbye and leaves; the player stays seated. */
  const end = () => {
    if (!inTarot(ref.current) || askBeforeLeaving('end')) return;
    endNow();
  };

  const endNow = () => {
    if (!inTarot(ref.current)) return;
    gen.current += 1;
    endIntent();
    // The reader SAYS goodbye (spec step 7), then stands: Unity's leave waits for the line to finish.
    const farewell = tRef.current('cafe.tarot.farewell');
    speak({ text: farewell, mood: 'warm' });
    bridge.sendCafeTarotEnd();
    setState(prev => ({
      ...OFF,
      seated: prev.seated,
      stage: 'menu',
      line: farewell,
    }));
  };

  /** Another reader: this one says goodbye and walks out, and the list opens at the same table.
   *  Unity takes the next CAFE_TAROT_START even while the last reader is still leaving. */
  const changeReader = () => {
    if (!canChangeReader(ref.current)) return;
    gen.current += 1;
    endIntent();
    const farewell = tRef.current('cafe.tarot.farewell');
    speak({ text: farewell, mood: 'warm' });
    bridge.sendCafeTarotEnd();
    setState(prev => ({
      ...OFF,
      seated: prev.seated,
      spot: prev.spot,
      consultants: prev.consultants,
      stage: 'consultants',
    }));
    if (!ref.current.consultants) loadConsultants();
  };

  /* ---- coffee -------------------------------------------------------------------------------- */

  const runCoffee = async () => {
    const g = gen.current;
    patch({ stage: 'brewing', busy: true, error: null });
    const r = await orderCoffee({ requestId: keyFor('coffee'), lang: langRef.current });
    if (g !== gen.current) return;
    if (!r.ok) {
      settle(r);
      patch({ busy: false, leaveAsk: null, error: r.kind });
      return;
    }
    endIntent();
    patch({ busy: false, leaveAsk: null, fortune: r.fortune, stage: 'serving' });
    bridge.sendCafeCoffeeOrder();
    bridge.sendCafeCookieFortune(r.fortune);
  };

  /** Back to the menu from a coffee that failed. An unanswered order keeps its request_id, so the
   *  next "Order Coffee" is the same purchase to the ledger if the first one did go through. */
  const cancelCoffee = () => {
    if (ref.current.stage !== 'brewing' || ref.current.busy) return;
    patch({ stage: 'menu', error: null, line: '' });
  };

  const closeFortune = () => patch({ stage: 'menu', menuOpen: false, fortune: null, line: '' });

  /* ---- shared -------------------------------------------------------------------------------- */

  const askToPay = (paid: CafePaid) => {
    patch({ confirm: paid, error: null });
    if (useCoins.getState().balance == null) refreshCoins();
  };

  const cancelConfirm = () => {
    const s = ref.current;
    // A follow-up that was not paid for goes back into the box rather than vanishing.
    patch({ confirm: null, ...(s.confirm === 'followup' ? { pending: '' } : {}) });
  };

  /** The sheet's Pay. Short of coins (as far as the app knows) it opens the coin shop instead. */
  const confirm = () => {
    const s = ref.current;
    const paid = s.confirm;
    if (!paid || s.busy) return;
    const balance = useCoins.getState().balance;
    if (balance != null && balance < CAFE_PRICE[paid]) {
      useCoins.getState().openShop();
      return;
    }
    // Closed in the ref at once too: a second tap on Pay in the same frame finds nothing to pay for.
    ref.current = { ...ref.current, confirm: null };
    patch({ confirm: null });
    if (paid === 'reading') {
      // Consent now, charge later: the reading is paid by POST readings once seven cards are down.
      endIntent();
      keyFor('reading');
      patch({ stage: 'spreading', picked: 0, chosen: null });
      bridge.sendCafeTarotSpread();
    } else if (paid === 'followup') {
      runFollowup();
    } else {
      runCoffee();
    }
  };

  /** Try the failed call again: the same request_id while the intent is open (503, no answer),
   *  a new one after a definitive refusal (402 after a top-up). */
  const retry = () => {
    const s = ref.current;
    if (s.busy) return;
    if (s.stage === 'reading') runReading();
    else if (s.stage === 'followup' && s.pending) runFollowup();
    else if (s.stage === 'brewing') runCoffee();
  };

  /** A follow-up refused with nothing charged (503 refunded, 402, a refused id): the player may drop
   *  it and type another instead of only retrying the same words. */
  const dropFollowup = () => {
    const s = ref.current;
    if (s.stage !== 'followup' || s.busy || !s.pending || s.error === 'failed') return;
    endIntent();
    patch({ pending: '', error: null });
  };

  const leaveTable = () => {
    if (askBeforeLeaving('leave')) return;
    leaveNow();
  };

  const leaveNow = () => {
    gen.current += 1;
    clearMove();
    setState(OFF);
    bridge.sendCafeStand();
  };

  /** The leave sheet's Stay: nothing changes, and the answer is shown when it lands. */
  const stay = () => {
    ref.current = { ...ref.current, leaveAsk: null };
    patch({ leaveAsk: null });
  };

  /** The leave sheet's Try again, for a paid request that failed with no answer: the same request_id,
   *  so a charge that did go through is replayed rather than taken twice. */
  const retryInstead = () => {
    ref.current = { ...ref.current, leaveAsk: null };
    patch({ leaveAsk: null });
    retry();
  };

  /** The leave sheet's Leave anyway: what was asked about, done now. 'world' is returned to the
   *  screen, which owns the navigation. */
  const leaveAnyway = (): LeaveKind | null => {
    const kind = ref.current.leaveAsk;
    ref.current = { ...ref.current, leaveAsk: null };
    patch({ leaveAsk: null });
    if (kind === 'end') endNow();
    else if (kind === 'leave') leaveNow();
    // The screen navigates away; the answer must not land in the gap before the table unmounts.
    else if (kind === 'world') gen.current += 1;
    return kind;
  };

  /* ---- Unity ---------------------------------------------------------------------------------- */

  useEffect(() => {
    const off = bridge.onEvent((e: UnityToRNEvent) => {
      const s = ref.current;
      switch (e.type) {
        case 'CAFE_READY':
          spots.current = Array.isArray(e.payload?.spots) ? e.payload.spots : [];
          break;
        case 'CAFE_SEATED': {
          const spot = String(e.payload?.spot ?? '');
          if (s.seated) {
            // The end of a move: at the tarot table the readers open; back at the old seat (the tarot
            // table was taken on the way) the menu, as it was.
            if (s.stage !== 'moving') {
              // A move the watchdog had already given up on, landing late: the menu stays, at the seat
              // Unity says the player is in.
              if (spot && spot !== s.spot) { ref.current = { ...s, spot }; patch({ spot }); }
              break;
            }
            clearMove();
            ref.current = { ...s, spot, stage: 'menu', returning: false };
            patch({ spot, stage: 'menu', returning: false });
            if (spot === TAROT_TABLE) listReaders();
            break;
          }
          // Any table, first sit: the menu (user, 21-10 — nothing is chosen before the player sits).
          const seated = { ...OFF, seated: true, spot };
          ref.current = seated;
          setState(seated);
          break;
        }
        case 'CAFE_PHASE':
          // On foot again: whatever the table was doing is over.
          if (e.payload?.phase === 'exploring' && s.seated) {
            gen.current += 1;
                    clearMove();
            setState(OFF);
          } else if (e.payload?.phase === 'talking' && e.payload.reason === 'busy' && s.stage === 'moving') {
            // The tarot table is taken: still seated where they were, at the menu.
            clearMove();
            ref.current = { ...s, stage: 'menu', returning: false };
            patch({ stage: 'menu', returning: false });
          } else if (e.payload?.phase === 'seating' && s.stage === 'moving' && !moveCancelled.current) {
            // Walking (to the tarot table, or back from it): Unity's own walk limit applies from here.
            // `busy` here is the walk back — a fresh walk in Unity (BackToPreviousSeat), a fresh limit.
            armMove(MOVE_WALK_MS);
            if (e.payload.reason === 'busy' && !s.returning) {
              ref.current = { ...s, returning: true };
              patch({ returning: true });
            }
          }
          break;
        case 'CAFE_CONSULTANT_SEATED':
          if (s.stage === 'arriving') {
            const greeting = tRef.current('cafe.tarot.greeting');
            patch({ stage: 'asking', line: greeting });
            speak({ text: greeting, mood: 'greet' });
          }
          break;
        case 'CAFE_DECK_READY':
          if (s.stage === 'spreading') {
            const line = tRef.current('cafe.tarot.choose');
            patch({ stage: 'picking', line, picked: 0 });
            speak({ text: line, mood: 'warm' });
          }
          break;
        case 'CAFE_CARD_PICKED':
          if (s.stage === 'picking' || s.stage === 'spreading') {
            const count = Number(e.payload?.count);
            if (Number.isFinite(count)) patch({ stage: 'picking', picked: Math.max(0, Math.min(SPREAD_SIZE, count)) });
          }
          break;
        case 'CAFE_CARDS_CHOSEN': {
          const cards = Array.isArray(e.payload?.cards) ? e.payload.cards : [];
          if ((s.stage === 'picking' || s.stage === 'spreading') && cards.length === SPREAD_SIZE) {
            const chosen = cards.map(c => ({ id: String(c.id), orientation: c.orientation === 'reversed' ? 'reversed' as const : 'upright' as const }));
            ref.current = { ...ref.current, chosen, stage: 'reading', picked: SPREAD_SIZE };
            patch({ chosen, stage: 'reading', picked: SPREAD_SIZE, line: '' });
            runReading();
          }
          break;
        }
        case 'CAFE_COFFEE_SERVED':
          if (s.stage === 'serving') patch({ stage: 'cookie' });
          break;
        case 'CAFE_COOKIE_OPENED':
          if ((s.stage === 'cookie' || s.stage === 'serving') && s.fortune) patch({ stage: 'fortune' });
          break;
        case 'CAFE_CONSULTANT_LEFT':
          break;
      }
    });
    return off;
    // The handlers read the latest state through `ref`; subscribing once per bridge is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  return {
    state,
    openTarot,
    cancelMove,
    loadConsultants,
    backToMenu: () => patch({ stage: 'menu', line: '' }),
    openMenu: () => patch({ menuOpen: true, line: '' }),
    closeMenu: () => patch({ menuOpen: false, line: '' }),
    chooseConsultant,
    submitQuestion,
    next,
    submitFollowup,
    askAnother,
    end,
    changeReader,
    orderCoffee: () => askToPay('coffee'),
    askReading: () => askToPay('reading'),
    cancelCoffee,
    closeFortune,
    confirm,
    cancelConfirm,
    retry,
    leaveTable,
    dropFollowup,
    askBeforeLeaving,
    stay,
    retryInstead,
    leaveAnyway,
    getCoins: () => useCoins.getState().openShop(),
  };
}

export type CafeTable = ReturnType<typeof useCafeTable>;
