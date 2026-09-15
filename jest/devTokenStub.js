/**
 * The dev secret, for tests.
 *
 * `src/features/counseling/api/devToken.ts` is GITIGNORED — the real one holds the shared
 * `SAJU_ACCESS_TOKEN` from saju_server/.env. Five test files used to each mock it with
 * `jest.mock(..., { virtual: true })`, which worked right up until jest ran them in ONE process:
 * the virtual mock is registered under a virtual path, so once any earlier file in that process had
 * loaded the REAL module (it exists on a developer machine, just not in git), the resolved path won
 * and `auth.test.ts` asserted against the developer's actual token. Green in parallel, red under
 * `--runInBand`, and it read as a flake for a whole afternoon.
 *
 * A moduleNameMapper has neither problem: it maps the path itself, before resolution, so it does not
 * care whether the real file exists or which file loaded first.
 */
module.exports = { SAJU_ACCESS_TOKEN: 'test-token' };
