import { describe, expect, it } from 'vitest';
import { execBounded, parseVersion, resolveExecutable } from '../../src/core/exec.js';
import { hostEnvironmentForTests, realCliEnabled } from '../../src/testing/index.js';

// Discovery only: resolves the installed CLIs and reads `--version`. No model calls.
describe.runIf(realCliEnabled())('real CLI discovery', () => {
  it.each(['codex', 'claude'])('finds %s on the supplied PATH and reads its version', async (name) => {
    const { env } = hostEnvironmentForTests();
    const executable = await resolveExecutable(name, { env });
    expect(executable?.source).toBe('path');
    const result = await execBounded(executable!.path, ['--version'], { env, timeoutMs: 15_000 });
    expect(result.code).toBe(0);
    expect(parseVersion(result.stdout)).toMatch(/^\d+\.\d+/);
  });
});
