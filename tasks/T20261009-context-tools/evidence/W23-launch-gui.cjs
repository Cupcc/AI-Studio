const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');
const repo = process.cwd(), appDir = join(repo, 'apps/desktop');
const { _electron } = require(require.resolve('@playwright/test', { paths: [appDir] }));
(async () => {
  const base = process.argv[2] || mkdtempSync(join(tmpdir(), 'studio-w23-ui-'));
  const project = join(base, 'W23 Native Diff'), otherProject = join(base, 'W23 Other Project');
  if (!process.argv[2]) {
    for (const root of [project, otherProject]) { mkdirSync(root); writeFileSync(join(root, 'native.txt'), 'before\n'); }
  }
  const app = await _electron.launch({ args: [appDir, '--remote-debugging-port=9341', `--studio-user-data-dir=${join(base, 'user data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } });
  await app.firstWindow();
  await app.evaluate(({ dialog, BrowserWindow, app }, paths) => {
    let next = 0;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths[Math.min(next++, paths.length - 1)]] });
    const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(1440, 900); win.show(); app.focus({ steal: true }); win.focus();
  }, [project, otherProject]);
  const fixture = { base, project, otherProject, pid: app.process().pid, port: 9341, provider: 'simulated', mainBundleSha256: createHash('sha256').update(readFileSync(join(appDir, 'out/main/index.js'))).digest('hex') };
  writeFileSync('tasks/T20261009-context-tools/evidence/W23-gui-fixture.json', JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({ ready: true, ...fixture }));
  const close = async () => { await app.close().catch(() => {}); process.exit(0); };
  process.on('SIGINT', close); process.on('SIGTERM', close);
  await new Promise(() => {});
})();
