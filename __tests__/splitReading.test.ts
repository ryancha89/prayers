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

// 26-09: a long opening sentence kept a Gemini voice silent for 7-9 s. It is cut once more, at a
// breath, so the first sound needs a short synthesis.
test('a long opening sentence is cut at a breath, and nothing is lost', () => {
  const line =
    '지금은 억지로 시스템을 두드리기보다 병오년의 정인 기운을 빌려 공식적인 서류 절차나 인증 과정을 차분히 재검토하며 문서가 확실히 수리될 때를 기다리는 것이 현명합니다. 다음 달에는 흐름이 바뀝니다.';
  const chunks = splitReading(line);
  expect(chunks[0].text.length).toBeLessThanOrEqual(45);
  expect(chunks[0].text).toBe('지금은 억지로 시스템을 두드리기보다 병오년의 정인 기운을 빌려');
  expect(joinChunks(chunks)).toBe(line);
});

test('a short opening is left as it was packed', () => {
  // Under FIRST_MAX nothing is cut (two short sentences still pack together, as before).
  const line = '좋은 흐름입니다. 다음 달에는 흐름이 바뀝니다.';
  expect(splitReading(line)[0].text).toBe(line);
});

test('an opening with nowhere to breathe is not cut mid-phrase', () => {
  const line = 'Abcdefghij'.repeat(8) + '.';
  expect(splitReading(line)[0].text).toBe(line);
});

test('"그래서" opens a clause — it is not a breath after', () => {
  const line = '올해의 큰 흐름부터 봅니다 재물의 자리가 움직이는 해라 들어오는 돈도 커집니다 그래서 버는 것보다 남기는 쪽에 손을 써야 하는 한 해입니다.';
  const head = splitReading(line)[0].text;
  expect(head.endsWith('그래서')).toBe(false);
});
