#!/usr/bin/env node
// Re-bake a counselor's pre-recorded room lines in their CURRENT server voice.
//
// The 3D rooms play fixed lines from Unity clips —
//   saju_world_unity/Assets/Audio/Consultation/<lang>/<persona>/<key>[__<topic>].wav
// — and only synthesise what has no clip. So when a counselor's voice changes on the server
// (Prayers::TtsService PRESETS / PROVIDER_BY_PRESET), their fixed lines keep the old voice until
// they are baked again. This does that, through the same /api/v1/prayers/tts the room uses, so the
// clip and the live lines are one voice. The server's permanent cache (Prayers::TtsCache) makes a
// re-run of a finished batch free.
//
// THE TEXT is what the app shows: consultationStrings.json, with the counselor's register applied
// exactly as flow/voice.ts `voiced()` does (lang → en → shared), and {0} filled from
// consult_topic_<topic>. `consult_laugh` comes from the folder's own _extra.txt.
//
// ONLY EXISTING FILES are rewritten — same names, so every .meta (and GUID) Unity holds stays valid.
//
// Usage (Rails on :4000):
//   node tools/bake_counselor_clips.mjs coldgirl metal [--langs ko,en] [--only consult_p02_l0] [--dry]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const UNITY = '/Users/namaste/git/saju_fullstack/saju_world_unity/Assets/Audio/Consultation';
const FLOW = new URL('../src/features/counseling/flow/', import.meta.url).pathname;
const API = process.env.PRAYERS_API || 'http://localhost:4000';
const TOKEN = process.env.SAJU_ACCESS_TOKEN ||
  readFileSync('/Users/namaste/git/saju_fullstack/saju/.env', 'utf8').split('\n')
    .find(l => l.startsWith('SAJU_ACCESS_TOKEN='))?.split('=')[1].trim();

// Unity persona folder → the server tone (TTS preset) and the app register it speaks in.
const PERSONAS = {
  coldgirl: { preset: 'coldgirl', register: 'business' }, // 고윤정
  metal: { preset: 'sudam', register: 'default' },        // 테오
  wood: { preset: 'sunyeo', register: 'default' },        // 유나
  dosa: { preset: 'dosa', register: 'default' },          // 지호
};

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const personas = args.filter((a, i) => !a.startsWith('--') && !['--langs', '--only', '--jobs'].includes(args[i - 1]));
const langs = (flag('langs') || 'ko,en,vi,zh-CN').split(',');
const only = flag('only')?.split(',');
const JOBS = Number(flag('jobs') || 4);
const dry = args.includes('--dry');
if (personas.length === 0 || personas.some(p => !PERSONAS[p])) {
  console.error(`usage: bake_counselor_clips.mjs <${Object.keys(PERSONAS).join('|')}>... [--langs] [--only] [--dry]`);
  process.exit(1);
}

const strings = JSON.parse(readFileSync(join(FLOW, 'consultationStrings.json'), 'utf8'));

// The register tables, read out of voice.ts itself so there is no second copy to drift. They are
// plain object literals; only the type annotation has to go before evaluating one.
function registerTable(name) {
  const src = readFileSync(join(FLOW, 'voice.ts'), 'utf8');
  const start = src.indexOf(`const ${name}: Record<Lang, Bundle> = {`);
  if (start < 0) return null;
  const open = src.indexOf('{', start);
  let depth = 0, end = open;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}' && --depth === 0) break;
  }
  return Function(`return (${src.slice(open, end + 1)});`)();
}
const REGISTERS = { default: null, business: registerTable('BUSINESS') };

// flow/voice.ts voiced(): register[lang] → register.en → the shared table.
function lineFor(register, key, lang) {
  const table = REGISTERS[register];
  const own = table?.[lang]?.[key] ?? table?.en?.[key];
  return own ?? strings[key]?.[lang] ?? null;
}

function textFor(persona, name, lang) {
  const dir = join(UNITY, lang, persona);
  if (name === 'consult_laugh') {
    const extra = existsSync(join(dir, '_extra.txt')) ? readFileSync(join(dir, '_extra.txt'), 'utf8') : '';
    return extra.match(/'consult_laugh',\s*'([^']+)'/)?.[1] ?? null;
  }
  const [key, topic] = name.split('__');
  const line = lineFor(PERSONAS[persona].register, key, lang);
  if (!line) return null;
  return topic ? line.replaceAll('{0}', strings[`consult_topic_${topic}`]?.[lang] ?? topic) : line;
}

// Same trim as the server's local path and the old takes: the room waits for each clip to end, so
// silence at either end is dead air on every line.
const TRIM_FLOOR = 350, TRIM_PAD = 0.03;
function trim(pcm, rate) {
  const n = pcm.length / 2;
  const at = i => pcm.readInt16LE(i * 2);
  let lo = 0; while (lo < n && Math.abs(at(lo)) < TRIM_FLOOR) lo++;
  let hi = n; while (hi > lo && Math.abs(at(hi - 1)) < TRIM_FLOOR) hi--;
  if (hi <= lo) return pcm;
  const pad = Math.floor(TRIM_PAD * rate);
  return pcm.subarray(Math.max(0, lo - pad) * 2, Math.min(n, hi + pad) * 2);
}

function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function synth(text, preset, lang) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${API}/api/v1/prayers/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Saju-Authorization': `Bearer-${TOKEN}`, 'User-Auth': 'dev-clipbake' },
        body: JSON.stringify({ text, preset, lang }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || `HTTP ${r.status}`);
      return j;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(res => setTimeout(res, 2000 * attempt)); // rate limits heal with a pause
    }
  }
}

const jobs = [];
const missing = [];
for (const persona of personas) {
  for (const lang of langs) {
    const dir = join(UNITY, lang, persona);
    if (!existsSync(dir)) { console.warn(`skip ${lang}/${persona}: no folder`); continue; }
    for (const f of readdirSync(dir).filter(f => f.endsWith('.wav')).sort()) {
      const name = f.slice(0, -4);
      if (only && !only.includes(name.split('__')[0])) continue;
      const text = textFor(persona, name, lang);
      if (!text) { missing.push(`${lang}/${persona}/${name}`); continue; }
      jobs.push({ persona, lang, name, text, path: join(dir, f) });
    }
  }
}
console.log(`${jobs.length} clips to bake` + (missing.length ? `, ${missing.length} with no text (left as they are): ${missing.join(' ')}` : ''));
if (dry) {
  for (const j of jobs.slice(0, 12)) console.log(`  ${j.lang}/${j.persona}/${j.name}: ${j.text}`);
  process.exit(0);
}

let done = 0, failed = 0;
const started = Date.now();
async function worker() {
  while (jobs.length) {
    const j = jobs.shift();
    try {
      const r = await synth(j.text, PERSONAS[j.persona].preset, j.lang);
      const pcm = trim(Buffer.from(r.pcm_base64, 'base64'), r.sample_rate);
      writeFileSync(j.path, wav(pcm, r.sample_rate));
      done++;
      if (done % 20 === 0) console.log(`  ${done} done (${Math.round((Date.now() - started) / 1000)}s)`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${j.lang}/${j.persona}/${j.name}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: JOBS }, worker));

// Say what made these files, where the Piper recipe used to.
for (const persona of personas) for (const lang of langs) {
  const dir = join(UNITY, lang, persona);
  if (existsSync(dir)) writeFileSync(join(dir, '_recipe.txt'),
    `server tts preset=${PERSONAS[persona].preset} register=${PERSONAS[persona].register} ` +
    `(Prayers::TtsService PRESETS; baked ${new Date().toISOString().slice(0, 10)} by prayers/tools/bake_counselor_clips.mjs)\n`);
}
console.log(`DONE ${done} baked, ${failed} failed in ${Math.round((Date.now() - started) / 1000)}s`);
process.exit(failed ? 1 : 0);
