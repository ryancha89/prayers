/**
 * Typing masks for the birth fields.
 *
 * The placeholder said `YYYY-MM-DD` and then left the player to type the dashes themselves, on a
 * keyboard where the separator is not where the digits are. The field takes digits now and puts the
 * separators in.
 *
 * THE HARD PART IS BACKSPACE, not the inserting. Re-formatting whatever arrives means deleting a
 * separator immediately puts it back, and the caret sits there refusing to move — the field looks
 * frozen. So a delete that lands on a separator takes the digit before it as well, which is what
 * the separator being automatic implies: it was never the player's character to delete.
 *
 * Both are pure and live outside the screen so this behaviour can be tested without rendering one.
 */

/** Whether this edit removed something, judged by length — the only signal a TextInput gives us. */
const isDeletion = (next: string, previous: string) => next.length < previous.length;

function mask(next: string, previous: string, maxDigits: number, cuts: number[], sep: string) {
  let s = next;
  if (isDeletion(next, previous) && s.endsWith(sep)) s = s.slice(0, -1);

  const digits = s.replace(/\D/g, '').slice(0, maxDigits);

  let out = '';
  let taken = 0;
  for (const cut of [...cuts, maxDigits]) {
    if (taken >= digits.length) break;
    if (out) out += sep;
    out += digits.slice(taken, cut);
    taken = cut;
  }
  return out;
}

/** `19950615` → `1995-06-15`, and never more than a date's worth of digits. */
export const maskBirthDate = (next: string, previous = '') =>
  mask(next, previous, 8, [4, 6], '-');

/** `0900` → `09:00`. Blank stays blank — an unknown time is a real answer, not an empty one. */
export const maskBirthTime = (next: string, previous = '') => mask(next, previous, 4, [2], ':');
