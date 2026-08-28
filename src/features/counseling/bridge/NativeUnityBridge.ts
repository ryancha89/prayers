import {
  RNToUnityEvent,
  UnityBridge,
  UnitySessionPayload,
  UnityToRNEvent,
} from '../types';

/**
 * Real Unity bridge backed by @azesmway/react-native-unity (spec §39, §41).
 *
 * Transport model:
 *  - RN → Unity: `UnityView.postMessage('RNBridge', 'OnMessage', json)` — the
 *    Unity project has an `RNBridge` GameObject whose `OnMessage(string)`
 *    receives every event.
 *  - Unity → RN: Unity calls NativeAPI.sendMessageToMobileApp(json), delivered
 *    here via `UnityHost`'s onUnityMessage → `receiveFromUnity`.
 *
 * Lifecycle: `openCounselingRoom` only records the session payload — Unity
 * actually boots when a `UnityHost` mounts and registers its view ref. On the
 * UNITY_READY handshake we auto-send SESSION_INIT and flush anything queued,
 * so callers can `sendEvent` at any time without caring about boot order
 * (latency masking: the greeting request runs while Unity is still loading).
 */

/** Minimal surface of the UnityView ref we depend on. */
export interface UnityViewLike {
  postMessage(gameObject: string, methodName: string, message: string): void;
}

const BRIDGE_OBJECT = 'RNBridge';
const BRIDGE_METHOD = 'OnMessage';

export class NativeUnityBridge implements UnityBridge {
  private handlers = new Set<(e: UnityToRNEvent) => void>();
  private view: UnityViewLike | null = null;
  private ready = false;
  /** Unity booted at least once this process — iOS UaaL never truly unloads,
   *  so a re-entry RESUMES that instance and no spontaneous UNITY_READY comes. */
  private everReady = false;
  private initSent = false;
  private payload?: UnitySessionPayload;
  private outbox: RNToUnityEvent[] = [];

  /* ---- UnityBridge ---- */

  async openCounselingRoom(payload: UnitySessionPayload): Promise<void> {
    this.payload = payload;
    this.initSent = false;
    // Resume path: the surviving Unity instance won't announce itself, so WE
    // open the session — it reloads the consult scene and re-sends UNITY_READY.
    if (this.view && this.everReady) {
      this.post({ type: 'SESSION_INIT', payload });
      this.initSent = true;
    }
  }

  sendEvent(event: RNToUnityEvent): void {
    if (!this.ready) {
      this.outbox.push(event);
      return;
    }
    this.post(event);
  }

  onEvent(handler: (event: UnityToRNEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async closeCounselingRoom(): Promise<void> {
    // Silence Unity NOW — the view unload that follows is asynchronous, and a
    // BGM outliving the room (or an error exit) is exactly the bug this guards.
    if (this.view) this.post({ type: 'SESSION_END' });
    this.ready = false;
    this.outbox = [];
    this.payload = undefined;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /**
   * A previous JS context booted Unity and this one inherited it (Metro
   * reload). The native UnityLifecycle module already silenced it; recording
   * everReady makes the next room entry take the resume path (SESSION_INIT on
   * registerView) instead of waiting forever for a UNITY_READY.
   */
  markSurvivor(): void {
    this.everReady = true;
  }

  /* ---- Wiring used by UnityHost ---- */

  registerView(view: UnityViewLike): void {
    this.view = view;
    // Resume path — the host just re-mounted over the surviving Unity
    // instance; open the session now (see openCounselingRoom).
    if (this.everReady && this.payload && !this.initSent) {
      this.post({ type: 'SESSION_INIT', payload: this.payload });
      this.initSent = true;
    }
  }

  unregisterView(view: UnityViewLike): void {
    if (this.view === view) {
      this.view = null;
      this.ready = false;
    }
  }

  /**
   * Best-effort global mute — sent whenever the app is anywhere but the
   * consultation room (navigation guard in App.tsx). Idempotent; a no-op
   * when Unity was never booted.
   */
  stopAllAudio(): void {
    try {
      if (this.view) this.post({ type: 'SESSION_END' });
    } catch {}
  }

  /** Raw JSON string arriving from Unity via onUnityMessage. */
  receiveFromUnity(raw: string): void {
    let event: UnityToRNEvent;
    try {
      event = JSON.parse(raw) as UnityToRNEvent;
    } catch {
      console.warn('[NativeUnityBridge] non-JSON message from Unity:', raw);
      return;
    }

    if (event.type === 'UNITY_READY') {
      this.ready = true;
      this.everReady = true;
      if (!this.initSent && this.payload) {
        this.post({ type: 'SESSION_INIT', payload: this.payload });
        this.initSent = true;
      }
      const queued = this.outbox;
      this.outbox = [];
      queued.forEach(e => this.post(e));
    }

    this.handlers.forEach(h => h(event));
  }

  private post(event: RNToUnityEvent): void {
    if (!this.view) {
      this.outbox.push(event);
      return;
    }
    this.view.postMessage(BRIDGE_OBJECT, BRIDGE_METHOD, JSON.stringify(event));
  }
}
