import { createStagePort, engineKey } from '../src/features/counseling/bridge/stagePort';

/**
 * 26-09: the resident Unity player caches synthesised clips BY KEY and replays them without looking
 * at the text, so two rooms asking for `loop_1.0` heard the same clip. Each room's keys carry a
 * nonce; SPEAK_DONE maps back to the engine's own key.
 */
function capture() {
  const sent: any[] = [];
  const bridge = { sendEvent: (e: any) => sent.push(e) } as any;
  return { sent, port: createStagePort(bridge, () => {}) };
}

describe('stage keys', () => {
  it('gives the same engine key a different Unity key in every room', () => {
    const a = capture();
    const b = capture();
    a.port.speakText('안녕', 'loop_1.0');
    b.port.speakText('다른 말', 'loop_1.0');
    const ka = a.sent[0].payload.cacheKey;
    const kb = b.sent[0].payload.cacheKey;
    expect(ka).not.toBe(kb);
    expect(engineKey(ka)).toBe('loop_1.0');
    expect(engineKey(kb)).toBe('loop_1.0');
  });

  it('keeps prefetch and speak on the same Unity key within a room, so a warm take is reused', () => {
    const { sent, port } = capture();
    port.prefetchText('첫 문장', 'P11#0');
    port.speakText('첫 문장', 'P11#0');
    expect(sent[0].payload.cacheKey).toBe(sent[1].payload.cacheKey);
  });

  it('passes a key with no nonce through unchanged', () => {
    expect(engineKey('THINKING')).toBe('THINKING');
  });
});
