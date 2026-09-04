/**
 * Who the app is for, and when it asks.
 *
 * The rule these pin down is a flow rule, not a data one: the birth details belong to first run,
 * so by the time anyone is choosing a subject every entry in the picker is already pickable. When
 * that broke, it broke quietly — the account holder's own row was the one that could not be
 * chosen, and the consultation button read "enter birth details".
 */
// The store persists through AsyncStorage, whose native module does not exist under jest. The
// mock is in-memory on purpose: persistence is not what these tests are about, and a real one
// would leak state between them.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
    },
  };
});

import { hasBirthData, useSubjectsStore } from '../src/features/subjects/store/subjectsStore';

const reset = () =>
  useSubjectsStore.setState({
    self: { id: 'self', displayName: 'Myself', isUser: true },
  });

describe('hasBirthData', () => {
  it('needs a date AND a gender, because the server defaults a missing gender to male', () => {
    expect(hasBirthData({ id: 'x', displayName: 'A', isUser: false })).toBe(false);
    expect(hasBirthData({ id: 'x', displayName: 'A', birthDate: '1995-06-15', isUser: false })).toBe(
      false,
    );
    expect(
      hasBirthData({ id: 'x', displayName: 'A', birthDate: '1995-06-15', gender: 'female', isUser: false }),
    ).toBe(true);
  });

  it('does not need a birth time — unknown is a real answer', () => {
    expect(
      hasBirthData({ id: 'x', displayName: 'A', birthDate: '1995-06-15', gender: 'male', isUser: false }),
    ).toBe(true);
  });
});

describe('self', () => {
  beforeEach(reset);

  it('starts incomplete, which is what puts first run in front of the app', () => {
    expect(hasBirthData(useSubjectsStore.getState().self)).toBe(false);
  });

  it('is editable, unlike the frozen constant it replaced', () => {
    useSubjectsStore
      .getState()
      .updateSubject('self', { displayName: 'Linh', birthDate: '1995-06-15', gender: 'female' });

    const self = useSubjectsStore.getState().self;
    expect(self.displayName).toBe('Linh');
    expect(hasBirthData(self)).toBe(true);
    // Still self, still the user — updating must not turn it into an ordinary saved person.
    expect(self.id).toBe('self');
    expect(self.isUser).toBe(true);
  });

  it('is what getById and the picker order return, not the default', () => {
    useSubjectsStore.getState().updateSubject('self', { displayName: 'Linh' });
    expect(useSubjectsStore.getState().getById('self')?.displayName).toBe('Linh');
    expect(useSubjectsStore.getState().all()[0].displayName).toBe('Linh');
  });
});

describe('seeded people', () => {
  it('are complete, so the picker never sends the player to a form for them', () => {
    for (const s of useSubjectsStore.getState().subjects) {
      expect(hasBirthData(s)).toBe(true);
    }
  });
});

describe('deferring the first run', () => {
  beforeEach(() => {
    reset();
    useSubjectsStore.setState({ profileDeferred: false });
  });

  it('lets the app past first run without birth data', () => {
    useSubjectsStore.getState().deferProfile();
    const { self, profileDeferred } = useSubjectsStore.getState();
    expect(profileDeferred).toBe(true);
    // Deferred, NOT satisfied: everything that needs a chart must still say so.
    expect(hasBirthData(self)).toBe(false);
  });

  it('clears itself the moment the details are actually given', () => {
    useSubjectsStore.getState().deferProfile();
    useSubjectsStore
      .getState()
      .updateSubject('self', { birthDate: '1995-06-15', gender: 'female' });

    // A deferral that outlived what it deferred would leave first run unreachable while the app
    // still could not read a chart.
    expect(useSubjectsStore.getState().profileDeferred).toBe(false);
  });
});
