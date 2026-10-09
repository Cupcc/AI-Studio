// Launches the packaged app through LaunchServices (`open`), like Finder
// does, so it starts with launchd's minimal PATH. The app runs its native
// smoke checks, writes a sanitized JSON report and quits.
// Usage: node scripts/packaged-smoke.mjs [--out <file>] [--app <path.app>] [--user-data-dir <dir>]
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appDir, '..', '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const appPath = resolve(arg('--app', join(appDir, 'dist', `mac-${process.arch}`, 'AI Developer Studio.app')))
const out = arg('--out', join(repoRoot, '.runtime', 'desktop', 'packaged-smoke.json'))
if (!isAbsolute(resolve(out))) throw new Error('--out must resolve to an absolute path')
const outPath = resolve(out)

if (!existsSync(appPath)) {
  console.error(`Packaged app not found: ${appPath}\nRun \`pnpm package\` first.`)
  process.exit(2)
}
// A smoke run must not migrate or write to the user's real application data.
// Keep the temporary directory for diagnosis; an explicit path allows a caller
// to exercise migration/relaunch behavior intentionally.
const requestedUserData = arg('--user-data-dir', undefined)
const userDataDir = requestedUserData
  ? resolve(requestedUserData)
  : mkdtempSync(join(tmpdir(), 'ai-studio-packaged-smoke-'))
rmSync(outPath, { force: true })

// On current macOS, `open` forwards the caller's environment to the app, so a
// terminal PATH would leak in. Invoke it with launchd's default GUI
// environment instead (minimal PATH, no SHELL) to reproduce a Finder launch.
const launchdEnv = {
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  HOME: process.env.HOME ?? '',
  USER: process.env.USER ?? '',
  LOGNAME: process.env.LOGNAME ?? process.env.USER ?? '',
  TMPDIR: process.env.TMPDIR ?? '/tmp/'
}

// -n: new instance, -W: wait until it quits. Arguments after --args reach the app.
await promisify(execFile)('/usr/bin/open', ['-n', '-W', appPath, '--args', `--studio-smoke-output=${outPath}`, `--studio-user-data-dir=${userDataDir}`], {
  env: launchdEnv,
  timeout: 120_000
})

if (!existsSync(outPath)) {
  console.error('The app did not write a smoke report.')
  process.exit(1)
}
const report = JSON.parse(readFileSync(outPath, 'utf8'))
console.log(JSON.stringify(report, null, 2))
console.log(`User data (isolated): ${userDataDir}`)
console.log(`\nReport: ${outPath}\nResult: ${report.ok ? 'PASS' : 'FAIL'}`)
process.exit(report.ok ? 0 : 1)
