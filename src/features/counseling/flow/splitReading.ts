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

function sentences(paragraph: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < paragraph.length; i++) {
    const ch = paragraph[i];
    cur += ch;
    if (ENDINGS.has(ch)) {
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
  return chunks;
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
