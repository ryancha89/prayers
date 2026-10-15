/**
 * COPY THIS FILE TO `devToken.ts` AND PASTE YOUR LOCAL TOKEN IN.
 *
 * `devToken.ts` is gitignored and must stay that way. The value is the shared
 * `SAJU_ACCESS_TOKEN` from `saju_server/.env` — the same secret Unity keeps in its own untracked
 * `Resources/AiNpcBuildSecrets` asset rather than in the repo. A secret that reaches git reaches
 * every fork of it.
 *
 * Only dev builds ever send it: `unityApiBase` is `undefined` outside `__DEV__`, so a release
 * bundle has no server to send it to. When Prayers gets a login, this goes away entirely — Rails
 * also accepts a per-user 24h `Game-Token`, which is the path that works with no embedded secret.
 *
 * With it empty, every /api/v1/prayers call answers 401 and the room falls back to the scripted
 * replies. `prayersServer.ts` says so once, loudly, rather than letting that look like a network
 * failure.
 */
export const SAJU_ACCESS_TOKEN = '';
