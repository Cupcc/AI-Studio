// Rebuild the pinned subset from the installed CLI; no model request is made.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = '0.161.0';
const executable = process.argv[2] ?? 'codex';
const actual = execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim();
if (actual !== `codex-cli ${version}`) throw new Error(`Expected ${version}; found ${actual}`);
const scratch = await mkdtemp(join(tmpdir(), 'ai-studio-codex-types-'));
execFileSync(executable, ['app-server', 'generate-ts', '--experimental', '--out', scratch]);
const output = join(dirname(fileURLToPath(import.meta.url)), 'protocol');
const roots = ['InitializeParams', 'InitializeResponse', ...[
  'ThreadStartParams', 'ThreadStartResponse', 'ThreadResumeParams', 'ThreadResumeResponse',
  'TurnStartParams', 'TurnStartResponse', 'TurnSteerParams', 'TurnSteerResponse',
  'TurnInterruptParams', 'TurnInterruptResponse', 'ThreadSettingsUpdateParams',
  'ThreadSettingsUpdateResponse', 'ThreadBackgroundTerminalsListParams',
  'ThreadBackgroundTerminalsListResponse', 'ThreadBackgroundTerminalsTerminateParams',
  'ThreadBackgroundTerminalsTerminateResponse', 'ModelListParams', 'ModelListResponse',
  'ConfigReadParams', 'ConfigReadResponse', 'CommandExecutionRequestApprovalParams',
  'CommandExecutionRequestApprovalResponse', 'FileChangeRequestApprovalParams',
  'FileChangeRequestApprovalResponse', 'ToolRequestUserInputParams', 'ToolRequestUserInputResponse',
  'PermissionsRequestApprovalParams', 'PermissionsRequestApprovalResponse',
  'TurnStartedNotification', 'TurnCompletedNotification', 'ItemStartedNotification',
  'ItemCompletedNotification', 'AgentMessageDeltaNotification', 'ReasoningTextDeltaNotification',
  'ReasoningSummaryTextDeltaNotification', 'CommandExecutionOutputDeltaNotification',
  'ErrorNotification', 'ServerRequestResolvedNotification', 'ThreadNameUpdatedNotification',
  'ModelReroutedNotification',
].map((name) => `v2/${name}`)];
const hashes = {};
async function copy(relative) {
  if (relative in hashes) return;
  const source = await readFile(join(scratch, relative), 'utf8');
  hashes[relative] = createHash('sha256').update(source).digest('hex');
  // Only mechanical ESM extension adjustment; the generated schema is unchanged.
  const esm = source.replace(/from "([^"]+)"/g, (_, ref) => `from "${ref}.js"`);
  await mkdir(dirname(join(output, relative)), { recursive: true });
  await writeFile(join(output, relative), esm);
  for (const [, ref] of source.matchAll(/from "([^"]+)"/g)) {
    const dependency = resolve(dirname(join(scratch, relative)), `${ref}.ts`).slice(scratch.length + 1);
    await copy(dependency);
  }
}
for (const root of roots) await copy(`${root}.ts`);
await writeFile(join(output, 'manifest.json'), `${JSON.stringify({
  cliVersion: version,
  generatedBy: 'codex app-server generate-ts --experimental',
  transformation: 'relative import specifiers gain .js for Node ESM',
  upstream: 'https://github.com/openai/codex/tree/rust-v0.161.0',
  sourceSha256: Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b))),
}, null, 2)}\n`);
console.log(`Generated ${Object.keys(hashes).length} types for Codex ${version}`);
