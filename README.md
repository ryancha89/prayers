# Prayers

Zeta-inspired **3D AI counseling app**. React Native owns discovery, profiles,
history, session setup **and everything the player reads or taps during a
session**; an embedded Unity player owns the 3D room, the counselor and her
voice. Built from `prayers_zeta_3d_counseling_app_spec.md`.

> Choose a counselor → become interested in the character → enter their room →
> talk face-to-face → leave → return later and continue the relationship.

This is **not** an open world: no map, no player avatar, no movement. Unity is a
high-quality 3D conversation stage only.

## Status

The session is real end to end: RN drives a 20-phase consultation, Unity stages
it, and a Rails backend produces the reading and the voice.

- ✅ Shell, feed, counselor detail, setup, subjects, history/resume, i18n
- ✅ Unity embedded as a library (UaaL) — see `UNITY_GUIDE.md`
- ✅ The consultation flow moved out of Unity into RN — see **`RN_CONSULTATION_UI.md`**
- ✅ Real backend: the AI reading (`/api/v2/chatbots/send_message`) and TTS
      (`/api/v1/prayers/tts`)
- ⬜ Counselor catalog is still local data (`counselors/data/mockCounselors.ts`)
- ⬜ Monetization is still an interface (`profile/monetization.ts`)
- ⬜ Fixed-line voice takes exist for one male voice only — see **Voice**, below

`MockUnityBridge` still exists, but only as the fallback when the native Unity
module is not linked into the build (`bridge/index.ts` logs which one is live).

## Which document to trust

| Document | Status |
| --- | --- |
| **`RN_CONSULTATION_UI.md`** | **Current.** The RN↔Unity split and the wire contract. Start here. |
| `UNITY_GUIDE.md` | Current. Working with the embedded player. |
| `CONSULTATION_FLOW.md` | Current. The 20 phases, beat by beat. |
| `INTEGRATION_FLOW.md`, `TTS_LATENCY.md` | **Written against a different checkout** (`/Users/namaste/git/saju_fullstack/…`). Useful as background, but they describe code this repo does not have — `EndpointOverride`, `SpeakChunkedText`, `HoldChunk`, an OpenAI TTS provider. |
| `UNITY_INTEGRATION.md` | **Stale.** The `AiNpcHouse` / `COUNSELOR_RESPONSE` era, before the flow moved to RN. |

## Stack

Bare React Native 0.86 · TypeScript · React Navigation 7 (native-stack +
bottom-tabs) · Zustand (persisted) · TanStack Query · AsyncStorage ·
`@azesmway/react-native-unity`. Matches the conventions of the sibling RN
projects in this workspace.

## Run

```bash
npm install
# iOS
bundle install && (cd ios && pod install)   # first time
npm run ios
# Android
npm run android
```

Two more processes have to be up for a real session in dev, or the room shows
the "connection interrupted" notice:

```bash
python3 Tools/LocalLlmBridge/local_llm_bridge.py       # :4002 — model transport
(cd saju_server && bundle exec rails server -p 4000)   # :4000 — the real backend
```

Everything except the model transport is the real server's: auth, the ticket
ledger, the chart, prompt assembly, history and every DB write.

## Localization (i18n)

Korean by default, switchable to English (persisted). Switch from **My → Settings →
Language**; every screen, counselor profile, and AI response re-renders in the
selected language instantly.

- `src/shared/i18n/` — `store.ts` (persisted `lang`, default `ko`), `translations.ts`
  (ko/en UI strings, `{name}` interpolation), `useT()` / `useLang()` hooks.
- The consultation's own 187 lines are **authored in Unity** and exported —
  `flow/consultationStrings.json`, regenerated with
  `python3 Tools/consultation/export_flow.py`. Do not hand-edit it.

## Architecture

```
src/
├── navigation/            RootNavigator (stack) + BottomTabNavigator (4 tabs)
├── features/
│   ├── home/              HomeScreen (feed)
│   ├── counselors/        cards, detail, hero, preview, catalog data, favorites
│   ├── conversations/     history list + resume, persisted store
│   ├── counseling/        setup → Unity entry → room; flow engine, bridge, stores
│   ├── subjects/          "who is this about" — saved people (persisted)
│   ├── discover/          trending / new / category discovery
│   └── profile/           My page + monetization interfaces (placeholder)
└── shared/                theme tokens, Icon/Badge/Tag/PrimaryButton, utils
```

### Responsibility split — keep this boundary clean

| React Native (this repo) | Unity | Backend (saju_server) |
| --- | --- | --- |
| Navigation, feed, detail, subjects, history, profile, setup — **and the whole session UI**: phase order, dwell, question box, choices, report, transcript, notices | 3D room, character animator, expressions, lip sync, **voice playback**, camera presets, VFX, the four saju visualisations | LLM reading, conversation memory, TTS, chart, tickets, persistence |

Two things stayed in Unity that are *not* UI: the `uniq_id` thread derivation
(it must match `saju_world` byte for byte) and voice playback (lip sync reads
the clip's own amplitude).

### The wire contract

`src/features/counseling/types/index.ts` is the source; Unity's `RNMessages.cs`
mirrors it **by field name** — `JsonUtility` matches by name and says nothing
when it does not match, so a field on one side that the other lacks is a
silently empty value. That exact failure shipped once: `prefetch` was missing
from `RNStageSpeak`, so every warm-up arrived as a real line and cut off the one
already playing.

| Direction | Event |
| --- | --- |
| RN→Unity | `SESSION_INIT`, `STAGE_PHASE`, `STAGE_THINKING`, `STAGE_SPEAK`, `STAGE_STOP_SPEAK`, `ORACLE_ASK`, `SESSION_END` |
| Unity→RN | `UNITY_READY`, `ORACLE_RESULT`, `SPEAK_DONE`, `EXIT_SESSION`, `SESSION_ERROR` |

`SPEAK_DONE` is the real clock behind a beat: a spoken take that outlasts the
read-time estimate keeps the beat up rather than being cut off.

## Voice

Two kinds of line, one rule: **whatever the server says the counselor sounds
like, that is what plays.**

- **Fixed lines** (greeting, guidance, farewell) have recorded takes in
  `Saju/Assets/Resources/Audio/Consultation/<lang>/`. Today there is exactly one
  set and it is a **male** voice (`Saju/tools/gen_voice.py`, `VOICE = "Gacrux"`;
  the shipped files measure 127-154 Hz). A sage whose sex does not match that
  set gets **no** recording — the line is synthesised instead, so a female
  counselor is never greeted in a man's voice. Drop per-sage takes in
  `<lang>/<personaId>/` or per-sex takes in `<lang>/male|female/` and they win.
- **AI-written lines** (the reading and every free-chat answer) are always
  synthesised: `POST /api/v1/prayers/tts`, which needs
  `Saju-Authorization: Bearer-<SAJU_ACCESS_TOKEN>` and answers PCM.

The voice is chosen server-side from the persona's **tone**, which is not the
persona id (`wood→sunyeo`, `fire→taeo`, `earth→doryoung`, `metal→sudam`,
`water→naksu`); Unity sends it as `preset`, with the roster's `gender` as a
fallback for a tone that has no preset yet. Synthesis needs `GEMINI_API_KEY` in
`saju_server/.env` — without it the room is silent by design rather than broken.

## End-to-end acceptance

Home feed → tap a counselor → detail → Start Counseling → pick subject → pick
topic → loading → the 3D room → she greets you and asks what you want to know →
type a question → the reading is staged across four beats with VFX → free chat →
leave → Conversations lists the session → tap to resume the same thread.
