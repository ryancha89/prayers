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
  orderCoffee,
  type CafeFailure,
  type TarotConsultant,
  type TarotReading,
} from '../api/cafeApi';
import { needsTarotMove, TAROT_TABLE, type CafeIntent } from './intent';

/**
 * What the table sells, in Prayer Coins — mirrored from the contract so the confirmation can name
 * the price and say "not enough" before anything is sent. The SERVER charges, and its answer (a
 * 402 with the balance) wins over these numbers.
 */
export const CAFE_PRICE = { reading: 30, followup: 10, coffee: 30 } as const;
export type CafePaid = keyof typeof CAFE_PRICE;

/** Magic Seven. */
export const SPREAD_SIZE = 7;

/** How long after the seventh card the reading waits for Unity's last CAFE_CARD_REVEALED before it
 *  counts the cards as turned anyway: the flip of all seven takes ~20 s, and a flip that never reports
 *  must not leave the player looking at "Turning the cards over…". */
export const REVEAL_FALLBACK_MS = 30000;

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

export interface TableState {
  /** CAFE_SEATED came and the player has not stood up since. Everything below needs it. */
  seated: boolean;
  /** The table they sit at (CAFE_SEATED.spot). */
  spot: string;
  stage: TableStage;
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
  error: TableError | null;
  fortune: string | null;
}

const OFF: TableState = {
  seated: false,
  spot: '',
  stage: 'menu',
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
  error: null,
  fortune: null,
};

/** Stages with a reader at (or on the way to) the table — the ones End is offered in. */
const TAROT_STAGES = new Set<TableStage>(['arriving', 'asking', 'spreading', 'picking', 'reading', 'presenting', 'followup']);
export const inTarot = (s: TableState) => s.seated && TAROT_STAGES.has(s.stage);

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

/**
 * The table service of spec 007 — tarot with an AI reader, coffee with a fortune cookie — as one
 * state machine over the cafe's bridge. RN owns every word and every server call; Unity is told only
 * what to stage, and only after the server has said yes to anything paid.
 *
 * Results that come back after the player has moved on (End, standing up) are dropped by
 * generation: `gen` moves on every reset, and an answer from an older one is not this table's.
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
  /** All seven are face up (Unity's last CAFE_CARD_REVEALED, or the fallback): narration may start. */
  const revealed = useRef(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReveal = () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = null;
  };
  useEffect(() => () => clearReveal(), []);

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

  /** What the player came for (the cafe's choice sheet), served the moment they first sit (once): the coffee's
   *  confirmation, or — at the tarot table — the list of readers. Null = the menu, as before. */
  const arrival = useRef<CafeIntent | null>(null);
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
   *  the barista walks them over (CAFE_SIT while seated = a move), and the readers open there. */
  const openTarot = () => {
    const s = ref.current;
    if (!needsTarotMove(s.spot, spots.current)) { listReaders(); return; }
    ref.current = { ...s, stage: 'moving', line: '', error: null };
    patch({ stage: 'moving', line: '', error: null });
    bridge.sendCafeSit(TAROT_TABLE, true);
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
    if (step < SPREAD_SIZE) {
      const card = reading.cards[step];
      // The model usually opens the meaning with the card's name already; say it once.
      const named = card.meaning.toLowerCase().includes(card.name.toLowerCase());
      speak({ slot: step, text: named ? card.meaning : `${card.name}. ${card.meaning}`, mood: 'explain' });
    } else if (step === STEP_OVERALL) {
      speak({ text: reading.overall, mood: 'explain' });
    } else {
      speak({ text: reading.advice, mood: 'warm' });
    }
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
      patch({ busy: false, error: r.kind });
      return;
    }
    endIntent();
    const reading = r.reading;
    ref.current = { ...ref.current, reading, stage: 'presenting', step: -1 };
    patch({ busy: false, reading, stage: 'presenting', step: -1 });
    // The cards started turning when the seventh was picked; a repeat is ignored by Unity (and covers
    // an early REVEAL that was lost). The reading starts once all seven are face up.
    bridge.sendCafeTarotReveal(reading.cards.map(c => ({ id: c.id, orientation: c.orientation, name: c.name })));
    if (revealed.current) showStep(0);
  };

  /** Spec step 4: "once all seven cards are selected, the cards flip face up" — at once, while the
   *  server reads them (~15 s). They used to wait for the reading, face down under "Reading…". */
  const startReveal = (chosen: CafeCard[]) => {
    revealed.current = false;
    bridge.sendCafeTarotReveal(chosen.map(c => ({ id: c.id, orientation: c.orientation, name: '' })));
    clearReveal();
    const g = gen.current;
    revealTimer.current = setTimeout(() => {
      revealTimer.current = null;
      if (g === gen.current) allTurned();
    }, REVEAL_FALLBACK_MS);
  };
  const allTurned = () => {
    clearReveal();
    revealed.current = true;
    if (ref.current.stage === 'presenting' && ref.current.step < 0) showStep(0);
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
      patch({ busy: false, error: r.kind });
      return;
    }
    endIntent();
    setState(prev => ({ ...prev, busy: false, followups: [...prev.followups, { q: prev.pending, a: r.answer }], pending: '' }));
    speak({ text: r.answer, mood: 'explain' });
  };

  /** End the reading, at any point: the reader says goodbye and leaves; the player stays seated. */
  const end = () => {
    if (!inTarot(ref.current)) return;
    gen.current += 1;
    clearReveal();
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

  /* ---- coffee -------------------------------------------------------------------------------- */

  const runCoffee = async () => {
    const g = gen.current;
    patch({ stage: 'brewing', busy: true, error: null });
    const r = await orderCoffee({ requestId: keyFor('coffee'), lang: langRef.current });
    if (g !== gen.current) return;
    if (!r.ok) {
      settle(r);
      patch({ busy: false, error: r.kind });
      return;
    }
    endIntent();
    patch({ busy: false, fortune: r.fortune, stage: 'serving' });
    bridge.sendCafeCoffeeOrder();
    bridge.sendCafeCookieFortune(r.fortune);
  };

  /** Back to the menu from a coffee that failed. An unanswered order keeps its request_id, so the
   *  next "Order Coffee" is the same purchase to the ledger if the first one did go through. */
  const cancelCoffee = () => {
    if (ref.current.stage !== 'brewing' || ref.current.busy) return;
    patch({ stage: 'menu', error: null, line: '' });
  };

  const closeFortune = () => patch({ stage: 'menu', fortune: null, line: '' });

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

  const leaveTable = () => {
    gen.current += 1;
    clearReveal();
    setState(OFF);
    bridge.sendCafeStand();
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
            if (s.stage !== 'moving') break;
            ref.current = { ...s, spot, stage: 'menu' };
            patch({ spot, stage: 'menu' });
            if (spot === TAROT_TABLE) listReaders();
            break;
          }
          const seated = { ...OFF, seated: true, spot };
          ref.current = seated;
          setState(seated);
          const want = arrival.current;
          arrival.current = null;
          if (want?.kind === 'coffee') askToPay('coffee');
          // Came for a reading and chose another table: the menu; Tarot there walks them over.
          else if (want?.kind === 'tarot' && !needsTarotMove(spot, spots.current)) listReaders();
          break;
        }
        case 'CAFE_PHASE':
          // On foot again: whatever the table was doing is over.
          if (e.payload?.phase === 'exploring' && s.seated) {
            gen.current += 1;
            clearReveal();
            setState(OFF);
          } else if (e.payload?.phase === 'talking' && e.payload.reason === 'busy' && s.stage === 'moving') {
            // The tarot table is taken: still seated where they were, at the menu.
            ref.current = { ...s, stage: 'menu' };
            patch({ stage: 'menu' });
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
            startReveal(chosen);
            runReading();
          }
          break;
        }
        case 'CAFE_CARD_REVEALED':
          if (Number(e.payload?.slot) === SPREAD_SIZE - 1 && !revealed.current) allTurned();
          break;
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
    /** What the player came for, for the first CAFE_SEATED of the visit (null clears it). */
    expect: (want: CafeIntent | null) => { arrival.current = want; },
    openTarot,
    loadConsultants,
    backToMenu: () => patch({ stage: 'menu', line: '' }),
    chooseConsultant,
    submitQuestion,
    next,
    submitFollowup,
    end,
    orderCoffee: () => askToPay('coffee'),
    askReading: () => askToPay('reading'),
    cancelCoffee,
    closeFortune,
    confirm,
    cancelConfirm,
    retry,
    leaveTable,
    getCoins: () => useCoins.getState().openShop(),
  };
}

export type CafeTable = ReturnType<typeof useCafeTable>;
