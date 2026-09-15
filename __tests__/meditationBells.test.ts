import fs from 'fs';
import path from 'path';

/**
 * The two bells, pinned where they can be checked without ears.
 *
 * A ten-minute session's opening and closing sounds are the hardest thing in this app to verify by
 * hand: the first needs a build and a quiet room, the second needs ten minutes of sitting there.
 * So the parts that CAN be checked are checked here — that the files exist and are bundled, that
 * the room reaches for them at the two edges, and that the end bell is not quietly the same sound
 * as the start.
 */
const ROOT = path.join(__dirname, '..');
const SOUNDS = path.join(ROOT, 'src', 'shared', 'assets', 'sounds');
const SCREEN = path.join(ROOT, 'src', 'features', 'meditation', 'screens', 'MeditationRoomScreen.tsx');

describe('the meditation bells', () => {
  it('ships both files', () => {
    for (const f of ['med_bell_in.m4a', 'med_bell_out.m4a']) {
      const p = path.join(SOUNDS, f);
      expect(fs.existsSync(p)).toBe(true);
      // A bowl rings for seconds; anything this small is a UI tick that got misnamed.
      expect(fs.statSync(p).size).toBeGreaterThan(20_000);
    }
  });

  it('links them natively, or the app plays silence and warns', () => {
    // react-native-asset writes this manifest; a file missing from it is bundled nowhere.
    const manifest = fs.readFileSync(path.join(ROOT, 'ios', 'link-assets-manifest.json'), 'utf8');
    expect(manifest).toContain('med_bell_in.m4a');
    expect(manifest).toContain('med_bell_out.m4a');
  });

  it('rings one at the start and the other at the end', () => {
    const screen = fs.readFileSync(SCREEN, 'utf8');
    const begin = screen.slice(screen.indexOf('const begin ='), screen.indexOf('const pause ='));
    expect(begin).toContain('sfx.bellIn()');
    // The end bell belongs to the `done` effect, not to a button: the session ends itself.
    const doneEffect = screen.slice(screen.indexOf("if (state.status !== 'done')"));
    expect(doneEffect.slice(0, 400)).toContain('sfx.bellOut()');
  });

  it('does not open and close on the same sound', () => {
    const inBell = fs.statSync(path.join(SOUNDS, 'med_bell_in.m4a')).size;
    const outBell = fs.statSync(path.join(SOUNDS, 'med_bell_out.m4a')).size;
    expect(outBell).toBeGreaterThan(inBell); // lower and longer, by design
  });
});
