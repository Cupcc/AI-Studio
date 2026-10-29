// 不发送用户输入的真实 CLI 检查：Claude 目录 effort 档位与 setReasoningEffort。
// 用法：先 `pnpm --filter @ai-studio/agent-adapter build`，再 `node W1-effort-free-check.mjs`。
import { mkdtemp, mkdir, readdir } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
const { ClaudeProvider } = await import(new URL('../../../../packages/agent-adapter/dist/claude/index.js', import.meta.url).href);
const transcripts = async () => { try { return (await readdir(join(homedir(), '.claude', 'projects'), { recursive: true })).filter(f => f.endsWith('.jsonl')).length; } catch { return -1; } };
const before = await transcripts();
const cwd = join(await mkdtemp(join(tmpdir(), 'verify-effort-')), 'project with spaces'); await mkdir(cwd, { recursive: true });
const provider = new ClaudeProvider();
const out = {};
try {
  const session = await provider.createSession({ cwd, environment: { env: { ...process.env } } });
  out.catalog = (await session.listModels()).map(m => `${m.id}:${(m.reasoningEfforts ?? []).join(',')}`);
  const attempt = async (label, fn) => { try { await fn(); out[label] = 'ok'; } catch (e) { out[label] = `${e.code}`; } };
  await attempt('low', () => session.setReasoningEffort('low'));
  await attempt('max', () => session.setReasoningEffort('max'));
  await attempt('ultra', () => session.setReasoningEffort('ultra'));
  await attempt('null', () => session.setReasoningEffort(null));
  await session.setModel('haiku'); await attempt('haiku-xhigh', () => session.setReasoningEffort('xhigh'));
  await session.dispose();
} finally { await provider.dispose(); }
out.transcriptsDelta = (await transcripts()) - before;
console.log(JSON.stringify(out));
