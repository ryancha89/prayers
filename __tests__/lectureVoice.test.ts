const mockPlayers: any[] = [];
jest.mock('react-native-sound', () => class {
  static MAIN_BUNDLE = 'bundle';
  load: (error: unknown) => void;
  end?: (ok: boolean) => void;
  play = jest.fn((end: (ok: boolean) => void) => { this.end = end; });
  stop = jest.fn();
  release = jest.fn();
  constructor(_file: string, _base: string, load: (error: unknown) => void) {
    this.load = load;
    mockPlayers.push(this);
  }
});
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
import { playLine, stopLine } from '../src/features/philosophy/lectureVoice';

beforeEach(() => { stopLine(); mockPlayers.length = 0; });
afterEach(() => stopLine());
test('leaving while the file loads prevents delayed playback', () => {
  const advance = jest.fn();
  playLine('line.m4a', advance);
  const player = mockPlayers[0];
  stopLine();
  player.load(null);
  expect(player.play).not.toHaveBeenCalled();
  expect(player.release).toHaveBeenCalled();
  expect(advance).not.toHaveBeenCalled();
});
test('leaving cuts the current take and a late end cannot start the next line', () => {
  const advance = jest.fn();
  playLine('line.m4a', advance);
  const player = mockPlayers[0];
  player.load(null);
  expect(player.play).toHaveBeenCalledTimes(1);
  stopLine();
  expect(player.stop).toHaveBeenCalledTimes(1);
  player.end(true);
  expect(advance).not.toHaveBeenCalled();
});
