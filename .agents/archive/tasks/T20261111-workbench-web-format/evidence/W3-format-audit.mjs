import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? process.cwd())
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}
const source = files(join(root, 'apps/desktop/src')).filter(path => /\.tsx?$/.test(path))
const forbidden = /KnowledgePreview|OverviewSessions|ViewRenderer|ProjectViewService|projectViewContract|runtime:\s*['"]declarative['"]/
const nativePaths = source.filter(path => forbidden.test(readFileSync(path, 'utf8')))
const runtimeLeaks = source.filter(path => !/\.test\.tsx?$/.test(path) && !path.includes('/main/services/workbench/') && /(?:KnowledgeResources|PackageRuntime)/.test(readFileSync(path, 'utf8')))
const presets = ['overview', 'progress', 'architecture', 'agent-team', 'business-flow']
const packages = presets.map(name => {
  const directory = join(root, 'apps/desktop/out/workbench-packages', name)
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
  const required = ['manifest.json', manifest.entry, 'page.js', 'renderer.js', 'style.css', ...[400, 500, 600].map(weight => `ibm-plex-sans-latin-${weight}-normal.woff2`)]
  return { name, manifest, missing: required.filter(path => !existsSync(join(directory, path))), sha256: Object.fromEntries(files(directory).map(path => [path.slice(directory.length + 1), createHash('sha256').update(readFileSync(path)).digest('hex')])) }
})
const sharedAssetsIdentical = ['page.js', 'renderer.js', 'style.css'].every(asset => packages.every(pkg => pkg.sha256[asset] === packages[0].sha256[asset]))
const result = { sourceFiles: source.length, nativePaths, runtimeLeaks, sharedAssetsIdentical, packages, passed: !nativePaths.length && !runtimeLeaks.length && sharedAssetsIdentical && packages.every(pkg => !pkg.missing.length && pkg.manifest.sdkVersion === 1 && /\.html$/.test(pkg.manifest.entry)) }
console.log(JSON.stringify(result, null, 2))
if (!result.passed) process.exitCode = 1
