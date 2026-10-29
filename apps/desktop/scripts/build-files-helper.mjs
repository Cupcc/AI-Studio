// Called by the Vite and Vitest configs: build once per changed source / architecture. Users of the packaged app
// need no compiler. The helper has only system libc dependencies and targets the same macOS 13 minimum as the app.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export function buildFilesHelper() {
  if (process.platform !== 'darwin') return
  for (const name of ['rename-exclusive', 'project-ripgrep']) build(name)
}

function build(name) {
  const source = fileURLToPath(new URL(`../native/${name}.c`, import.meta.url))
  const output = fileURLToPath(new URL(`../out/native/${name}`, import.meta.url))
  const signature = createHash('sha256').update(readFileSync(source)).update(readFileSync(fileURLToPath(import.meta.url))).update(process.arch).digest('hex')
  if (existsSync(output) && existsSync(`${output}.sha256`) && readFileSync(`${output}.sha256`, 'utf8') === signature) return
  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.${process.pid}`
  execFileSync('/usr/bin/xcrun', ['clang', '-Wall', '-Wextra', '-Werror', '-O2', '-mmacosx-version-min=13.0', '-arch', process.arch === 'arm64' ? 'arm64' : 'x86_64', source, '-o', temporary], { stdio: 'inherit' })
  renameSync(temporary, output)
  writeFileSync(`${output}.sha256`, signature)
}
