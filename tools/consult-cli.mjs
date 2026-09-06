#!/usr/bin/env node
// ============================================================
// consult-cli — 상담방 Q→A→음성 파이프라인을 화면(시뮬레이터) 없이 터미널에서 돌린다.
//
// 무엇을 재현하나 (CONSULTATION_FLOW.md / TTS_LATENCY.md의 ①~⑥):
//   질문 전송      POST /api/v1/prayers/consultations/message  (Unity AiNpcChatService와 같은 계약)
//   대기 연출      [ANIM] 큐 로그 (P07 SpellCasting → Thinking — Unity가 하는 그대로 타임라인 표시)
//   청크 분해      SplitReading 1:1 포팅 (첫 청크 = 첫 문장, 이후 ~110자 패킹)
//   음성 합성      POST /api/v1/prayers/tts (청크0 즉시 + 나머지 prefetch — Unity FillDialogue와 동일)
//   재생           PCM24k → WAV 래핑 → afplay 순차 재생 (HoldChunk 페이싱)
//   행동 애니메이션  답변 텍스트 → 애니메이터 파라미터 매핑 프로토타입 ([ANIM] 라인)
//
// 모든 단계에 ms 계측이 붙는다 — TTS_LATENCY.md의 병목(④)을 수치로 본다.
//
// 사용:
//   node tools/consult-cli.mjs                             # 인터랙티브 REPL
//   node tools/consult-cli.mjs --topic love --hour 10      # 토픽/출생시 지정
//   node tools/consult-cli.mjs --ask "올해 이직해도 될까?"    # 원샷 (벤치마크용)
//   node tools/consult-cli.mjs --mute                      # 소리 없이 (지연 계측만)
// REPL 명령: /new(새 대화) /topic <t> /mute /voice /stats /quit
// ============================================================
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// ── 설정 ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const has = (name) => args.includes('--' + name);

const API = flag('api', process.env.PRAYERS_API || 'http://localhost:4000');
const ENV_PATH = flag('env', process.env.SAJU_ENV_PATH || '/Users/namaste/git/saju_fullstack/saju/.env');
const state = {
  topic: flag('topic', 'career'),
  name: flag('name', '민지'),
  birth: flag('birth', '1995-04-12'),          // Unity 임베디드처럼 서버가 만세력으로 4주 계산
  hour: flag('hour', null),                    // 없으면 "시간 모름" 경로
  gender: flag('gender', 'F'),
  mute: has('mute'),
  tiki: has('tiki'),                           // 티키타카(빠른 문답) 모드 — setting.chat_mode='tiki'
  scope: flag('scope', ''),                    // ''|decade|year|month — setting.scope
  prepare: !has('no-prepare'),                 // 시작 시 사주 선분석(prepare) 호출
  uniqId: flag('uniq', 'prayers_cli_' + Date.now().toString(36)),
  stats: [],
};

function sajuToken() {
  try {
    const line = readFileSync(ENV_PATH, 'utf8').split('\n').find(l => l.startsWith('SAJU_ACCESS_TOKEN='));
    return line ? line.split('=')[1].trim() : '';
  } catch { return ''; }
}
const TOKEN = process.env.SAJU_ACCESS_TOKEN || sajuToken();
const HEADERS = {
  'Content-Type': 'application/json',
  'Saju-Authorization': 'Bearer-' + TOKEN,
  'User-Auth': process.env.PRAYERS_CLI_UID || 'prayers_cli',
};

// ── SplitReading — ConsultationFlowUI.cs 1:1 포팅 ─────────────
// 서버측 첫 문장 캐시 예열(TTS_LATENCY.md §7-B)을 실험할 때 이 함수와 한 글자도
// 다르면 캐시 미스가 나므로, 로직을 "개선"하지 말고 그대로 둘 것.
export function splitReading(text) {
  const sentences = [];
  let sb = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') { if (sb.length) { sentences.push(sb.trim()); sb = ''; } continue; }
    sb += ch;
    if (ch === '.' || ch === '!' || ch === '?' || ch === '…' || ch === '。') {
      while (i + 1 < text.length && ['"', "'", ')', '”'].includes(text[i + 1])) sb += text[++i];
      sentences.push(sb.trim());
      sb = '';
    }
  }
  if (sb.length) sentences.push(sb.trim());
  const clean = sentences.filter(s => s.length);
  if (!clean.length) return [text];

  const target = 110;
  const chunks = [];
  let cur = '';
  for (const s of clean) {
    const closeFirst = chunks.length === 0 && cur.length >= 15;
    if (cur.length > 0 && (closeFirst || cur.length + 1 + s.length > target)) { chunks.push(cur); cur = ''; }
    if (cur.length > 0) cur += ' ';
    cur += s;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

// ── 행동 애니메이션 프로토타입 ─────────────────────────────────
// 답변 내용 → 상담사 애니메이터 파라미터 매핑. 여기서 규칙을 튜닝해 보고,
// 확정되면 Unity(ConsultationFlowUI.FillDialogue 부근)로 옮긴다.
// 사용 가능한 파라미터(m003_sage rig): Thinking, Welcome, Explaining, Revealing,
// Concerned, Smile, HandRaise, Surprise, Sad, GoodbyeGesture
const ANIM_RULES = [
  { re: /(조심|주의|걱정|위험|무리|스트레스|어렵|힘들 수)/, anim: 'Concerned' },
  { re: /(축하|아주 좋|행운|기회|웃|즐겁|좋은 흐름|길하)/, anim: 'Smile' },
  { re: /(놀랍|특별|흥미롭|독특|재미있)/, anim: 'Surprise' },
  { re: /(아쉽|슬프|이별|상실|지치)/, anim: 'Sad' },
  { re: /\?["'”)]*$/, anim: 'HandRaise' },   // 되묻기/제안으로 끝나는 청크
];
function pickAnim(chunk, idx) {
  for (const r of ANIM_RULES) if (r.re.test(chunk)) return r.anim;
  return idx % 2 === 0 ? 'Explaining' : 'Revealing'; // 기본은 설명/공개 제스처 교차
}

// ── WAV 래핑 + afplay ────────────────────────────────────────
function pcmToWav(pcmBuf, sampleRate = 24000, channels = 1) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcmBuf.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22); h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * channels * 2, 28); h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcmBuf.length, 40);
  return Buffer.concat([h, pcmBuf]);
}
const wavDir = mkdtempSync(join(tmpdir(), 'consult-cli-'));
function play(wavPath) {
  return new Promise(res => {
    const p = spawn('afplay', [wavPath], { stdio: 'ignore' });
    p.on('exit', res); p.on('error', res);
  });
}

// ── 출력 도우미 ──────────────────────────────────────────────
const t0 = () => process.hrtime.bigint();
const ms = (from) => Number((process.hrtime.bigint() - from) / 1000000n);
const dim = s => `\x1b[2m${s}\x1b[0m`;
const cyan = s => `\x1b[36m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const magenta = s => `\x1b[35m${s}\x1b[0m`;
const logAnim = (name, note = '') => console.log(magenta(`  [ANIM] ${name}`) + (note ? dim('  ' + note) : ''));
const logCue = (s) => console.log(dim(`  [CUE ] ${s}`));

// ── API 호출 ────────────────────────────────────────────────
function baseInfo() {
  const [y, m, d] = state.birth.split('-').map(Number);
  // Unity 임베디드와 같은 최소 계약: 4주는 비워 보내면 서버 ensure_chart_defaults!가
  // SuperCalendar로 계산한다 (consultation_service.rb).
  // birth_* 는 반드시 숫자 — 서버가 Date.new(year, month, day)에 그대로 넣는다
  // (messages_generator.rb:788, 문자열이면 TypeError "invalid day (not numeric)").
  const first = {
    name: state.name, gender: state.gender,
    birth_year: y, birth_month: m, birth_day: d,
  };
  if (state.hour != null) first.birth_hour = Number(state.hour);
  return { lang: 'ko', first, info: { topic: state.topic } };
}

async function sendQuestion(text) {
  const setting = { lang: 'ko', tone: 'default', promode: false, tickets_to_deduct: 1 };
  if (state.tiki) setting.chat_mode = 'tiki';
  if (state.scope) setting.scope = state.scope;
  const body = {
    uniq_id: state.uniqId,
    message: { id: randomUUID().replaceAll('-', ''), content: text, role: 'user', createdAt: new Date().toISOString() },
    base_info: baseInfo(),
    setting,
  };
  const from = t0();
  const resp = await fetch(API + '/api/v1/prayers/consultations/message', {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  return { status: resp.status, json, llmMs: ms(from) };
}

async function synth(text) {
  const from = t0();
  const resp = await fetch(API + '/api/v1/prayers/tts', {
    method: 'POST', headers: HEADERS, body: JSON.stringify({ text, lang: 'ko' }),
  });
  const json = await resp.json().catch(() => ({}));
  const took = ms(from);
  if (!json.success || !json.pcm_base64) return { error: json.error || ('HTTP ' + resp.status), synthMs: took };
  const wav = pcmToWav(Buffer.from(json.pcm_base64, 'base64'), json.sample_rate || 24000, json.channels || 1);
  const path = join(wavDir, 'chunk-' + randomUUID().slice(0, 8) + '.wav');
  writeFileSync(path, wav);
  return { path, synthMs: took, duration: json.duration, cached: took < 400 };
}

// ── 한 턴 ───────────────────────────────────────────────────
async function turn(question, isFirst) {
  console.log('\n' + cyan('나  ') + question);

  // Unity 타임라인 재현: 첫 질문이면 P07-P10 연출이 로딩을 가리고, 루프면 Thinking뿐.
  if (isFirst) { logCue('P06 SpaceTransition → P07 MagicCircleForm'); logAnim('SpellCasting', '연출이 AI 왕복을 가린다 (P07-P10)'); }
  else logAnim('Thinking', '루프 질문 — 가릴 연출 없음, 체감 지연 구간');

  const spinner = setInterval(() => process.stdout.write(dim('.')), 1000);
  const { status, json, llmMs } = await sendQuestion(question);
  clearInterval(spinner);
  process.stdout.write('\r');

  if (status !== 200 || !json.content) {
    console.log(yellow(`  !! ${status} ${JSON.stringify(json).slice(0, 300)}`));
    return;
  }

  const topic = json.topic || {};
  console.log(dim(`  ── 답변 도착 ${llmMs}ms · topic ${topic.main}→${topic.detected || '-'} (${topic.mode})` +
    (topic.suggest_switch ? ` · 전환제안:${topic.suggest_switch}` : '')));
  if (json.period) {
    const p = json.period;
    const cell = (g, sky, earth) =>
      `${g} · 천간 ${g?.[0]} ${sky?.name}(${sky?.hanja}) / 지지 ${g?.[1]} ${earth?.name}(${earth?.hanja})`;
    if (p.kind === 'decade') {
      console.log(yellow(`  [대운] ${p.label} = ${p.ganji}(${p.ganji_kr}) · 만 ${p.start_age}~${p.start_age + 9}세 (${p.start_year}~${p.end_year}) · ` +
        `천간 ${p.sky_sipseong?.name}(${p.sky_sipseong?.hanja}) / 지지 ${p.earth_sipseong?.name}(${p.earth_sipseong?.hanja}) · 일간 ${p.ilgan} 기준`));
    } else {
      console.log(yellow(`  [시기] ${p.year}년${p.month ? ` ${p.month}월` : ''} = ` +
        (p.month_ganji ? cell(p.month_ganji, p.month_sky_sipseong, p.month_earth_sipseong)
          : cell(p.year_ganji, p.year_sky_sipseong, p.year_earth_sipseong)) +
        ` · 일간 ${p.ilgan} 기준`));
    }
  }

  const chunks = splitReading(json.content);
  const answerAt = t0();

  // Unity FillDialogue와 동일: 청크0 합성 시작 + 나머지 전부 prefetch.
  let jobs = [];
  if (!state.mute) jobs = chunks.map(c => synth(c));

  let firstAudioMs = null;
  const synthTimes = [];
  for (let i = 0; i < chunks.length; i++) {
    const anim = pickAnim(chunks[i], i);
    logAnim(anim);
    console.log(green('상담사') + ` ${dim(`[${i + 1}/${chunks.length}]`)} ${chunks[i]}`);
    if (state.mute) continue;

    const r = await jobs[i]; // HoldChunk: 이 청크의 소리가 준비될 때까지 대기
    if (r.error) { console.log(yellow(`  [TTS ] 실패: ${r.error}`)); continue; }
    if (firstAudioMs === null) firstAudioMs = ms(answerAt);
    synthTimes.push(r.synthMs);
    console.log(dim(`  [TTS ] 합성 ${r.synthMs}ms${r.cached ? ' (캐시)' : ''} · 재생 ${r.duration?.toFixed(1)}s`));
    await play(r.path);
  }

  if (json.followup) console.log(yellow(`  [PILL] ${json.followup}`));

  const stat = { llmMs, chunks: chunks.length, firstAudioMs, synthTimes };
  state.stats.push(stat);
  console.log(dim(`  ── 계측: LLM ${llmMs}ms · 첫소리 +${firstAudioMs ?? '-'}ms (답변 도착 기준) · 청크 ${chunks.length}개` +
    (synthTimes.length ? ` · TTS ${synthTimes.join('/')}ms` : '')));
}

// 입장 시 사주 선분석 — 원국·대운·년운·월운 브리프를 서버가 만들어 캐시.
// 티키타카 모드가 이 브리프 위에서 답한다. 같은 프로필+topic 재호출은 캐시 즉시.
async function prepare() {
  const from = t0();
  const resp = await fetch(API + '/api/v1/prayers/consultations/prepare', {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ base_info: baseInfo(), setting: { lang: 'ko' } }),
  });
  const json = await resp.json().catch(() => ({}));
  if (json.ready) {
    console.log(dim(`  [PREP] 사주 선분석 ${json.cached ? '캐시 즉시' : (ms(from) / 1000).toFixed(1) + 's'} · 브리프 ${json.brief.length}자`));
  } else {
    console.log(yellow(`  [PREP] 선분석 실패: ${json.error || resp.status} (상담은 계속 가능)`));
  }
}

// ── REPL ────────────────────────────────────────────────────
async function main() {
  if (state.prepare) await prepare().catch(e => console.log(yellow('[PREP] ' + e.message)));
  if (flag('ask', null)) { await turn(flag('ask'), true); process.exit(0); }

  console.log(dim(`consult-cli — ${API} · topic=${state.topic} · ${state.name} ${state.birth}` +
    (state.hour != null ? ` ${state.hour}시` : ' (시간모름)') + ` · uniq=${state.uniqId}` +
    (state.tiki ? ' · ⚡티키타카' : ' · 상세') + (state.scope ? ` · scope=${state.scope}` : '') +
    (state.mute ? ' · MUTE' : '')));
  console.log(dim('질문을 입력하세요. /new /topic <t> /mute /voice /stats /quit'));
  logCue('P01 입장 연출 → P02 인사');
  logAnim('Welcome', '(rig에 상태 없음 — 백로그)');
  console.log(green('상담사') + ' 어서 오세요. 오늘은 무엇이 궁금하신가요?');

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '\n> ' });
  let first = true;
  rl.prompt();
  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) return rl.prompt();
    if (text === '/quit') process.exit(0);
    else if (text === '/new') { state.uniqId = 'prayers_cli_' + Date.now().toString(36); first = true; console.log(dim('새 대화: ' + state.uniqId)); }
    else if (text.startsWith('/topic ')) { state.topic = text.slice(7).trim(); first = true; state.uniqId = 'prayers_cli_' + Date.now().toString(36); console.log(dim('topic=' + state.topic + ' (새 대화)')); }
    else if (text === '/mute') { state.mute = true; console.log(dim('음소거')); }
    else if (text === '/voice') { state.mute = false; console.log(dim('음성 켬')); }
    else if (text === '/stats') console.table(state.stats.map(s => ({ 'LLM(ms)': s.llmMs, '첫소리(+ms)': s.firstAudioMs, '청크': s.chunks, 'TTS(ms)': s.synthTimes.join('/') })));
    else await turn(text, first).then(() => { first = false; }).catch(e => console.log(yellow('오류: ' + e.message)));
    rl.prompt();
  });
}

main();
