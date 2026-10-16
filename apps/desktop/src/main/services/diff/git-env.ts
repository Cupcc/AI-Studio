// The only way Git is configured by this service: a scrubbed environment and fixed global arguments. Nothing that the
// host process or the repository can set may change which program runs, which repository is read or how output looks.
import type { Env } from '../shell-env/login-env'

/**
 * Removes every GIT_* variable (a host GIT_DIR / GIT_WORK_TREE / GIT_EXTERNAL_DIFF / GIT_CONFIG_* must not redirect
 * the query), then pins the few that make Git non-interactive, locale-independent and literal about paths.
 */
export function scrubbedGitEnv(base: Env): Env {
  const env: Env = {}
  for (const [key, value] of Object.entries(base)) {
    if (!key.startsWith('GIT_')) env[key] = value
  }
  return {
    ...env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    LC_ALL: 'C',
    GIT_LITERAL_PATHSPECS: '1'
  }
}

/**
 * Before the subcommand. `core.fsmonitor=false` and `diff.external=` stop a repository's own config from running
 * programs; `core.quotepath=false` keeps non-ASCII names readable where `-z` is not used.
 */
export const GIT_GLOBAL_ARGS: readonly string[] = [
  '--no-optional-locks',
  '--literal-pathspecs',
  '-c', 'core.fsmonitor=false',
  // Diff is read-only. A stat refresh may update the isolated index below and invoke this hook otherwise.
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.quotepath=false',
  '-c', 'color.ui=false',
  '-c', 'diff.external=',
  '-c', 'core.pager=cat'
]

/** After `diff`: no external diff program, no textconv, no colour, rename detection only (no copies). */
export const GIT_DIFF_ARGS: readonly string[] = ['--no-ext-diff', '--no-textconv', '--no-color', '-M']
