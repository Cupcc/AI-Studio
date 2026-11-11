import { createRequire } from 'node:module'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import readline from 'node:readline'

const root = resolve(process.argv[2] ?? process.cwd())
const appDir = join(root, 'apps/desktop')
const evidence = join(root, '.agents/archive/tasks/T20261111-workbench-web-format/evidence')
const { _electron: electron } = createRequire(join(appDir, 'package.json'))('@playwright/test')
const fixture = process.argv[3] ?? mkdtempSync(join(tmpdir(), 'studio-web-format-review-'))
const projects = [join(fixture, 'Web Format Review Project'), join(fixture, 'Second Web Review Project')]
projects.forEach(path => mkdirSync(path, { recursive: true }))
const userData = join(fixture, 'user-data')
let port = 0
const env = { ...process.env }
delete env.STUDIO_E2E_PROVIDERS
let app, page, projectIndex = 0, starts = 0

async function launch() {
  rmSync(join(userData, 'DevToolsActivePort'), { force: true })
  app = await electron.launch({ args: [appDir, '--remote-debugging-port=0', `--studio-user-data-dir=${userData}`], cwd: appDir, env, colorScheme: null })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  for (let attempt = 0; attempt < 200; attempt++) {
    try { port = Number(readFileSync(join(userData, 'DevToolsActivePort'), 'utf8').split('\n')[0]); if (port) break } catch {}
    await delay(50)
  }
  if (!port) throw new Error('Private CDP port was not published')
  const pid = app.process().pid
  const listeners = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8' }).trim().split('\n').filter(line => line.startsWith('p')).map(line => Number(line.slice(1)))
  if (!listeners.includes(pid)) throw new Error('Private CDP listener does not belong to launched Electron process')
  page.on('pageerror', error => appendFileSync(join(evidence, 'W3-page-errors.log'), `${error.name}: ${error.message.slice(0, 1000)}\n`))
  await app.evaluate(({ dialog, BrowserWindow, app }, project) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] })
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
    app.focus({ steal: true })
    BrowserWindow.getAllWindows()[0].focus()
  }, projects[projectIndex])
  const info = { ready: true, starts: ++starts, port, pid, listenerPids: listeners, fixture, projects, userData, providerMode: 'real', messagesSentByLauncher: 0, fixtureInjection: 'native directory picker result and window size/focus only', isPackaged: await app.evaluate(({ app }) => app.isPackaged) }
  writeFileSync(join(evidence, 'W3-launch.json'), JSON.stringify(info, null, 2))
  appendFileSync(join(evidence, 'W3-launch-history.jsonl'), `${JSON.stringify(info)}\n`)
  console.log(JSON.stringify(info))
}

await launch()
const control = readline.createInterface({ input: process.stdin })
control.on('line', async line => {
  try {
    if (line === 'project2') {
      projectIndex = 1
      await app.evaluate(({ dialog }, project) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] }) }, projects[projectIndex])
      console.log('Second Project picker ready')
    }
    if (line === 'restart') { await app.close(); await launch() }
    if (line === 'quit') { await app.close(); console.log('Closed review application'); process.exit(0) }
  } catch (error) { console.log(JSON.stringify({ error: error.message })) }
})
