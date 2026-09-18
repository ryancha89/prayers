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
  it('gives the career reader the business register', () => {
    // yunjung_01 is `career` in the generated roster.
    expect(voiceFor('yunjung_01')).toBe('business');
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
