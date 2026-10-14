import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../../../apps/desktop/package.json', import.meta.url))
const electron = require('electron')
const appDir = fileURLToPath(new URL('../../../apps/desktop/', import.meta.url))
const root = mkdtempSync(join(tmpdir(), 'studio-w4-runtime-'))
const projects = ['W4 Project One', 'W4 Project Two'].map(name => join(root, name))
projects.forEach(path => mkdirSync(path))
const html = `<!doctype html><html><head><title>W4 Local Preview</title><style>body{font:18px system-ui;padding:24px;background:#eef4f1;color:#183b2d}button,a{display:block;margin:16px 0}pre{white-space:pre-wrap}</style></head><body><h1>W4 Local Preview</h1><pre id="probe"></pre><p id="marker"></p><button id="set" onclick="localStorage.setItem('marker','PROJECT-ONE');location.reload()">Set Project Marker</button><a id="external" href="https://example.com/w4">External Link</a><a id="redirect" href="/redirect">External Redirect</a><button id="window" onclick="window.open('https://example.com/window')">External New Window</button><a href="/next">Local Next Page</a><script>document.querySelector('#probe').textContent=JSON.stringify({node:typeof require,process:typeof process,studio:typeof window.studio});document.querySelector('#marker').textContent='Marker: '+(localStorage.getItem('marker')||'EMPTY');</script></body></html>`
const server = createServer((request, response) => {
  if (request.url === '/redirect') { response.writeHead(302, { location: 'https://example.com/redirect' }); response.end(); return }
  response.writeHead(200, { 'content-type': 'text/html' }); response.end(html)
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const port = server.address().port
const child = spawn(electron, [appDir, '--studio-user-data-dir=' + join(root, 'user-data'), '--remote-debugging-port=9383'], {
  env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' }, stdio: ['ignore', 'pipe', 'pipe']
})
console.log(JSON.stringify({ root, projects, url: 'http://127.0.0.1:' + port + '/', cdpPort: 9383, pid: child.pid }))
child.stdout.on('data', data => process.stdout.write(data))
child.stderr.on('data', data => process.stderr.write(data))
child.on('exit', () => { server.close(); process.exit(0) })
process.on('SIGINT', () => { child.kill('SIGTERM'); server.close() })
