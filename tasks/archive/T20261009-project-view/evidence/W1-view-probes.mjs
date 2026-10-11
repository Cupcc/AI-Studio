// W1 protocol probes for T20261009-project-view. NO MODEL CALLS: no turn/start, no user message is ever sent.
//
// Usage:
//   node W1-view-probes.mjs [--sdk-dir <path to @anthropic-ai/claude-agent-sdk>] [--out <results.json>]
//
// Checks (all against the locally installed CLIs; fixtures are created in a fresh temp directory):
//   codex.skills      skills/list before/after skills/extraRoots/set; instructionSources from thread/start; experimentalApi gating
//   codex.sandbox     `codex sandbox --permission-profile` write probe: which project sub-directories are writable
//   claude.plugin     Agent SDK `plugins` (local) + `skills: 'all'` with settingSources [] -> is a bundled skill loaded
// Only fixture names are reported; the user's own skills/plugins are filtered out of the output.
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const sdkDir = opt('--sdk-dir');
const outFile = opt('--out');

const root = mkdtempSync(path.join(tmpdir(), 'ai-studio-w1-'));
const project = path.join(root, 'project-a');
const bundledSkills = path.join(root, 'studio-skills');
const plugin = path.join(root, 'studio-plugin');
const put = (p, s) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, s); };

put(path.join(project, 'AGENTS.md'), '# Project A\nProbe AGENTS.md.\n');
put(path.join(project, '.agents/skills/repo-skill/SKILL.md'), '---\nname: repo-skill\ndescription: Probe repo-scope skill.\n---\nBody.\n');
put(path.join(bundledSkills, 'studio-project-view/SKILL.md'), '---\nname: studio-project-view\ndescription: Probe app-bundled skill.\n---\nBody.\n');
put(path.join(plugin, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'studio', description: 'probe', version: '0.0.1' }));
put(path.join(plugin, 'skills/project-view/SKILL.md'), '---\nname: project-view\ndescription: Probe skill.\n---\nBody.\n');
for (const d of ['.git', '.codex', '.agents', '.claude', '.ai-studio/knowledge']) mkdirSync(path.join(project, d), { recursive: true });

const results = { generatedFor: 'T20261009-project-view W1', fixtures: 'temp dir (removed at exit)', versions: {} };
const ver = (cmd, a) => spawnSync(cmd, a, { encoding: 'utf8' }).stdout.trim();
results.versions.codex = ver('codex', ['--version']);
results.versions.claude = ver('claude', ['--version']);
results.versions.node = process.version;

// ---------- Codex app-server client ----------
function codexClient(experimentalApi) {
  const p = spawn('codex', ['app-server', '--listen', 'stdio://'], { cwd: project, stdio: ['pipe', 'pipe', 'ignore'] });
  let seq = 0; const pending = new Map();
  createInterface({ input: p.stdout }).on('line', l => {
    let m; try { m = JSON.parse(l); } catch { return; }
    if (m.id !== undefined && !m.method) {
      const cb = pending.get(m.id); pending.delete(m.id);
      m.error ? cb.reject(new Error(JSON.stringify(m.error))) : cb.resolve(m.result);
    }
  });
  const send = m => p.stdin.write(JSON.stringify(m) + '\n');
  const req = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); send({ id, method, params });
    setTimeout(() => reject(new Error('timeout ' + method)), 20000);
  });
  return {
    async init() {
      await req('initialize', { clientInfo: { name: 'ai_studio_w1_probe', title: 'W1 probe', version: '0.0.1' }, capabilities: { experimentalApi } });
      send({ method: 'initialized', params: {} });
    },
    req, close: () => p.kill(),
  };
}
const fixtureSkills = r => (r.data ?? []).flatMap(e => e.skills ?? [])
  .filter(s => /repo-skill|studio-project-view/.test(s.name)).map(s => ({ name: s.name, scope: s.scope, enabled: s.enabled }));

async function codexSkills() {
  const out = {};
  const c = codexClient(false);
  try {
    await c.init();
    out.skillsListBefore = fixtureSkills(await c.req('skills/list', { cwds: [project], forceReload: true }));
    out.extraRootsSet_experimentalApiFalse = await c.req('skills/extraRoots/set', { extraRoots: [bundledSkills] });
    out.skillsListAfter = fixtureSkills(await c.req('skills/list', { cwds: [project], forceReload: true }));
    const t = await c.req('thread/start', {
      cwd: project, ephemeral: true, sandbox: 'read-only', approvalPolicy: 'untrusted',
      developerInstructions: 'PROBE developer instructions (no turn is started).',
    });
    out.threadStartAcceptsDeveloperInstructions = true;
    out.instructionSources = (t.instructionSources ?? []).map(p => path.relative(root, p));
  } catch (e) { out.error = String(e); } finally { c.close(); }
  return out;
}

// ---------- Codex sandbox write probe ----------
function sandboxProbe(profile) {
  const script = [
    'for d in . .git .codex .agents .claude .ai-studio .ai-studio/knowledge; do',
    '  if ( : > "$d/w1-probe.txt" ) 2>/dev/null; then echo "$d=writable"; else echo "$d=denied"; fi',
    'done',
    `T="${homedir()}/.w1-external-write-probe.txt"`,
    'if ( : > "$T" ) 2>/dev/null; then echo "outside-project(home)=writable"; rm -f "$T"; else echo "outside-project(home)=denied"; fi',
  ].join('\n');
  put(path.join(root, 'write-probe.sh'), script + '\n');
  const r = spawnSync('codex', ['sandbox', '--permission-profile', profile, '-C', project, 'sh', path.join(root, 'write-probe.sh')], { cwd: project, encoding: 'utf8' });
  return { exit: r.status, ...Object.fromEntries(r.stdout.trim().split('\n').filter(Boolean).map(l => l.split('='))) };
}

// ---------- Claude Agent SDK plugin probe ----------
async function claudePlugin() {
  if (!sdkDir) return { skipped: 'pass --sdk-dir <path to @anthropic-ai/claude-agent-sdk>' };
  const { query } = await import(pathToFileURL(path.join(sdkDir, 'sdk.mjs')).href);
  let release; const gate = new Promise(r => { release = r; });
  async function* input() { await gate; } // never yields a user message => no model call
  const claudeBin = ver('which', ['claude']);
  const q = query({ prompt: input(), options: {
    cwd: project, pathToClaudeCodeExecutable: claudeBin, settingSources: [],
    plugins: [{ type: 'local', path: plugin }], pluginDelivery: 'initialize', skills: 'all',
  } });
  const out = {};
  try {
    const init = await Promise.race([q.initializationResult(), new Promise((_, rej) => setTimeout(() => rej(new Error('init timeout')), 45000))]);
    out.plugins_applied = init.plugins_applied;
    out.fixtureCommands = (init.commands ?? []).map(c => c.name).filter(n => /project-view/.test(n));
  } catch (e) { out.error = String(e); }
  release(); try { q.close?.(); } catch { /* ignore */ }
  return out;
}

results.codexSkills = await codexSkills();
{ // experimentalApi gating of skills/extraRoots/set
  const c = codexClient(true);
  try { await c.init(); results.codexSkills.extraRootsSet_experimentalApiTrue = await c.req('skills/extraRoots/set', { extraRoots: [bundledSkills] }); }
  catch (e) { results.codexSkills.extraRootsSet_experimentalApiTrue = 'ERR ' + e; } finally { c.close(); }
}
results.codexSandbox = { ':workspace': sandboxProbe(':workspace'), ':read-only': sandboxProbe(':read-only') };
results.claudePlugin = await claudePlugin();

const text = JSON.stringify(results, null, 2);
if (outFile) writeFileSync(outFile, text + '\n');
console.log(text);
rmSync(root, { recursive: true, force: true });
if (existsSync(path.join(homedir(), '.w1-external-write-probe.txt'))) rmSync(path.join(homedir(), '.w1-external-write-probe.txt'));
setTimeout(() => process.exit(0), 300);
