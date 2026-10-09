import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareVersions, execBounded, parseVersion, resolveExecutable } from '../../src/core/exec.js';
import { AdapterError } from '../../src/errors.js';

async function fakeCli(name: string, body: string): Promise<{ dir: string; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'agent-adapter-exec-'));
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return { dir, path };
}

describe('resolveExecutable', () => {
  it('finds an executable on the supplied PATH only, never on process.env implicitly', async () => {
    const { dir, path } = await fakeCli('fake-codex', 'echo "codex-cli 0.161.0"');
    expect(await resolveExecutable('fake-codex', { env: { PATH: `/nonexistent:${dir}` } })).toEqual({ path, source: 'path' });
    expect(await resolveExecutable('fake-codex', { env: { PATH: '/usr/bin' } })).toBeUndefined();
    expect(await resolveExecutable('fake-codex', { env: {} })).toBeUndefined();
  });

  it('honours an explicit path and rejects non-executables', async () => {
    const { path } = await fakeCli('explicit-cli', 'true');
    expect(await resolveExecutable('ignored', { env: {}, explicitPath: path })).toEqual({ path, source: 'explicit' });
    await chmod(path, 0o644);
    expect(await resolveExecutable('ignored', { env: {}, explicitPath: path })).toBeUndefined();
  });
});

describe('execBounded', () => {
  it('captures output with the supplied environment', async () => {
    const { path } = await fakeCli('versioned', 'echo "tool $MARKER 2.1.295 (Claude Code)"; echo warn >&2');
    const result = await execBounded(path, ['--version'], { env: { MARKER: 'x', PATH: '/usr/bin:/bin' } });
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('tool x 2.1.295 (Claude Code)');
    expect(result.stderr.trim()).toBe('warn');
    expect(result.timedOut).toBe(false);
  });

  it('kills the process group on timeout and truncates large output', async () => {
    const { path } = await fakeCli('slow', 'head -c 5000 /dev/zero | tr "\\0" a; sleep 30');
    const started = Date.now();
    const result = await execBounded(path, [], { env: { PATH: '/usr/bin:/bin' }, timeoutMs: 300, maxOutputBytes: 100 });
    expect(result.timedOut).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBe(100);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('maps a missing file to not_installed', async () => {
    const error = await execBounded('/nonexistent/cli', [], { env: {} }).catch((e: unknown) => e);
    expect((error as AdapterError).code).toBe('not_installed');
  });
});

describe('versions', () => {
  it('parses and compares dotted versions', () => {
    expect(parseVersion('codex-cli 0.161.0')).toBe('0.161.0');
    expect(parseVersion('2.1.295 (Claude Code)')).toBe('2.1.295');
    expect(parseVersion('no version')).toBeUndefined();
    expect(compareVersions('2.1.295', '2.1.294')).toBe(1);
    expect(compareVersions('0.161.0', '0.161')).toBe(0);
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1);
  });
});
