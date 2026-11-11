import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? process.cwd())
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : []
  })
}
const source = files(join(root, 'apps/desktop/src'))
const forbidden = /projectViewContract|studio\(\)\.projectView|studio\.projectView|ProjectViewService|projectViewsFor|useProjectViews|installProjectViewIntegration/
const oldPublicPaths = source.filter(path => forbidden.test(readFileSync(path, 'utf8')))
const runtimeLeaks = source.filter(path => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx') && !path.includes('/main/services/workbench/') && /(?:KnowledgeRuntime|WebRuntime)/.test(readFileSync(path, 'utf8')))
const required = ['shared/workbench/types.ts', 'shared/workbench/presets.ts', 'shared/ipc/workbench.ts', 'main/services/workbench/workbench-service.ts', 'renderer/src/features/workbench/store.ts', 'renderer/src/features/workbench/integration.tsx']
const missing = required.filter(path => !source.includes(join(root, 'apps/desktop/src', path)))
const result = { sourceFiles: source.length, oldPublicPaths, runtimeLeaks, missing, passed: !oldPublicPaths.length && !runtimeLeaks.length && !missing.length }
console.log(JSON.stringify(result, null, 2))
if (!result.passed) process.exitCode = 1
