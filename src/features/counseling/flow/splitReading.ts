/**
 * Break a reading into the pieces it is spoken in.
 *
 * Same rule as Unity's `ConsultationFlowUI.SplitReading` (and the CLI harness's
 * port): sentences first, then packed into ~110-character chunks — except the
 * FIRST chunk, which is deliberately a single sentence. Synthesis time scales
 * with length, and nothing can prefetch the opening line of a fresh answer, so
 * one short sentence starts speaking seconds before a full chunk would.
 *
 * Paragraph breaks are kept as a flag rather than folded away: the transcript
 * bubble that grows chunk by chunk still has to read as the paragraphs the
 * model wrote, not as one run-on block.
 */
export interface ReadingChunk {
  text: string;
  /** This chunk opened a new paragraph in the original text. */
  newParagraph: boolean;
}

const TARGET = 110;
const FIRST_MIN = 15;
const ENDINGS = new Set(['.', '!', '?', '…', '。']);
const TRAILERS = new Set(['"', "'", ')', '”', '’']);

/**
 * Quote marks that must not be split across two chunks.
 *
 * A sentence end INSIDE a quotation is not the end of the sentence carrying it, and the counselor
 * quotes constantly — she opens a returning session by reading the player's own last question back
 * to them, and those end in "?" almost by definition. Split there and the bubble shows an unclosed
 * 「, the voice takes a breath in the middle of the quote, and the closing 」 arrives seconds later
 * attached to the rest of the sentence. Measured in the room on 2026-09-15, first run of recall.
 *
 * Paired marks only. A straight " is both its own opener and closer, so tracking it would make any
 * single apostrophe swallow the rest of the reading — it stays a TRAILER and nothing more.
 */
const QUOTE_PAIRS = new Map([
  ['「', '」'],
  ['『', '』'],
  ['“', '”'],
  ['‘', '’'],
  ['«', '»'],
  ['（', '）'],
]);

function sentences(paragraph: string): string[] {
  const out: string[] = [];
  let cur = '';
  // What is still open, innermost last. A quote inside a quote is rare but costs nothing to allow.
  const open: string[] = [];
  for (let i = 0; i < paragraph.length; i++) {
    const ch = paragraph[i];
    cur += ch;
    if (QUOTE_PAIRS.has(ch)) open.push(QUOTE_PAIRS.get(ch)!);
    else if (open.length > 0 && ch === open[open.length - 1]) open.pop();
    if (ENDINGS.has(ch) && open.length === 0) {
      while (i + 1 < paragraph.length && TRAILERS.has(paragraph[i + 1])) cur += paragraph[++i];
      out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(s => s.length > 0);
}

export function splitReading(text: string): ReadingChunk[] {
  const chunks: ReadingChunk[] = [];
  const paragraphs = text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  paragraphs.forEach((para, pi) => {
    let cur = '';
    let curOpensParagraph = pi > 0;
    const flush = () => {
      if (!cur) return;
      chunks.push({ text: cur, newParagraph: curOpensParagraph });
      cur = '';
      curOpensParagraph = false;
    };
    for (const s of sentences(para)) {
      const closeFirst = chunks.length === 0 && cur.length >= FIRST_MIN;
      if (cur.length > 0 && (closeFirst || cur.length + 1 + s.length > TARGET)) flush();
      cur = cur.length > 0 ? `${cur} ${s}` : s;
    }
    flush();
  });

  if (chunks.length === 0) {
    const whole = text.trim();
    if (whole) chunks.push({ text: whole, newParagraph: false });
  }
  return shortenFirst(chunks);
}

/**
 * The longest opening chunk worth waiting for.
 *
 * A single first sentence was the rule, and with a Gemini voice a first sentence of 80-105
 * characters took 7-9 s to synthesise (measured 26-09, Theo) — the text sat on screen that long in
 * silence. Past this length the opening is cut once more, at a place a speaker would breathe.
 */
export const FIRST_MAX = 45;

/** Where a sentence can be split without the voice sounding cut: a comma, or a Korean connective
 *  ending (…고 / …며 / …서 / …면 / …지만 / …는데 / …니) before a space. */
const BREATH = /(?:[,，、;；]|(?:고|며|서|면|지만|는데|니까|니|보다|려|듯))(?=\s)/g;
/** Sentence-linking adverbs that END in a connective syllable but open a clause — "그래서 …" is
 *  not a place to breathe after. */
const LINKERS = new Set(['그래서', '그러면', '그리고', '그러니', '그러니까', '그렇지만', '그런데', '그러므로']);
/** No breath point inside FIRST_MAX: take the first one up to here rather than none at all. */
const FIRST_FALLBACK_MAX = 70;

/**
 * Split an over-long first chunk at the last breath point inside FIRST_MAX (and past FIRST_MIN,
 * so the opening is not a stub), else at the first one inside FIRST_FALLBACK_MAX. None, no split: cutting mid-phrase costs more in how it
 * sounds than it saves in time. Only the first chunk — later ones are prefetched while earlier
 * ones play, so their length never shows.
 */
function insideQuote(head: string): boolean {
  const open: string[] = [];
  for (const ch of head) {
    if (QUOTE_PAIRS.has(ch)) open.push(QUOTE_PAIRS.get(ch)!);
    else if (open.length > 0 && ch === open[open.length - 1]) open.pop();
  }
  // A straight double quote is its own closer: an odd count means one is still open.
  return open.length > 0 || (head.split('"').length - 1) % 2 === 1;
}

export function shortenFirst<T extends ReadingChunk>(chunks: T[]): T[] {
  const first = chunks[0];
  if (!first || first.text.length <= FIRST_MAX) return chunks;
  // An opening that quotes something — the recall reads the player's own question back — stays
  // whole: the quotation is the point of the line, and it is read as one thought.
  if ([...QUOTE_PAIRS.keys()].some(q => first.text.includes(q)) || first.text.includes('"')) return chunks;
  let cut = -1;
  let fallback = -1;
  for (const m of first.text.matchAll(BREATH)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end < FIRST_MIN) continue;
    // Never inside a quotation — the same rule `sentences` keeps, for the same reason.
    if (insideQuote(first.text.slice(0, end))) continue;
    const word = first.text.slice(first.text.lastIndexOf(' ', end - 1) + 1, end);
    if (LINKERS.has(word)) continue;
    if (end <= FIRST_MAX) cut = end;
    else if (fallback < 0 && end <= FIRST_FALLBACK_MAX) fallback = end;
  }
  if (cut < 0) cut = fallback;
  if (cut < 0) return chunks;
  const head = first.text.slice(0, cut).trim();
  const tail = first.text.slice(cut).trim();
  if (!tail) return chunks;
  return [{ ...first, text: head }, { ...first, text: tail, newParagraph: false }, ...chunks.slice(1)];
}

/** Re-assemble what has been revealed so far, paragraphs and all. */
export function joinChunks(chunks: ReadingChunk[]): string {
  let out = '';
  for (const c of chunks) {
    if (!out) out = c.text;
    else out += (c.newParagraph ? '\n\n' : ' ') + c.text;
  }
  return out;
}
