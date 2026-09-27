import { voiceFor, voiced } from '../src/features/counseling/flow/voice';
import { ui } from '../src/features/counseling/flow/strings';

/**
 * The room's own lines — the waiting beats, the thinking caption, the input prompts — were written
 * once in the mystical register every counselor shared. Out of the career reader's mouth they are
 * somebody else talking, so a specialist speaks a register of her own.
 *
 * What is pinned: the register follows the ROSTER's specialty (not a name, not the topic picked),
 * and an un-overridden key still comes back as the shared copy so nothing goes blank.
 */
describe('counselor register', () => {
  it('gives 고윤정 the direct register — her manner, none of the career lines', () => {
    // She stopped being `career` on 26-09; how she talks follows her persona, not a specialty.
    expect(voiceFor('yunjung_01')).toBe('direct');
    for (const lang of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'vi'] as const) {
      for (const key of ['thinking', 'consult_thinking', 'loop.placeholder', 'loop.wait.2', 'consult_p07_l0']) {
        expect(voiced('direct', key, lang)).not.toMatch(/직업|재물|재성|work|money|仕事|金|事业|事業|财|財|sự nghiệp|tài/i);
      }
    }
    // …and keeps the business register's Vietnamese pronouns.
    expect(voiced('direct', 'consult_p05_l0', 'vi')).toBe(voiced('business', 'consult_p05_l0', 'vi'));
  });

  it('leaves the generalist and the relationship reader on the shared one', () => {
    expect(voiceFor('yuna_01')).toBe('default');
    expect(voiceFor('theo_01')).toBe('default');
    expect(voiceFor(undefined)).toBe('default');
    expect(voiceFor('nobody_99')).toBe('default');
  });

  it('actually changes the lines the player reads while she thinks', () => {
    const shared = ui('thinking', 'en');
    const hers = voiced('business', 'thinking', 'en');

    expect(hers).toBeDefined();
    expect(hers).not.toBe(shared);
    expect(hers).toMatch(/work|money/i);
  });

  it('carries all six languages, so nobody drops into English mid-session', () => {
    for (const lang of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'vi'] as const) {
      expect(voiced('business', 'loop.wait.0', lang)).toBeTruthy();
      expect(voiced('business', 'consult_p07_l0', lang)).toBeTruthy();
    }
  });

  it('says nothing about a key it has no opinion on', () => {
    // The app's own chrome — a mic error is the app talking, and the app has one voice.
    expect(voiced('business', 'mic.error.nodevice', 'en')).toBeUndefined();
    expect(voiced('default', 'thinking', 'en')).toBeUndefined();
  });
});
