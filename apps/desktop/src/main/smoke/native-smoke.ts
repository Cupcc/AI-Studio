// Native-dependency smoke check (`--studio-smoke-output=<file>`): SQLite
// read/write + repeatable migrations, a node-pty shell, the Terminal screen model
// (headless xterm + serialize addon + emulator-state capture), and login-shell
// environment with codex/claude discovery. The report is sanitized: only
// booleans, counts, versions and executable paths — never environment values.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getAppMeta, setAppMeta } from '../services/database/app-meta'
import { isInsideDirectory, openDatabase } from '../services/database/database'
import { migrations } from '../services/database/migrations'
import { runPtySmoke } from '../services/pty/pty-smoke'
import { createTerminalScreen } from '../services/terminal/screen'
import { findExecutable, probeExecutable, splitPath, type ExecutableProbe } from '../services/shell-env/executables'
import { resolveLoginEnv, toEnv } from '../services/shell-env/login-env'
import type { RendererSmokeResult } from './renderer-smoke'

export const SMOKE_EXECUTABLES = ['codex', 'claude'] as const
/** Reported, never gating: the project Diff degrades to an explanation when Git is missing. */
export const SMOKE_INFO_EXECUTABLES = ['git'] as const

export interface SmokeReport {
  schema: 1
  ok: boolean
  app: { version: string; isPackaged: boolean; platform: string; arch: string; electron: string; node: string }
  launchEnv: { pathEntryCount: number; codexOnLaunchPath: boolean; claudeOnLaunchPath: boolean }
  sqlite: {
    ok: boolean
    driver: 'node:sqlite'
    sqliteVersion?: string
    dbInsideUserData: boolean
    firstRunApplied: number
    secondRunApplied: number
    readBack: boolean
    error?: string
  }
  shellEnv: { ok: boolean; source: string; shell: string; durationMs: number; pathEntryCount: number; error?: string }
  pty: { ok: boolean; shell: string; receivedMarker: boolean; exitCode?: number; durationMs: number; error?: string }
  /** The packaged app must resolve the external `@xterm/*` packages and their private structures. */
  terminalScreen: { ok: boolean; serializedMarker: boolean; emulatorStateVersion?: number; xtermVersion?: string; error?: string }
  executables: Record<string, Omit<ExecutableProbe, 'name'>>
  /** Added by the main entry after loading the real window hidden. */
  renderer?: RendererSmokeResult
}

export interface SmokeInput {
  userDataDir: string
  app: SmokeReport['app']
  launchEnv?: NodeJS.ProcessEnv
}

export async function runNativeSmoke(input: SmokeInput): Promise<SmokeReport> {
  const launchEnv = input.launchEnv ?? process.env
  const sqlite = checkSqlite(input.userDataDir)
  const loginEnv = await resolveLoginEnv({ baseEnv: launchEnv })
  const pty = await runPtySmoke({ shell: loginEnv.shell, env: loginEnv.env })
  const terminalScreen = await checkTerminalScreen()
  const executables: SmokeReport['executables'] = {}
  for (const name of [...SMOKE_EXECUTABLES, ...SMOKE_INFO_EXECUTABLES]) {
    const { name: _ignored, ...probe } = await probeExecutable(name, loginEnv.env)
    executables[name] = probe
  }
  const launchPath = toEnv(launchEnv).PATH
  const report: SmokeReport = {
    schema: 1,
    ok: false,
    app: input.app,
    launchEnv: {
      pathEntryCount: splitPath(launchPath).length,
      codexOnLaunchPath: (await findExecutable('codex', launchPath)) !== null,
      claudeOnLaunchPath: (await findExecutable('claude', launchPath)) !== null
    },
    sqlite,
    shellEnv: {
      ok: loginEnv.source === 'login-shell',
      source: loginEnv.source,
      shell: loginEnv.shell,
      durationMs: loginEnv.durationMs,
      pathEntryCount: splitPath(loginEnv.env.PATH).length,
      ...(loginEnv.error ? { error: loginEnv.error } : {})
    },
    pty,
    terminalScreen,
    executables
  }
  report.ok =
    sqlite.ok &&
    report.shellEnv.ok &&
    pty.ok &&
    terminalScreen.ok &&
    SMOKE_EXECUTABLES.every((name) => executables[name]?.found && executables[name]?.version)
  return report
}

async function checkTerminalScreen(): Promise<SmokeReport['terminalScreen']> {
  const result: SmokeReport['terminalScreen'] = { ok: false, serializedMarker: false }
  try {
    const screen = createTerminalScreen(40, 5)
    try {
      await new Promise<void>((resolve) => screen.write('\u001b[31mSMOKE_SCREEN\u001b[0m\r\n', resolve))
      result.serializedMarker = screen.serialize().includes('SMOKE_SCREEN')
      const state = screen.emulatorState()
      result.emulatorStateVersion = state.version
      result.xtermVersion = state.xtermVersion
      result.ok = result.serializedMarker && state.version === 1 && state.cols === 40 && state.rows === 5
    } finally { screen.dispose() }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  }
  return result
}

function checkSqlite(userDataDir: string): SmokeReport['sqlite'] {
  const result: SmokeReport['sqlite'] = {
    ok: false,
    driver: 'node:sqlite',
    dbInsideUserData: false,
    firstRunApplied: 0,
    secondRunApplied: 0,
    readBack: false
  }
  try {
    const first = openDatabase({ userDataDir, migrations })
    result.firstRunApplied = first.migration.applied.length
    result.dbInsideUserData = isInsideDirectory(first.path, userDataDir)
    const token = `smoke-${Date.now()}`
    setAppMeta(first.db, 'smoke.lastRun', token)
    result.sqliteVersion = (first.db.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v
    first.close()
    // Reopen: migrations must be a no-op and the written value must persist.
    const second = openDatabase({ userDataDir, migrations })
    result.secondRunApplied = second.migration.applied.length
    result.readBack = getAppMeta(second.db, 'smoke.lastRun') === token
    second.close()
    result.ok = result.dbInsideUserData && result.secondRunApplied === 0 && result.readBack
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  }
  return result
}

export async function writeSmokeReport(file: string, report: SmokeReport): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}
