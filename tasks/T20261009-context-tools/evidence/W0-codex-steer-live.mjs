import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { CodexProvider } from '../../../../packages/agent-adapter/dist/codex/index.js';

const root = mkdtempSync(join(tmpdir(), 'studio-steer-reference-'));
const token = `steer-${crypto.randomUUID()}`;
const filename = 'steered reference #中文.txt';
writeFileSync(join(root, filename), `verification-token: ${token}\n`);
const login = spawnSync('codex', ['login', 'status'], { encoding: 'utf8' });
const report = { version: spawnSync('codex', ['--version'], { encoding: 'utf8' }).stdout.trim(),
  login: /logged in/i.test(`${login.stdout}\n${login.stderr}`) ? 'logged_in' : 'unknown',
  root, filename, token, events: [], answer: '' };
const provider = new CodexProvider();
try {
  const session = await provider.createSession({ cwd: root, environment: { env: process.env },
    overrides: { approvalPolicy: 'never', sandboxMode: 'workspace-write' } });
  let sent = false, steerPromise;
  let complete;
  const done = new Promise(resolve => { complete = resolve; });
  const off = session.subscribe(event => {
    if (event.type === 'turn.started') report.startedTurn = event.turnId;
    if (event.type === 'turn.diff.updated') report.events.push({ type: event.type, state: event.diff.state,
      source: event.diff.source, nativeSessionId: event.diff.nativeSessionId, nativeTurnId: event.diff.nativeTurnId,
      cliVersion: event.diff.cliVersion, protocolVersion: event.diff.protocolVersion });
    if (event.type === 'item.completed' && event.item.kind === 'assistant_message') report.answer += event.item.text ?? '';
    if (event.type === 'item.started' && event.item.kind === 'command' && !sent) {
      sent = true;
      report.steeredWhile = session.state;
      steerPromise = session.sendUserInput({ text: 'Additional task for this same turn: read the attached referenced file and report its verification token. Do not write files.',
        attachments: [{ kind: 'file', path: join(root, filename), name: filename }] })
        .then(result => { report.steerAccepted = result; }, error => { report.steerError = error.message; });
    }
    if (event.type === 'session.error') report.error = event.error.message;
    if (event.type === 'turn.completed') { report.outcome = event.outcome; report.completedTurn = event.turnId; complete(); }
  });
  await session.sendUserInput({ text: 'Run a shell command that sleeps for 4 seconds, then reply ready. Make no file changes. An additional user input may arrive while the command runs.' });
  await done;
  await steerPromise;
  off();
  report.referenceReceived = report.answer.includes(token);
  report.sameTurn = report.steerAccepted?.turnId === report.startedTurn && report.completedTurn === report.startedTurn;
} catch (error) { report.error = error.message; }
finally {
  await provider.dispose();
  writeFileSync('.runtime/turn-diff/steer-live.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outcome: report.outcome, sameTurn: report.sameTurn, referenceReceived: report.referenceReceived, error: report.error, steerError: report.steerError }));
}
