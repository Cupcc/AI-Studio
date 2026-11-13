import { createHash } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { packagePath, parseManifest } from '@shared/workbench/schema'
import type { PluginManifest } from '@shared/workbench/types'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_PACKAGE_BYTES = 16 * 1024 * 1024
export interface PackageFiles { manifest: PluginManifest; revision: string; files: Map<string, Buffer> }

export function assertInside(root: string, path: string): void {
  const rel = relative(resolve(root), resolve(path))
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith(sep)) throw new Error('工作台路径超出 Project')
  let current = resolve(root)
  for (const part of ['', ...rel.split(sep).filter(Boolean)]) {
    if (part) current = join(current, part)
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('工作台文件不支持符号链接，请使用包内文件') }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return; throw error }
  }
}

function readFile(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = fstatSync(fd)
    if (!before.isFile()) throw new Error('插件包只能包含普通文件')
    if (before.size > MAX_FILE_BYTES) throw new Error('插件文件超过 2 MiB，请减少文件大小')
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1)
    let size = 0, length = 0
    do { length = readSync(fd, buffer, size, buffer.length - size, size); size += length } while (length && size < buffer.length)
    if (size > MAX_FILE_BYTES) throw new Error('插件文件超过 2 MiB，请减少文件大小')
    const after = fstatSync(fd)
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('草稿仍在写入，请稍后刷新预览')
    return buffer.subarray(0, size)
  } finally { closeSync(fd) }
}

function validateReferences(file: string, content: string, files: Map<string, Buffer>): void {
  for (const match of content.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1]!
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(value)) continue
    let local: string
    try { local = decodeURIComponent(value.split(/[?#]/, 1)[0]!) } catch { throw new Error(`${file} 包含无效资源路径 ${value}`) }
    if (!local) continue
    const path = posix.normalize(posix.join(posix.dirname(file), local))
    packagePath(path)
    if (local.startsWith('/') || !files.has(path)) throw new Error(`${file} 引用的包内资源不存在：${value}`)
  }
}

export function readPackage(projectRoot: string, directory: string): PackageFiles {
  assertInside(projectRoot, directory)
  const files = new Map<string, Buffer>()
  let bytes = 0
  function visit(folder: string, prefix: string): void {
    for (const item of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix ? `${prefix}/${item.name}` : item.name
      packagePath(name)
      if (item.isSymbolicLink()) throw new Error(`包内不允许符号链接：${name}`)
      if (item.isDirectory()) { visit(join(folder, item.name), name); continue }
      if (!item.isFile()) throw new Error(`包内不是普通文件：${name}`)
      if (files.size >= 128) throw new Error('插件包超过 128 个文件，请移除依赖或缓存目录')
      const content = readFile(join(folder, item.name))
      bytes += content.byteLength
      if (bytes > MAX_PACKAGE_BYTES) throw new Error('插件包超过 16 MiB，请减少资源大小')
      files.set(name, content)
    }
  }
  try { visit(directory, '') } catch (error) {
    if (error instanceof Error && 'code' in error) throw new Error('工作台包目录不可读取，请检查文件后刷新预览')
    throw error
  }
  const manifestFile = files.get('manifest.json')
  if (!manifestFile) throw new Error('缺少 manifest.json，请按开发说明补充')
  let raw: unknown
  try { raw = JSON.parse(manifestFile.toString('utf8')) } catch { throw new Error('manifest.json 不是有效 JSON，请修正后刷新预览') }
  const manifest = parseManifest(raw)
  if (!files.has(manifest.entry)) throw new Error(`找不到入口 ${manifest.entry}，请修正 manifest.json 或创建入口文件`)
  for (const [name, content] of files) if (/\.html?$/i.test(name)) validateReferences(name, content.toString('utf8'), files)
  const hash = createHash('sha256')
  for (const [name, content] of files) hash.update(JSON.stringify([name, content.byteLength])).update(content)
  return { manifest, revision: hash.digest('hex'), files }
}

/** `mode` sets the permission bits of new files; applied packages pass 0o444 so their files are read-only. */
export function writePackage(root: string, directory: string, files: Map<string, Buffer>, mode?: number): void {
  assertInside(root, directory)
  mkdirSync(directory, { recursive: true })
  for (const [name, content] of files) {
    const path = join(directory, packagePath(name))
    assertInside(root, path)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, { flag: 'wx', ...(mode === undefined ? {} : { mode }) })
  }
}
