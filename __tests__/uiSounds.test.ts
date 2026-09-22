import fs from 'fs';
import path from 'path';

/**
 * Every screen that can be pressed either answers the press, or is on this list by name.
 *
 * Home was silent for months and nobody noticed until the user asked. Not because anyone decided
 * it should be — the four bottom tabs, the category chips and the Discover rails simply never got
 * wired, while a counselor card right next to them did. That is the shape of this bug: it is added
 * by omission, it is invisible in review, and the only way to find it is to press every control on
 * a device.
 *
 * So: a file that renders a Pressable must import the sfx module, or appear in SILENT below with a
 * reason. The list is not a blessing — the entries marked "not wired yet" are work, and they are
 * written here so they stay countable instead of dissolving back into the default.
 *
 * What this canNOT check: whether the cue is the RIGHT one, or whether a handler was attached at
 * all. A sound alone does not prove that a control navigates to its destination.
 */
const SRC = path.join(__dirname, '..', 'src');

const SILENT: Record<string, string> = {
  'features/counseling/screens/CounselingRoomScreen.tsx':
    'the room owns its own mix (Unity BGM + voice); RN must not tap over it',
  'features/counseling/screens/UnityEntryScreen.tsx':
    'the handover screen — the next thing the player hears is the room fading up',
  'features/auth/screens/LoginScreen.tsx': 'not wired yet',
  'features/profile/screens/AccountScreen.tsx': 'not wired yet',
  'features/subjects/components/SubjectCard.tsx': 'not wired yet',
  'features/subjects/screens/AddSubjectScreen.tsx': 'not wired yet',
  'features/counseling/components/CueTester.tsx':
    'dev-only cue tester, never in a release bundle — and it fires cues in rows of a dozen, ' +
    'so a tap per press would drown the very performance it exists to let you watch',
};

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.isFile() && e.name.endsWith('.tsx') ? [full] : [];
  });
}

const pressableFiles = walk(SRC)
  .map(f => ({ rel: path.relative(SRC, f).split(path.sep).join('/'), body: fs.readFileSync(f, 'utf8') }))
  .filter(f => /<Pressable|<TouchableOpacity/.test(f.body));

test('the inventory finds something — a broken scan would pass everything', () => {
  expect(pressableFiles.length).toBeGreaterThan(10);
});

test('every pressable screen answers the press, or says why it does not', () => {
  const unexplained = pressableFiles
    .filter(f => !/audio\/sfx/.test(f.body))
    .map(f => f.rel)
    .filter(rel => !(rel in SILENT));

  expect(unexplained).toEqual([]);
});

test('the silent list has no dead entries', () => {
  // A file that got wired, or deleted, must leave the list — otherwise the list slowly becomes a
  // place where things are excused rather than fixed.
  const stale = Object.keys(SILENT).filter(rel => {
    const f = pressableFiles.find(x => x.rel === rel);
    return !f || /audio\/sfx/.test(f.body);
  });

  expect(stale).toEqual([]);
});
