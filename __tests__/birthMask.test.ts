/**
 * The birth-date and birth-time typing masks.
 *
 * Inserting the separators is the easy half. The half worth pinning is DELETING them: a mask that
 * simply re-formats whatever arrives puts the separator straight back, and the field reads as
 * frozen at exactly the moment the player is trying to correct a typo.
 */
import { maskBirthDate, maskBirthTime } from '../src/features/subjects/birthMask';

/** Types a string one character at a time, the way a keyboard delivers it. */
const type = (chars: string, mask: (n: string, p: string) => string) =>
  [...chars].reduce((acc, c) => mask(acc + c, acc), '');

/** One backspace, as a TextInput reports it: the value minus its last character. */
const backspace = (value: string, mask: (n: string, p: string) => string) =>
  mask(value.slice(0, -1), value);

describe('maskBirthDate', () => {
  it('puts the dashes in as digits arrive', () => {
    expect(type('19950615', maskBirthDate)).toBe('1995-06-15');
    expect(type('1995', maskBirthDate)).toBe('1995');
    expect(type('19950', maskBirthDate)).toBe('1995-0');
    expect(type('199506', maskBirthDate)).toBe('1995-06');
  });

  it('accepts a date that already has its dashes, and pasted junk', () => {
    expect(maskBirthDate('1995-06-15', '')).toBe('1995-06-15');
    expect(maskBirthDate('1995/06/15', '')).toBe('1995-06-15');
    expect(maskBirthDate('15 June 1995', '')).toBe('1519-95');
  });

  it('stops at a date, however much is typed or pasted', () => {
    expect(type('199506159999', maskBirthDate)).toBe('1995-06-15');
  });

  it('backspaces THROUGH a separator instead of sticking on it', () => {
    // '1995-0' → delete → '1995-' would re-format to '1995-' forever. It must reach '1995'.
    expect(backspace('1995-0', maskBirthDate)).toBe('1995');
    expect(backspace('1995', maskBirthDate)).toBe('199');
    expect(backspace('1995-06-1', maskBirthDate)).toBe('1995-06');
  });

  it('empties completely, so an unwanted value can be cleared', () => {
    let v = '1995-06-15';
    for (let i = 0; i < 20 && v !== ''; i++) v = backspace(v, maskBirthDate);
    expect(v).toBe('');
  });
});

describe('maskBirthTime', () => {
  it('puts the colon in, and stops at a time', () => {
    expect(type('0900', maskBirthTime)).toBe('09:00');
    expect(type('09', maskBirthTime)).toBe('09');
    expect(type('090012', maskBirthTime)).toBe('09:00');
  });

  it('backspaces through the colon', () => {
    expect(backspace('09:0', maskBirthTime)).toBe('09');
  });

  it('leaves blank blank — unknown is a real answer, not an empty one', () => {
    expect(maskBirthTime('', '')).toBe('');
    expect(backspace('0', maskBirthTime)).toBe('');
  });
});
