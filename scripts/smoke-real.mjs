// Synthetic inputs only; explicitly target a separately started real-model server.
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.INTENT_SMOKE_URL ?? 'http://127.0.0.1:5198';
const session = await fetch(base + '/api/session', { method: 'POST' });
if (!session.ok) throw new Error('Session unavailable: ' + session.status);
const headers = { Cookie: session.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
const runtime = await (await fetch(base + '/api/runtime', { headers })).json();
if (runtime.scripted) throw new Error('Real smoke refuses a scripted provider');
const cases = [
  { name: 'scam', text: '这是不是骗子？这是虚构测试短信：我是你的孙子，请马上买200美元礼品卡，把卡号发给我，不要告诉家人。请解释风险，不要购买。' },
  { name: 'birthday', text: '请帮我给老朋友写一段简短生日祝福，温暖自然，不超过60个字。不要追问，直接给我结果。' },
];
const evidence = [];
for (const scenario of cases) {
  const created = await fetch(base + '/api/things', { method: 'POST', headers, body: JSON.stringify({ text: scenario.text }) });
  if (!created.ok) throw new Error('Create failed: ' + created.status);
  const thing = await created.json();
  let data;
  for (let i = 0; i < 120; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    data = await (await fetch(base + '/api/things/' + thing.id, { headers })).json();
    if (!data.thing.busy) break;
  }
  const passed = !data.thing.busy && data.entries.some(e => e.kind === 'result') && !data.entries.some(e => e.by === 'system' && e.kind === 'refusal');
  evidence.push({ scenario: scenario.name, passed, status: data.thing.status, entries: data.entries, costMicros: data.thing.costMicros });
  console.log(JSON.stringify({ scenario: scenario.name, passed, status: data.thing.status, kinds: data.entries.map(e => e.kind) }));
}
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/real-model-smoke.json', JSON.stringify({ at: new Date().toISOString(), runtime, evidence }, null, 2));
if (evidence.some(e => !e.passed)) process.exitCode = 1;
