import { devlog } from '../../../shared/devlog';
import {
  MeditationStatePayload,
  JourneyInitPayload,
  JourneyStatePayload,
  JourneyVoicePayload,
  MyRoomBridge,
  MyRoomCamera,
  MyRoomInitPayload,
  RNToUnityEvent,
  UnityBridge,
  UnitySessionPayload,
  UnityToRNEvent,
  ViewInsetsPayload,
  WorldBridge,
  WorldInitPayload,
  WorldZone,
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
 * actually boots when a `UnityHost` mounts and registers its view ref. The
 * handshake then has two halves, and they mean different things:
 *   BRIDGE_READY — the player is up and empty. We answer with SESSION_INIT,
 *                  which is what makes it load the room.
 *   UNITY_READY  — the room is up and the counselor seated. Only now do stage
 *                  commands land, so this is what flips `ready` and flushes.
 * Callers can `sendEvent` at any time without caring about boot order (latency
 * masking: the greeting request runs while Unity is still loading).
 */

/** Minimal surface of the UnityView ref we depend on. */
export interface UnityViewLike {
  postMessage(gameObject: string, methodName: string, message: string): void;
}

const BRIDGE_OBJECT = 'RNBridge';
const BRIDGE_METHOD = 'OnMessage';

/** How long to wait for an answer before saying SESSION_INIT again, and how many times.
 *  Three goes over 4.5 s sits well inside the screen's own 30 s deadline, so the retries are
 *  invisible when they work and cost nothing when the player really is not there. */
const INIT_RETRY_MS = 1500;
const INIT_MAX_TRIES = 3;
/** MEDITATION_INIT is repeated until the room answers — see openMeditationRoom. */
const MEDITATION_RETRY_MS = 1500;
const MEDITATION_MAX_TRIES = 4;

/** Absolute-state messages sent while a finger moves: coalesced (see NativeUnityBridge.postStream). */
const STREAM_TYPES = new Set<string>(['WALK_INPUT', 'WORLD_CAMERA', 'MYROOM_CAMERA', 'JOURNEY_LOOK', 'JOURNEY_ZOOM']);
/** ~30 a second per type: smooth under Unity's own easing, a quarter of what a thumb produced. */
const STREAM_MS = 33;

export class NativeUnityBridge implements UnityBridge, WorldBridge, MyRoomBridge {
  private handlers = new Set<(e: UnityToRNEvent) => void>();
  private view: UnityViewLike | null = null;
  private ready = false;
  /** Unity booted at least once this process — iOS UaaL never truly unloads,
   *  so a re-entry RESUMES that instance and no spontaneous UNITY_READY comes. */
  private everReady = false;
  private initSent = false;
  /** Retry timer for the handshake below, and how many goes it has had. */
  private initRetry: ReturnType<typeof setTimeout> | null = null;
  private initTries = 0;
  private payload?: UnitySessionPayload;
  /** A meditation room has been asked for and has not answered yet. The consultation path tracks
   *  the same thing through `payload`; this room has no payload to track it with. */
  private meditationPending = false;
  private meditationRetry: ReturnType<typeof setTimeout> | null = null;
  private meditationTries = 0;
  /** The last session state sent to the room, re-sent when the room answers: Begin can be pressed
   *  while the scene is still loading, and that message reaches a room that is not there yet. */
  private meditationState?: MeditationStatePayload;
  /** The train journey cabin: the same open-until-answered rule as the meditation room. */
  private journeyInit?: JourneyInitPayload;
  private journeyPending = false;
  private journeyRetry: ReturnType<typeof setTimeout> | null = null;
  private journeyTries = 0;
  private journeyState?: JourneyStatePayload;
  private journeyVoice?: JourneyVoicePayload;
  /** 0 = the wide framing the cabin starts on (TrainJourneyDirector.StartZoom). */
  private journeyZoom = 0;
  /** The player's look-around, -1..1 each (0,0 = straight ahead). */
  private journeyLook = { yaw: 0, pitch: 0 };
  /** The world hub (spec 004): the same open-until-answered rule as the cabin. */
  private worldInit?: WorldInitPayload;
  private worldPending = false;
  private worldRetry: ReturnType<typeof setTimeout> | null = null;
  private worldTries = 0;
  /** The player's last camera and run toggle, replayed on WORLD_READY — a pinch made while the hub
   *  was loading landed on nothing. `null` camera = never touched: Unity keeps its own framing. */
  private worldCamera: { zoom: number; yaw: number; pitch: number } | null = null;
  private worldRun = false;
  /** The sound switches as last sent; null = never sent (Unity plays at its defaults). */
  private worldAudio: { music: boolean; sfx: boolean } | null = null;
  /** My Room (the world's 개인실 door): the same open-until-answered rule as the world. */
  private myRoomInit?: MyRoomInitPayload;
  private myRoomPending = false;
  private myRoomRetry: ReturnType<typeof setTimeout> | null = null;
  private myRoomTries = 0;
  /** The player's last orbit, replayed on MYROOM_READY. null = never touched: Unity's overview. */
  private myRoomCamera: MyRoomCamera | null = null;
  private outbox: RNToUnityEvent[] = [];
  /** The latest VIEW_INSETS any Unity-hosting screen reported, and the JSON of the last one that
   *  actually went out (the dedupe key). */
  private viewInsets?: ViewInsetsPayload;
  private viewInsetsPosted = '';

  /* ---- UnityBridge ---- */

  async openCounselingRoom(payload: UnitySessionPayload): Promise<void> {
    this.payload = payload;
    this.initSent = false;
    this.initTries = 0;
    // Resume path: the surviving Unity instance won't announce itself, so WE
    // open the session — it reloads the consult scene and re-sends UNITY_READY.
    if (this.view && this.everReady) this.sendInit('resume');
    this.armInitRetry();
  }

  /**
   * Say SESSION_INIT again when nobody has answered.
   *
   * ⚠️ THE HANDSHAKE HAS A RACE, AND IT COSTS THE WHOLE ROOM. Both paths that open a session are
   * conditional on state that arrives asynchronously: `everReady` is set by the native
   * `silenceSurvivingUnity()` PROMISE, and `view` by a React mount. Enter the room in the window
   * before either lands and no SESSION_INIT is ever sent — no BRIDGE_READY is coming either,
   * because the surviving player announced itself to a JS context that no longer exists. Nothing
   * fails, nothing logs: the veil sits there until the screen's 30 s deadline gives up and walks
   * the player out. Seen on device 18-09, and the log is one line long — "the player never answered
   * SESSION_INIT".
   *
   * So the opening is repeated rather than assumed. It is safe to repeat: SESSION_INIT is what
   * loads the room, and re-sending it before the room exists loads it once; after UNITY_READY the
   * retry is cancelled, so it can never reload a session that is already running.
   *
   * ⚠️ IT STOPS AT THE FIRST WORD BACK, not at UNITY_READY. Anything arriving from Unity proves the
   * transport works and the player is listening, and the room takes 5-8 s to load after it answers
   * BRIDGE_READY — re-sending SESSION_INIT during that load would restart the scene load every 1.5 s
   * and the room would never finish coming up. A player that answers and then stalls is the screen
   * deadline's problem, not this one's.
   *
   * Three goes, 1.5 s apart, then it stops and leaves the screen's deadline to do the honest thing.
   */
  private armInitRetry(): void {
    this.clearInitRetry();
    this.initRetry = setTimeout(() => {
      this.initRetry = null;
      if (this.ready || !this.payload || !this.view) return;
      if (this.initTries >= INIT_MAX_TRIES) {
        devlog(`[unity-bridge] no answer after ${this.initTries} SESSION_INIT(s) — giving the room back`);
        return;
      }
      this.sendInit(this.initSent ? 'retry' : 'first');
      this.armInitRetry();
    }, INIT_RETRY_MS);
  }

  private clearInitRetry(): void {
    if (this.initRetry !== null) {
      clearTimeout(this.initRetry);
      this.initRetry = null;
    }
  }

  private sendInit(why: string): void {
    if (!this.payload) return;
    this.initTries += 1;
    this.initSent = true;
    devlog(`[unity-bridge] SESSION_INIT (${why}, try ${this.initTries})`);
    this.post({ type: 'SESSION_INIT', payload: this.payload });
  }

  sendEvent(event: RNToUnityEvent): void {
    if (!this.ready) {
      this.outbox.push(event);
      return;
    }
    this.postLive(event);
  }

  onEvent(handler: (event: UnityToRNEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Open the meditation room.
   *
   * POSTS DIRECTLY rather than going through sendEvent, and that is the whole reason this method
   * exists. `sendEvent` queues anything sent before `ready`, and `ready` is set by UNITY_READY —
   * a message the meditation room never sends, because it has no counselor to be ready with. Sent
   * the ordinary way, MEDITATION_INIT would sit in the outbox forever and the room would never
   * open, with nothing in the log to say why.
   *
   * No payload, no retry, no ticket. If the view is not mounted yet the message is queued by
   * `post` and flushed when it is — the same path SESSION_INIT already relies on.
   */
  openMeditationRoom(): void {
    this.meditationPending = true;
    this.meditationTries = 0;
    this.meditationState = undefined;
    devlog('[unity-bridge] MEDITATION_INIT');
    this.post({ type: 'MEDITATION_INIT' });
    this.armMeditationRetry();
  }

  /**
   * ⚠️ REPEATED UNTIL MEDITATION_READY, because the first one can be lost with nothing to resend it.
   * Measured 24-09: straight from a consultation to the meditation tab, MEDITATION_INIT went to the
   * view the consultation was leaving, Unity did not reboot (so no BRIDGE_READY), and the room stayed
   * on its fallback photo for the whole session. Unity's StartMeditation is idempotent — a repeat
   * that lands on a room already open is answered with MEDITATION_READY and nothing reloads.
   */
  private armMeditationRetry(): void {
    this.clearMeditationRetry();
    this.meditationRetry = setTimeout(() => {
      this.meditationRetry = null;
      if (!this.meditationPending || !this.view) return;
      if (this.meditationTries >= MEDITATION_MAX_TRIES) {
        devlog(`[unity-bridge] no MEDITATION_READY after ${this.meditationTries} retries — staying on the photo`);
        return;
      }
      this.meditationTries += 1;
      devlog(`[unity-bridge] MEDITATION_INIT (retry ${this.meditationTries})`);
      this.post({ type: 'MEDITATION_INIT' });
      this.armMeditationRetry();
    }, MEDITATION_RETRY_MS);
  }

  private clearMeditationRetry(): void {
    if (this.meditationRetry !== null) {
      clearTimeout(this.meditationRetry);
      this.meditationRetry = null;
    }
  }

  /** Tell the room what the session is doing. Posted straight away when there is a view (the room
   *  keeps the latest even if its scene is still loading) and remembered for MEDITATION_READY. */
  sendMeditationState(payload: MeditationStatePayload): void {
    this.meditationState = payload;
    if (this.view) this.post({ type: 'MEDITATION_STATE', payload });
  }

  /**
   * Open the train journey cabin (spec 003). Posts directly and repeats until JOURNEY_READY, for
   * exactly the reasons openMeditationRoom gives — this room never sends UNITY_READY either.
   */
  openJourneyRoom(init: JourneyInitPayload): void {
    this.journeyInit = init;
    this.journeyPending = true;
    this.journeyTries = 0;
    this.journeyState = undefined;
    devlog(`[unity-bridge] JOURNEY_INIT ${init.counselorId}`);
    this.post({ type: 'JOURNEY_INIT', payload: init });
    this.armJourneyRetry();
  }

  private armJourneyRetry(): void {
    this.clearJourneyRetry();
    this.journeyRetry = setTimeout(() => {
      this.journeyRetry = null;
      if (!this.journeyPending || !this.view || !this.journeyInit) return;
      if (this.journeyTries >= MEDITATION_MAX_TRIES) {
        devlog(`[unity-bridge] no JOURNEY_READY after ${this.journeyTries} retries — staying on the drawn window`);
        return;
      }
      this.journeyTries += 1;
      devlog(`[unity-bridge] JOURNEY_INIT (retry ${this.journeyTries})`);
      this.post({ type: 'JOURNEY_INIT', payload: this.journeyInit });
      this.armJourneyRetry();
    }, MEDITATION_RETRY_MS);
  }

  private clearJourneyRetry(): void {
    if (this.journeyRetry !== null) {
      clearTimeout(this.journeyRetry);
      this.journeyRetry = null;
    }
  }

  /** The whole cabin state. Remembered and re-sent on JOURNEY_READY, since it can be sent while
   *  the scene is still loading. */
  sendJourneyState(payload: JourneyStatePayload): void {
    this.journeyState = payload;
    if (this.view) this.post({ type: 'JOURNEY_STATE', payload });
  }

  /** The cabin camera's zoom, 0..1. Posted straight through (a pinch is many messages a second and
   *  a late one is worthless), and remembered for JOURNEY_READY. */
  sendJourneyZoom(zoom: number): void {
    this.journeyZoom = Math.max(0, Math.min(1, zoom));
    if (this.view) this.postLive({ type: 'JOURNEY_ZOOM', payload: { zoom: this.journeyZoom } });
  }

  /** "Board the train" on the platform. Only offered once the cabin is up, so no replay is needed. */
  sendJourneyBoard(): void {
    if (this.view) this.post({ type: 'JOURNEY_BOARD' });
  }

  /** The player turning the cabin camera (one-finger drag), -1..1 each: + = right / up. Posted and
   *  remembered exactly like the zoom. */
  sendJourneyLook(yaw: number, pitch: number): void {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    this.journeyLook = { yaw: clamp(yaw), pitch: clamp(pitch) };
    if (this.view) this.postLive({ type: 'JOURNEY_LOOK', payload: this.journeyLook });
  }

  /** The chapter voice's loudness envelope. Remembered and re-sent on JOURNEY_READY with the
   *  state: the first chapter can start while the cabin is still loading. */
  sendJourneyVoice(payload: JourneyVoicePayload): void {
    this.journeyVoice = payload;
    if (this.view) this.post({ type: 'JOURNEY_VOICE', payload });
  }

  /**
   * How much of the UnityView the app's UI covers (see ViewInsetsPayload).
   *
   * Posted straight through like the zoom — it is not a stage command and must not wait in the
   * outbox for a UNITY_READY that the meditation room and the cabin never send. DEDUPLICATED: an
   * onLayout fires for every panel that so much as re-measures, and the same four numbers again
   * would make the room re-solve its framing for nothing. REPLAYED on every room's READY, because the
   * first layout of a screen happens while its scene is still loading and that message lands on a
   * room that is not there yet.
   */
  sendViewInsets(insets: ViewInsetsPayload): void {
    this.viewInsets = { ...insets };
    const key = JSON.stringify(this.viewInsets);
    if (!this.view || key === this.viewInsetsPosted) return;
    this.viewInsetsPosted = key;
    this.post({ type: 'VIEW_INSETS', payload: this.viewInsets });
  }

  /** The room just came up: say the insets again even if they have not changed — the room that was
   *  told last time is not the one listening now. */
  private replayViewInsets(): void {
    if (!this.viewInsets) return;
    this.viewInsetsPosted = JSON.stringify(this.viewInsets);
    this.post({ type: 'VIEW_INSETS', payload: this.viewInsets });
  }

  /**
   * Open the world hub (spec 004). Posts directly and repeats until WORLD_READY, for exactly the
   * reasons openMeditationRoom gives — the hub never sends UNITY_READY either. The camera and the
   * run toggle of a previous visit are forgotten: a new visit starts on Unity's framing, walking.
   */
  openWorld(init: WorldInitPayload): void {
    this.worldInit = init;
    this.worldPending = true;
    this.worldTries = 0;
    this.worldCamera = null;
    this.worldRun = false;
    devlog(`[unity-bridge] WORLD_INIT ${init.zone ?? (init.spawn ? 'spawn' : 'plaza')}`);
    this.post({ type: 'WORLD_INIT', payload: init });
    this.armWorldRetry();
  }

  private armWorldRetry(): void {
    this.clearWorldRetry();
    this.worldRetry = setTimeout(() => {
      this.worldRetry = null;
      if (!this.worldPending || !this.view || !this.worldInit) return;
      if (this.worldTries >= MEDITATION_MAX_TRIES) {
        devlog(`[unity-bridge] no WORLD_READY after ${this.worldTries} retries — staying on the drawn hub`);
        return;
      }
      this.worldTries += 1;
      devlog(`[unity-bridge] WORLD_INIT (retry ${this.worldTries})`);
      this.post({ type: 'WORLD_INIT', payload: this.worldInit });
      this.armWorldRetry();
    }, MEDITATION_RETRY_MS);
  }

  private clearWorldRetry(): void {
    if (this.worldRetry !== null) {
      clearTimeout(this.worldRetry);
      this.worldRetry = null;
    }
  }

  /** Run on/off. Posted straight through and remembered for WORLD_READY. */
  sendWorldRun(on: boolean): void {
    this.worldRun = on;
    if (this.view) this.post({ type: 'WORLD_RUN', payload: { on } });
  }

  /** The player's music / sound-effect switches for the world's own audio. Posted straight through
   *  and remembered for WORLD_READY (and kept across a reopen — they are settings, not session state). */
  sendWorldAudio(music: boolean, sfx: boolean): void {
    this.worldAudio = { music, sfx };
    if (this.view) this.post({ type: 'WORLD_AUDIO', payload: this.worldAudio });
  }

  /** Auto-walk to a door. Not remembered: a destination picked before the hub is up is the screen's
   *  to re-ask, not something to replay into a player who may have walked off since. */
  sendWorldTap(x: number, y: number): void {
    const c = (v: number) => Math.max(0, Math.min(1, v));
    if (this.view) this.post({ type: 'WORLD_TAP', payload: { x: c(x), y: c(y) } });
  }

  sendWorldGoto(zone: WorldZone): void {
    if (this.view) this.post({ type: 'WORLD_GOTO', payload: { zone } });
  }

  /** Pinch / look-around drag. Posted straight through like JOURNEY_ZOOM (a late one is worthless)
   *  and remembered for WORLD_READY. */
  sendWorldCamera(zoom: number, yaw: number, pitch = 0): void {
    const c = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    this.worldCamera = { zoom: c(zoom, 0, 1), yaw: c(yaw, -1, 1), pitch: c(pitch, -1, 1) };
    if (this.view) this.postLive({ type: 'WORLD_CAMERA', payload: this.worldCamera });
  }

  /** Leaving the world. Idempotent, and safe when Unity never booted. */
  closeWorld(): void {
    const wasOpen = this.worldPending || this.worldInit != null;
    this.worldPending = false;
    this.worldInit = undefined;
    this.worldCamera = null;
    this.worldRun = false;
    this.clearWorldRetry();
    try {
      if (this.view && wasOpen) this.post({ type: 'WORLD_END' });
    } catch {}
    this.ready = false;
  }

  /**
   * Open My Room. Posts directly and repeats until MYROOM_READY, for exactly the reasons
   * openMeditationRoom gives — the room never sends UNITY_READY either. A new visit starts on the
   * overview: the last visit's orbit is forgotten.
   */
  openMyRoom(init: MyRoomInitPayload): void {
    this.myRoomInit = init;
    this.myRoomPending = true;
    this.myRoomTries = 0;
    this.myRoomCamera = null;
    devlog(`[unity-bridge] MYROOM_INIT ${init.lang}`);
    this.post({ type: 'MYROOM_INIT', payload: init });
    this.armMyRoomRetry();
  }

  private armMyRoomRetry(): void {
    this.clearMyRoomRetry();
    this.myRoomRetry = setTimeout(() => {
      this.myRoomRetry = null;
      if (!this.myRoomPending || !this.view || !this.myRoomInit) return;
      if (this.myRoomTries >= MEDITATION_MAX_TRIES) {
        devlog(`[unity-bridge] no MYROOM_READY after ${this.myRoomTries} retries — staying on the picture`);
        return;
      }
      this.myRoomTries += 1;
      devlog(`[unity-bridge] MYROOM_INIT (retry ${this.myRoomTries})`);
      this.post({ type: 'MYROOM_INIT', payload: this.myRoomInit });
      this.armMyRoomRetry();
    }, MEDITATION_RETRY_MS);
  }

  private clearMyRoomRetry(): void {
    if (this.myRoomRetry !== null) {
      clearTimeout(this.myRoomRetry);
      this.myRoomRetry = null;
    }
  }

  /** Orbit / pinch. Posted straight through like WORLD_CAMERA (a late one is worthless), clamped,
   *  and remembered for MYROOM_READY. */
  sendMyRoomCamera(camera: MyRoomCamera): void {
    const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);
    this.myRoomCamera = { zoom: clamp(camera.zoom, 0, 1), yaw: clamp(camera.yaw, -1, 1), pitch: clamp(camera.pitch, -1, 1) };
    if (this.view) this.postLive({ type: 'MYROOM_CAMERA', payload: this.myRoomCamera });
  }

  /** Leaving My Room. Idempotent, and safe when Unity never booted. */
  closeMyRoom(): void {
    const wasOpen = this.myRoomPending || this.myRoomInit != null;
    this.myRoomPending = false;
    this.myRoomInit = undefined;
    this.myRoomCamera = null;
    this.clearMyRoomRetry();
    try {
      if (this.view && wasOpen) this.post({ type: 'MYROOM_END' });
    } catch {}
    this.ready = false;
  }

  /** Leaving the journey. Idempotent, and safe when Unity never booted. */
  closeJourneyRoom(): void {
    this.journeyPending = false;
    this.journeyState = undefined;
    this.journeyVoice = undefined;
    this.journeyInit = undefined;
    this.journeyZoom = 0;
    this.journeyLook = { yaw: 0, pitch: 0 };
    this.clearJourneyRetry();
    try {
      if (this.view) this.post({ type: 'JOURNEY_END' });
    } catch {}
    this.ready = false;
  }

  /** Leaving the meditation room. Idempotent, and safe when Unity never booted. */
  closeMeditationRoom(): void {
    this.meditationPending = false;
    this.meditationState = undefined;
    this.clearMeditationRetry();
    try {
      if (this.view) this.post({ type: 'MEDITATION_END' });
    } catch {}
    this.ready = false;
  }

  async closeCounselingRoom(): Promise<void> {
    this.clearInitRetry();
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
    // A new view has been told nothing yet, whatever the last one heard.
    this.viewInsetsPosted = '';
    // Resume path — the host just re-mounted over the surviving Unity
    // instance; open the session now (see openCounselingRoom).
    if (this.everReady && this.payload && !this.initSent) this.sendInit('view registered');
    // The view arriving is also what makes a retry possible at all — before it there is nowhere to
    // post to, and `post` would only queue.
    if (this.payload && !this.ready) this.armInitRetry();
    // Same for the meditation room: a MEDITATION_INIT posted to the view that just went away is gone.
    if (this.meditationPending) {
      devlog('[unity-bridge] MEDITATION_INIT (view registered)');
      this.post({ type: 'MEDITATION_INIT' });
      this.armMeditationRetry();
    }
    if (this.journeyPending && this.journeyInit) {
      devlog('[unity-bridge] JOURNEY_INIT (view registered)');
      this.post({ type: 'JOURNEY_INIT', payload: this.journeyInit });
      this.armJourneyRetry();
    }
    if (this.worldPending && this.worldInit) {
      devlog('[unity-bridge] WORLD_INIT (view registered)');
      this.post({ type: 'WORLD_INIT', payload: this.worldInit });
      this.armWorldRetry();
    }
    if (this.myRoomPending && this.myRoomInit) {
      devlog('[unity-bridge] MYROOM_INIT (view registered)');
      this.post({ type: 'MYROOM_INIT', payload: this.myRoomInit });
      this.armMyRoomRetry();
    }
  }

  unregisterView(view: UnityViewLike): void {
    if (this.view === view) {
      this.view = null;
      this.ready = false;
      // The next view is a new player: nothing it has been told yet.
      this.viewInsetsPosted = '';
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

    // Anything at all from the far side means the handshake does not need saying again — see
    // armInitRetry.
    this.clearInitRetry();

    // The JS twin of Unity's BridgeTap, and the only place this direction can
    // be watched from. Unity's own Debug.Log does NOT reach the device log once
    // the player runs embedded inside a host app — only its two startup banners
    // do — so on a device this line is the whole Unity->RN trace. Metro shows it.
    devlog('[unity<-] ' + raw);

    // Cold boot: the player is up but empty. SESSION_INIT is what loads the
    // room, so it has to go out HERE — waiting for UNITY_READY would wait for
    // a room that only this message creates. Not `ready`: the room does not
    // exist yet and stage commands sent now are dropped on the far side.
    if (event.type === 'BRIDGE_READY') {
      this.everReady = true;
      // ⚠️ RESEND EVEN IF WE ALREADY SENT ONE. BRIDGE_READY means the player has just booted and
      // has no room — so any SESSION_INIT that went out BEFORE it was posted into a view whose
      // scripting runtime was not up yet, and is gone. `initSent` records that we spoke, not that
      // anybody heard.
      //
      // This became reachable on 21-09, when the meditation room mounted a second UnityHost.
      // Unmounting a UnityView tears the whole engine down, so leaving that room and opening a
      // consultation reboots Unity underneath a bridge that had already sent its SESSION_INIT on
      // `registerView`. Measured: SESSION_INIT at 15.517, BRIDGE_READY at 15.577, then thirty
      // seconds of nothing and the screen walked the player out. The retry could not save it
      // either — it stops at the first word back, and BRIDGE_READY is a word back.
      //
      // Safe to repeat, for the reason armInitRetry already gives: SESSION_INIT is what LOADS the
      // room, so sending it again before the room exists loads it once. `ready` guards the only
      // case that would matter — a room already up must never be reloaded under the player.
      if (this.payload && !this.ready) this.sendInit('bridge ready');

      // The meditation room needs the same repeat, for the same reason and with no payload to
      // hang it on. Measured 21-09: MEDITATION_INIT at 19.393, BRIDGE_READY at 20.420, and no
      // MEDITATION_READY ever — the room stayed on its fallback photo with the real one never
      // loading. Both openings have to survive the player booting underneath them, because since
      // the meditation room mounts its own UnityHost, either one can be the boot.
      if (this.meditationPending) {
        devlog('[unity-bridge] MEDITATION_INIT (bridge ready)');
        this.post({ type: 'MEDITATION_INIT' });
      }
      if (this.journeyPending && this.journeyInit) {
        devlog('[unity-bridge] JOURNEY_INIT (bridge ready)');
        this.post({ type: 'JOURNEY_INIT', payload: this.journeyInit });
      }
      if (this.worldPending && this.worldInit) {
        devlog('[unity-bridge] WORLD_INIT (bridge ready)');
        this.post({ type: 'WORLD_INIT', payload: this.worldInit });
      }
      if (this.myRoomPending && this.myRoomInit) {
        devlog('[unity-bridge] MYROOM_INIT (bridge ready)');
        this.post({ type: 'MYROOM_INIT', payload: this.myRoomInit });
      }
    }

    // The meditation room's equivalent of UNITY_READY for TRANSPORT purposes only: it proves the
    // player is listening, so nothing after it needs queueing. It does NOT start anything — the
    // screen decides what to do with it.
    if (event.type === 'MEDITATION_READY') {
      this.meditationPending = false;
      this.clearMeditationRetry();
      if (this.meditationState) this.post({ type: 'MEDITATION_STATE', payload: this.meditationState });
      this.replayViewInsets();
      this.ready = true;
      this.everReady = true;
      this.clearInitRetry();
    }

    if (event.type === 'JOURNEY_READY') {
      this.journeyPending = false;
      this.clearJourneyRetry();
      // The voice before the state: the state is what starts the mouth's clock.
      if (this.journeyVoice) this.post({ type: 'JOURNEY_VOICE', payload: this.journeyVoice });
      if (this.journeyState) this.post({ type: 'JOURNEY_STATE', payload: this.journeyState });
      // Always: an older Unity build starts at another zoom, and one message is cheap.
      this.post({ type: 'JOURNEY_ZOOM', payload: { zoom: this.journeyZoom } });
      if (this.journeyLook.yaw !== 0 || this.journeyLook.pitch !== 0)
        this.post({ type: 'JOURNEY_LOOK', payload: this.journeyLook });
      // Before the room frames its first shot is the whole point: the camera is placed by them.
      this.replayViewInsets();
      this.ready = true;
      this.everReady = true;
      this.clearInitRetry();
    }

    if (event.type === 'WORLD_READY') {
      this.worldPending = false;
      this.clearWorldRetry();
      // Insets first: the hub places its camera by them, and the player's own camera on top of that.
      this.replayViewInsets();
      if (this.worldCamera) this.post({ type: 'WORLD_CAMERA', payload: this.worldCamera });
      if (this.worldRun) this.post({ type: 'WORLD_RUN', payload: { on: true } });
      if (this.worldAudio) this.post({ type: 'WORLD_AUDIO', payload: this.worldAudio });
      // WALK_INPUT goes through sendEvent, which queues until `ready`. A direction queued while the
      // hub loaded is a thumb that has long since let go — replaying it would walk the player off on
      // their own. Drop those; everything else waits as it always has.
      this.outbox = this.outbox.filter(e => e.type !== 'WALK_INPUT');
      this.ready = true;
      this.everReady = true;
      this.clearInitRetry();
    }

    if (event.type === 'MYROOM_READY') {
      this.myRoomPending = false;
      this.clearMyRoomRetry();
      // Insets first: the room fits its landscape frame by them, and the player's orbit on top.
      this.replayViewInsets();
      if (this.myRoomCamera) this.post({ type: 'MYROOM_CAMERA', payload: this.myRoomCamera });
      // The room is walked now: a stick queued while it loaded is a thumb long gone (as on the world),
      // and left in the outbox it would walk whatever scene says UNITY_READY next.
      this.outbox = this.outbox.filter(e => e.type !== 'WALK_INPUT');
      this.ready = true;
      this.everReady = true;
      this.clearInitRetry();
    }

    if (event.type === 'UNITY_READY') {
      this.ready = true;
      this.everReady = true;
      // The room is up: nothing may re-open it now.
      this.clearInitRetry();
      if (!this.initSent && this.payload) this.sendInit('unity ready');
      this.replayViewInsets();
      const queued = this.outbox;
      this.outbox = [];
      queued.forEach(e => this.post(e));
    }

    this.handlers.forEach(h => h(event));
  }

  /** The latest of each high-rate message (stick, camera drags) waiting for the next flush. */
  private streams = new Map<string, RNToUnityEvent>();
  private streamTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * ⚠️ HIGH-RATE MESSAGES ARE COALESCED to one per type every STREAM_MS. Every postMessage is a
   * Fabric view command, queued on the JS thread for the next rendering update; a thumb on the stick
   * plus one on the camera sent ~120 of them a second, and the simulator crashed twice (02-10) inside
   * Scheduler::uiManagerDidDispatchCommand, seconds after the World came up. Unity eases toward the
   * last value of each of these anyway (they are absolute states, last one wins), so dropping the
   * in-between ones loses nothing. Any other message flushes them first, keeping the order.
   */
  private postStream(event: RNToUnityEvent): void {
    // Leading edge: the first of a burst goes at once (a tap, a single stop), the rest of the burst
    // waits for the window and only its latest value per type is sent.
    if (!this.streamTimer) {
      this.send(event);
      this.streamTimer = setTimeout(() => this.flushStreams(), STREAM_MS);
      return;
    }
    this.streams.delete(event.type);
    this.streams.set(event.type, event);
  }

  private flushStreams(): void {
    if (this.streamTimer) { clearTimeout(this.streamTimer); this.streamTimer = null; }
    const due = [...this.streams.values()];
    this.streams.clear();
    // A stream is worthless late: with no view it is dropped, never queued for UNITY_READY.
    if (!this.view || !due.length) return;
    for (const e of due) this.send(e);
    // Keep the window open while the finger keeps moving.
    this.streamTimer = setTimeout(() => this.flushStreams(), STREAM_MS);
  }

  /** A message from a moving finger: high-rate types are coalesced, everything else posts. Replays
   *  (on READY) use post() and go at once. */
  private postLive(event: RNToUnityEvent): void {
    if (STREAM_TYPES.has(event.type) && this.view) return this.postStream(event);
    this.post(event);
  }

  private post(event: RNToUnityEvent): void {
    // A replay of a value supersedes the pending stream of that type (it is the same latest state).
    this.streams.delete(event.type);
    if (this.streams.size) this.flushStreams();
    else if (this.streamTimer) { clearTimeout(this.streamTimer); this.streamTimer = null; }
    if (!this.view) {
      // Not a drop: it goes out when UNITY_READY flushes the outbox. Worth
      // seeing, because a command queued here and never flushed looks exactly
      // like a command Unity ignored.
      devlog('[unity-> queued] ' + event.type);
      this.outbox.push(event);
      return;
    }
    this.send(event);
  }

  private send(event: RNToUnityEvent): void {
    if (!this.view) return;
    // An envelope is ~1,500 numbers a chapter; the trace needs to know it went, not what it held.
    devlog('[unity->] ' + (event.type === 'JOURNEY_VOICE'
      ? `JOURNEY_VOICE ${event.payload.key} ${event.payload.levels.length} levels @${event.payload.fps}`
      : JSON.stringify(event)));
    this.view.postMessage(BRIDGE_OBJECT, BRIDGE_METHOD, JSON.stringify(event));
  }
}
