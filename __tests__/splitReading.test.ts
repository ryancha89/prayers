/**
 * How a reading is cut into the pieces it is spoken in.
 *
 * The case that put this file here: the counselor opens a returning session by quoting the player's
 * own last question back at them, and a question ends in "?". The splitter took that as the end of
 * her sentence and cut the line in half inside the quotation marks — measured in the room, the
 * bubble showed an unclosed 「 and the voice breathed in the middle of the quote.
 */
import { splitReading, joinChunks } from '../src/features/counseling/flow/splitReading';

test('a quoted question does not end the sentence carrying it', () => {
  const line =
    '지난번에 「How can I recognize whether these earning habits fit me?」 하고 물으셨지요. ' +
    '그 뒤로 어떻게 되었나요?';

  const chunks = splitReading(line);

  expect(chunks[0].text).toContain('」');
  expect(chunks.every(c => !c.text.startsWith('」'))).toBe(true);
  expect(joinChunks(chunks)).toBe(line);
});

test('the same holds for the curly quotes the other languages use', () => {
  const line = 'Last time you asked me, “Should I take the offer?”. How did that turn out?';

  const chunks = splitReading(line);

  expect(chunks[0].text).toContain('”');
  expect(joinChunks(chunks)).toBe(line);
});

test('an apostrophe is still just an apostrophe', () => {
  // ’ closes ‘ — on its own it must not swallow everything after it.
  const line = "It isn't settled yet. Ask again in spring. The year turns in February.";

  const chunks = splitReading(line);

  expect(chunks.length).toBeGreaterThan(1);
  expect(joinChunks(chunks)).toBe(line);
});

test('ordinary sentences are still packed the way they were', () => {
  // The first chunk closes as soon as it is long enough to be worth speaking (FIRST_MIN), so a
  // reading opens on one short sentence and packs the rest.
  const line = 'The year turns in February. Money follows in spring. Wait for it.';

  expect(splitReading(line).map(c => c.text)).toEqual([
    'The year turns in February.',
    'Money follows in spring. Wait for it.',
  ]);
});
