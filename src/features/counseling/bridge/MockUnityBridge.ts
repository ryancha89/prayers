import {
  RNToUnityEvent,
  UnityBridge,
  UnitySessionPayload,
  UnityToRNEvent,
} from '../types';

/**
 * JS-only stand-in for the real native Unity bridge (spec §39, §51-P5).
 *
 * The real bridge will forward `sendEvent` to the embedded Unity view and
 * surface Unity → RN events (UNITY_READY, USER_MESSAGE, EXIT_SESSION) through
 * `onEvent`. Until native integration lands, the mock counseling screen drives
 * the same event contract so the entire flow works end-to-end (spec §50).
 *
 * Keep this the ONLY place that knows Unity is not yet real. UI code depends
 * solely on the `UnityBridge` interface (rule §52-7).
 */
export class MockUnityBridge implements UnityBridge {
  private handlers = new Set<(e: UnityToRNEvent) => void>();
  private ready = false;
  private lastPayload?: UnitySessionPayload;
  private lastEventType?: string;

  async openCounselingRoom(payload: UnitySessionPayload): Promise<void> {
    this.ready = false;
    // Simulate Unity boot + scene load, then announce readiness (spec §41).
    await new Promise<void>(resolve => setTimeout(resolve, 900));
    this.ready = true;
    this.lastPayload = payload;
    this.emitToRN({ type: 'UNITY_READY' });
    // A real bridge would SESSION_INIT into Unity here; the mock room reads the
    // payload directly from navigation params instead.
  }

  sendEvent(event: RNToUnityEvent): void {
    // In the mock, RN → Unity events are consumed by the mock room component,
    // which subscribes via a shared emitter. No-op transport here.
    this.lastEventType = event.type;
  }

  onEvent(handler: (event: UnityToRNEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async closeCounselingRoom(): Promise<void> {
    this.ready = false;
    this.handlers.clear();
  }

  /** Test/mock helper — lets the mock room raise Unity → RN events. */
  emitToRN(event: UnityToRNEvent): void {
    this.handlers.forEach(h => h(event));
  }

  get isReady(): boolean {
    return this.ready;
  }
}
