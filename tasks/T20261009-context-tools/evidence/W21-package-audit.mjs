// Independent final artifact audit; reads existing build/package without rebuilding or launching the app.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const desktop = join(repository, 'apps/desktop')
const packagedRoot = join(desktop, 'dist/mac-arm64')
const app = readdirSync(packagedRoot).find((name) => name.endsWith('.app'))
assert(app, 'packaged .app missing')
const archive = readFileSync(join(packagedRoot, app, 'Contents/Resources/app.asar'))
const base = 8 + archive.readUInt32LE(4)
const header = JSON.parse(archive.subarray(16, 16 + archive.readUInt32LE(12)).toString('utf8'))
const packed = new Map()
function unpack(node, prefix = '') {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const path = prefix ? `${prefix}/${name}` : name
    if (entry.files) unpack(entry, path)
    else if (path.startsWith('out/') && !entry.unpacked && entry.offset !== undefined) {
      packed.set(path, archive.subarray(base + Number(entry.offset), base + Number(entry.offset) + entry.size))
    }
  }
}
unpack(header)
function builtPaths(path = 'out') {
  return readdirSync(join(desktop, path)).flatMap((name) => {
    const next = `${path}/${name}`
    return statSync(join(desktop, next)).isDirectory() ? builtPaths(next) : [next]
  })
}
const paths = builtPaths().sort()
assert.deepEqual([...packed.keys()].sort(), paths, 'built/packaged file collections differ')
const hashes = {}
for (const path of paths) {
  const disk = readFileSync(join(desktop, path))
  assert(disk.equals(packed.get(path)), `packaged bytes differ: ${path}`)
  if (path.startsWith('out/main/') || path.startsWith('out/preload/') || path.endsWith('/index.html')) {
    hashes[path] = createHash('sha256').update(disk).digest('hex')
  }
}
assert(paths.includes('out/main/directory-reader-worker.js'), 'isolated worker absent from package')
const worker = packed.get('out/main/directory-reader-worker.js').toString('utf8')
assert(worker.includes('process.type === "utility"'), 'utility entry guard missing')
assert(worker.includes('cwd.dev.toString() !== request.dev') && worker.includes('cwd.ino.toString() !== request.ino'), 'cwd identity verification missing')
const main = packed.get('out/main/index.js').toString('utf8')
assert(main.includes('utilityProcess.fork') && main.includes('directory-reader-worker.js'), 'main does not launch packaged worker')
assert(main.includes('delete env.NODE_OPTIONS') && main.includes('delete env.NODE_PATH'), 'inherited loader guards missing')
const changes = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'apps/desktop/src', 'apps/desktop/electron.vite.config.ts'], { cwd: repository, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const sourceDiff = execFileSync('git', ['diff', 'HEAD', '--', 'apps/desktop/src', 'apps/desktop/electron.vite.config.ts'], { cwd: repository })
console.log(JSON.stringify({ baseline: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(), filesCompared: paths.length, allBytesEqual: true, mainWorkerAndPreloadHashes: hashes, currentSourceDelta: changes, currentSourceDiffSha256: createHash('sha256').update(sourceDiff).digest('hex') }, null, 2))
