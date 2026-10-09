import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';
import { adapterError } from '../errors.js';
import type { ExecutableInfo } from '../provider.js';

/**
 * Locates an executable from an explicit path or the supplied environment's PATH.
 * Never consults `process.env`; the host passes the resolved login-shell environment.
 */
export async function resolveExecutable(
  name: string,
  options: { env: Readonly<Record<string, string | undefined>>; explicitPath?: string },
): Promise<ExecutableInfo | undefined> {
  if (options.explicitPath) {
    return (await isExecutableFile(options.explicitPath)) ? { path: options.explicitPath, source: 'explicit' } : undefined;
  }
  const pathValue = options.env.PATH ?? options.env.Path ?? '';
  for (const dir of pathValue.split(delimiter)) {
    if (!dir || !isAbsolute(dir)) continue;
    const candidate = join(dir, name);
    if (await isExecutableFile(candidate)) return { path: candidate, source: 'path' };
  }
  return undefined;
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export interface ExecResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Output beyond `maxOutputBytes` was dropped. */
  truncated: boolean;
}

/**
 * Runs a short-lived command (e.g. `--version`, `login status`) with a bounded wait and bounded
 * output, in its own process group so a timeout kills the whole group.
 */
export function execBounded(
  file: string,
  args: readonly string[],
  options: {
    env: Readonly<Record<string, string | undefined>>;
    cwd?: string;
    timeoutMs?: number;
    maxOutputBytes?: number;
    signal?: AbortSignal;
  },
): Promise<ExecResult> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxOutputBytes ?? 256 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], {
      cwd: options.cwd,
      env: options.env as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;
    const append = (current: string, chunk: string) => {
      if (current.length + chunk.length > maxBytes) {
        truncated = true;
        return (current + chunk).slice(0, maxBytes);
      }
      return current + chunk;
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr = append(stderr, chunk);
    });
    const killGroup = () => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, timeoutMs);
    const onAbort = () => killGroup();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.once('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      reject(
        adapterError(error.code === 'ENOENT' ? 'not_installed' : 'spawn_failed', `Failed to run ${file}: ${error.message}`, {
          cause: error,
          native: { source: 'exec', code: error.code ?? 'unknown', message: error.message },
        }),
      );
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve({ code, signal, stdout, stderr, timedOut, truncated });
    });
  });
}

/** Extracts the first dotted version number (e.g. `codex-cli 0.161.0` → `0.161.0`). */
export function parseVersion(raw: string): string | undefined {
  const match = /\b(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)\b/.exec(raw);
  return match?.[1];
}

/** Numeric comparison of dotted versions; pre-release suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split(/[-+]/)[0]!.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}
