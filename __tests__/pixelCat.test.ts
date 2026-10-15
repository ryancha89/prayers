/**
 * Nabi's stage: the art decodes to what the generator drew, the flow's cues become his gestures,
 * and the face follows the room.
 */
import { CAT_ART } from '../src/features/counseling/pixel/catArt.generated';
import { layersFor } from '../src/features/counseling/pixel/pixelArt';
import { gestureForPhase, withCatCues, CatCue } from '../src/features/counseling/pixel/cues';
import { pickLoop, talkMsFor } from '../src/features/counseling/pixel/PixelCatStage';
import flow from '../src/features/counseling/flow/consultationFlow.json';
import type { StagePort } from '../src/features/counseling/flow/engine';

/** Total pixels a run-length string covers. */
function pixelCount(rle: string): number {
  let n = 0;
  for (const m of rle.matchAll(/[^0-9](\d*)/g)) n += m[1] ? parseInt(m[1], 10) : 1;
  return n;
}

describe('the generated art', () => {
  it('has every frame the stage can ask for, each exactly one sprite in size', () => {
    const size = CAT_ART.room.catSize;
    const needed = [
      'idle', 'talk', 'idle_happy', 'talk_happy', 'idle_concerned', 'talk_concerned',
      'idle_surprised', 'talk_surprised', 'think', 'talk_think', 'listen',
      'wave', 'nod', 'bow', 'surprise', 'explain', 'bless', 'fret',
    ];
    for (const name of needed) {
      const anim = CAT_ART.anims[name];
      expect(anim).toBeDefined();
      anim.frames.forEach(f => expect(pixelCount(f)).toBe(size * size));
    }
    expect(pixelCount(CAT_ART.background)).toBe(CAT_ART.room.w * CAT_ART.room.h);
    CAT_ART.ambient.forEach(f => expect(pixelCount(f)).toBe(CAT_ART.room.w * CAT_ART.room.h));
  });

  it('only uses symbols the palette has', () => {
    const all = [CAT_ART.background, ...CAT_ART.ambient, ...Object.values(CAT_ART.anims).flatMap(a => a.frames)];
    for (const rle of all) {
      for (const ch of rle.replace(/[0-9.]/g, '')) {
        expect(CAT_ART.alphabet.indexOf(ch)).toBeLessThan(CAT_ART.palette.length);
        expect(CAT_ART.alphabet.indexOf(ch)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('turns a frame into one path per colour, covering the same pixels', () => {
    const rle = CAT_ART.anims.idle.frames[0];
    const layers = layersFor(CAT_ART, rle, CAT_ART.room.catSize);
    expect(new Set(layers.map(l => l.index)).size).toBe(layers.length);
    const painted = pixelCount(rle) - [...rle.matchAll(/\.(\d*)/g)].reduce((n, m) => n + (m[1] ? +m[1] : 1), 0);
    const area = layers
      .flatMap(l => [...l.d.matchAll(/h(\d+)v(\d+)/g)])
      .reduce((n, m) => n + +m[1] * +m[2], 0);
    expect(area).toBe(painted);
  });
});

describe('cues', () => {
  it('waves hello, blesses goodbye, and nods along from the script', () => {
    expect(gestureForPhase('P01', [])).toBe('wave');
    expect(gestureForPhase('P20', ['Smile', 'SmallBow'])).toBe('bless');
    expect(gestureForPhase('P03', ['Listen', 'Nod'])).toBe('nod');
    expect(gestureForPhase('P18', ['IdleRelaxed'])).toBeNull();
  });

  it('only names gestures the art has', () => {
    for (const p of (flow as { phases: { id: string; animationTriggers: string[] }[] }).phases) {
      const g = gestureForPhase(p.id, p.animationTriggers);
      if (g) expect(CAT_ART.anims[g]).toBeDefined();
    }
  });

  it('passes staging on to the base port after telling the cat', () => {
    const calls: string[] = [];
    const base = {
      phase: () => calls.push('phase'),
      thinking: () => calls.push('thinking'),
    } as unknown as StagePort;
    const cues: CatCue[] = [];
    const port = withCatCues(base, c => cues.push(c));
    port.phase({ phaseId: 'P01', camera: '', animationTriggers: [], vfx: [], sound: [], spotlight: '', resetVfx: false });
    port.thinking(true);
    expect(cues).toEqual([{ type: 'gesture', gesture: 'wave' }, { type: 'thinking', on: true }]);
    expect(calls).toEqual(['phase', 'thinking']);
  });
});

describe('the face', () => {
  const base = { speaking: false, thinking: false, listening: false, emotion: 'neutral' as const };

  it('thinks before anything else, while the reading is out', () => {
    expect(pickLoop({ ...base, thinking: true, speaking: true, emotion: 'happy' })).toBe('think');
  });

  it('talks in the face the engine says he is making', () => {
    expect(pickLoop({ ...base, speaking: true })).toBe('talk');
    expect(pickLoop({ ...base, speaking: true, emotion: 'concerned' })).toBe('talk_concerned');
    expect(pickLoop({ ...base, speaking: true, emotion: 'thinking' })).toBe('talk_think');
  });

  it('listens when the box is open and he is quiet', () => {
    expect(pickLoop({ ...base, listening: true })).toBe('listen');
    expect(pickLoop({ ...base, emotion: 'happy' })).toBe('idle_happy');
  });

  it('times the mouth by the NEW words only', () => {
    const first = '안녕하세요. 편하게 앉으세요.';
    expect(talkMsFor('', first)).toBeGreaterThanOrEqual(900);
    // a chunk added to a growing answer is timed on the chunk, not the whole answer
    const grown = first + ' 오늘은 무엇이 궁금하세요?';
    expect(talkMsFor(first, grown)).toBe(talkMsFor('', ' 오늘은 무엇이 궁금하세요?'));
    expect(talkMsFor(first, first)).toBe(0);
    expect(talkMsFor('', 'x'.repeat(1000))).toBe(6000);
  });
});
