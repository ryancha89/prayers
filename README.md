# Prayers

Zeta-inspired **3D AI counseling app**. React Native handles discovery, profiles,
history and session setup; a 3D counseling room (Unity, integrated later) is the
immersive core. Built from `prayers_zeta_3d_counseling_app_spec.md`.

> Choose a counselor → become interested in the character → enter their room →
> talk face-to-face → leave → return later and continue the relationship.

This is **not** an open world: no map, no player avatar, no movement. Unity is a
high-quality 3D conversation stage only.

## Status

React-native-only prototype (spec §54). Everything works end-to-end against a
**mock Unity bridge** and a **mock counselor AI**. The native Unity view and the
real backend drop in behind existing interfaces without UI changes.

- ✅ Phase 1 — Bottom-tab shell (Home / Conversations / Discover / My)
- ✅ Phase 2 — Two-column counselor feed + category tabs + 6 mock counselors
- ✅ Phase 3 — Counselor detail (hero, tags, specialties, preview carousel, CTA) — no Unity
- ✅ Phase 4 — Counseling setup (subject select/add + topic)
- ✅ Phase 5 — Unity boundary: TS bridge + typed events + mock loading/room screens
- ✅ Phase 7 — Conversation loop (mock AI → structured `CounselorResponse` → stage reacts)
- ✅ Phase 8 — Session history + resume (persisted with AsyncStorage)
- ⬜ Phase 6 — Native Unity project (`CounselingRoom.unity`, character, animations)

## Stack

Bare React Native 0.86 · TypeScript · React Navigation 7 (native-stack +
bottom-tabs) · Zustand (persisted) · TanStack Query · AsyncStorage. Matches the
conventions of the sibling RN projects in this workspace.

## Run

```bash
npm install
# iOS
bundle install && (cd ios && pod install)   # first time
npm run ios
# Android
npm run android
```

## Localization (i18n)

Korean by default, switchable to English (persisted). Switch from **My → Settings →
Language**; every screen, counselor profile, and mock AI response re-renders in the
selected language instantly.

- `src/shared/i18n/` — `store.ts` (persisted `lang`, default `ko`), `translations.ts`
  (ko/en UI strings, `{name}` interpolation), `useT()` / `useLang()` hooks.
- Counselor content is bilingual in `mockCounselors.ts`; `localizeCounselors(lang)` /
  `getLocalizedCounselor(id, lang)` return the flat `CounselorSummary` for the active
  language. The mock AI (`counselorAI.ts`) returns KO/EN greetings and replies.
- The Unity session payload carries `locale: lang` (spec §40) so the 3D room / backend
  can localize voice + subtitles later.

## Architecture

```
src/
├── navigation/            RootNavigator (stack) + BottomTabNavigator (4 tabs)
├── features/
│   ├── home/              HomeScreen (feed)
│   ├── counselors/        cards, detail, hero, preview, mock data, favorites
│   ├── conversations/     history list + resume, persisted store
│   ├── counseling/        setup → Unity entry → room; bridge, mock AI, stores
│   ├── subjects/          "who is this about" — saved people (persisted)
│   ├── discover/          trending / new / category discovery
│   └── profile/           My page + monetization interfaces (placeholder)
└── shared/                theme tokens, Icon/Badge/Tag/PrimaryButton, utils
```

### Responsibility split (spec §38 — keep this boundary clean)

| React Native (this repo) | Unity (later) | Backend (later) |
| --- | --- | --- |
| Navigation, feed, detail, previews, subjects, history, profile, session setup | 3D room, character animator, facial expressions, lip sync, voice playback, camera | LLM, conversation memory, TTS, session persistence |

### The Unity boundary

The only thing that knows Unity isn't real yet is `MockUnityBridge`. All UI
depends on the `UnityBridge` interface (`src/features/counseling/types`). To go
live, implement a `NativeUnityBridge` (e.g. `react-native-unity-view` or a
`NativeModule`) and swap it in `src/features/counseling/bridge/index.ts`.

Event contract (JSON, spec §41):

- **RN → Unity**: `SESSION_INIT`, `COUNSELOR_RESPONSE`
- **Unity → RN**: `UNITY_READY`, `USER_MESSAGE`, `EXIT_SESSION`

The structured AI response Unity plays back (spec §25):

```ts
interface CounselorResponse {
  text: string;
  emotion: 'neutral' | 'happy' | 'thinking' | 'concerned' | 'surprised';
  animation: 'talk' | 'thinking' | 'nod' | 'smile' | 'concern';
  camera: 'default' | 'closeUp';
  audioUrl?: string;
  followUp?: boolean;
}
```

`CounselorStage` is a placeholder that reacts to this contract (emotion, talk
pulse, close-up camera) so the loop is testable today; the native room replaces
it, driven by the same state machine (LOADING → GREETING → IDLE → LISTENING →
THINKING → SPEAKING → IDLE, spec §43/§44).

### Swapping mocks for real services

- `src/features/counseling/api/counselorAI.ts` → real backend (`CounselorAIService`)
- `src/features/counseling/bridge/index.ts` → real native bridge (`UnityBridge`)
- `src/features/counselors/data/mockCounselors.ts` → real catalog API (`CounselorSummary`)
- `src/features/profile/monetization.ts` → real billing (`BillingService`)

## End-to-end acceptance (spec §50)

Home feed → tap Seoyeon → detail → preview (no Unity) → Start Counseling →
pick subject → pick topic → loading → (mock) room → greeting animation + first
line → type a message → structured response drives expression/animation/subtitle
→ exit → Conversations tab now lists Seoyeon → tap to resume the same session.
# prayers
