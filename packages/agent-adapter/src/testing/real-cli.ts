import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderEnvironment } from '../provider.js';

/** Real CLI tests run only when explicitly enabled (2026-10-09 confirmation in task.md). */
export function realCliEnabled(): boolean {
  return process.env.AI_STUDIO_REAL_CLI === '1';
}

/** Environment for integration tests: the shell's env, optionally with an explicit executable. */
export function hostEnvironmentForTests(executablePath?: string): ProviderEnvironment {
  const environment: ProviderEnvironment = { env: { ...process.env } };
  if (executablePath) environment.executablePath = executablePath;
  return environment;
}

/**
 * Creates a throwaway project directory outside the repository (so the CLI does not load
 * this repository's AGENTS.md). The path contains spaces on purpose, like the preflight.
 */
export async function createScratchProject(prefix = 'agent-adapter'): Promise<{ root: string; cwd: string }> {
  const root = await mkdtemp(join(tmpdir(), `ai-studio-${prefix}-`));
  const cwd = join(root, 'project with spaces');
  await mkdir(cwd, { recursive: true });
  return { root, cwd };
}
