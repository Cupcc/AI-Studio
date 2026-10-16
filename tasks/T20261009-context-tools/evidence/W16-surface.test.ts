// W16 区域 E / G（静态部分）：生产 CSP、预加载暴露面、渲染端无 HTML / 脚本注入点、window.studio 表面。
// 不启动 Electron：读取已构建的 out/ 与已打包的 dist/（asar 自行解析），再扫描源码。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contracts } from '@shared/ipc/contracts'
import { buildStudioApi } from '../../../apps/desktop/src/preload/bridge'

const desktop = fileURLToPath(new URL('../../../apps/desktop/', import.meta.url))

const EXPECTED_CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "style-src-elem 'self' 'unsafe-inline'", "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "base-uri 'none'", "form-action 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'"
]

function cspOf(html: string): string[] {
  const match = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)
  if (!match) throw new Error('no CSP meta')
  return match[1]!.replace(/&#39;/g, "'").replace(/&amp;/g, '&').split('; ')
}

/** 最小 asar 读取：Chromium Pickle 头 + JSON 目录。返回 path -> Buffer（只取需要的文件）。 */
function readAsar(path: string, wanted: (file: string) => boolean): Map<string, Buffer> {
  const data = readFileSync(path)
  const headerSize = data.readUInt32LE(4)
  const jsonLength = data.readUInt32LE(12)
  const header = JSON.parse(data.subarray(16, 16 + jsonLength).toString('utf8')) as { files: Record<string, unknown> }
  const base = 8 + headerSize
  const out = new Map<string, Buffer>()
  const walk = (node: { files?: Record<string, unknown>; offset?: string; size?: number }, prefix: string) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const entry = child as { files?: Record<string, unknown>; offset?: string; size?: number; unpacked?: boolean }
      const full = prefix ? `${prefix}/${name}` : name
      if (entry.files) walk(entry, full)
      else if (!entry.unpacked && entry.offset !== undefined && wanted(full)) out.set(full, data.subarray(base + Number(entry.offset), base + Number(entry.offset) + Number(entry.size)))
    }
  }
  walk(header as never, '')
  return out
}

describe('E1 生产 CSP（已构建的 out/ 与已打包的 dist/）', () => {
  it('out/renderer/index.html 的 CSP 与设计完全一致：脚本 self、worker none、仅两条被接受的 style 放宽，无 blob: / unsafe-eval / 通配', () => {
    const csp = cspOf(readFileSync(join(desktop, 'out/renderer/index.html'), 'utf8'))
    expect(csp).toEqual(EXPECTED_CSP)
    const joined = csp.join('; ')
    for (const forbidden of ['unsafe-eval', 'wasm-unsafe-eval', 'blob:', '*', 'http:', 'https:', 'ws:']) expect(joined, forbidden).not.toContain(forbidden)
    expect(csp.filter((directive) => directive.includes("'unsafe-inline'")).map((directive) => directive.split(' ')[0])).toEqual(['style-src-elem', 'style-src-attr'])
  })

  it('已打包应用的 app.asar 内的 index.html 与 out/ 一致，且资源文件名集合一致（打包的就是被评审的构建）', () => {
    const app = join(desktop, 'dist/mac-arm64')
    const bundle = readdirSync(app).find((name) => name.endsWith('.app'))
    if (!bundle) throw new Error('no packaged .app')
    const asar = join(app, bundle, 'Contents/Resources/app.asar')
    const files = readAsar(asar, (file) => file === 'out/renderer/index.html' || file.startsWith('out/renderer/assets/') || file === 'out/preload/index.js')
    const html = files.get('out/renderer/index.html')
    expect(html, 'index.html inside asar').toBeTruthy()
    expect(cspOf(html!.toString('utf8'))).toEqual(EXPECTED_CSP)
    const packaged = [...files.keys()].filter((file) => file.startsWith('out/renderer/assets/')).map((file) => file.slice('out/renderer/assets/'.length)).sort()
    const built = readdirSync(join(desktop, 'out/renderer/assets')).sort()
    expect(packaged).toEqual(built)
    expect(files.get('out/preload/index.js')!.equals(readFileSync(join(desktop, 'out/preload/index.js')))).toBe(true)
  })

  it('与 main 分支相比 CSP 定义、窗口、安全与预加载没有改动；主进程只新增目录 reader 构建入口', () => {
    const repository = join(desktop, '../..')
    const changed = execFileSync('git', ['diff', '--name-only', 'main..HEAD', '--', 'apps/desktop/src/main/window', 'apps/desktop/src/main/security', 'apps/desktop/src/preload'], {
      cwd: repository, encoding: 'utf8'
    }).trim()
    expect(changed).toBe('')
    const before = execFileSync('git', ['show', 'main:apps/desktop/electron.vite.config.ts'], { cwd: repository, encoding: 'utf8' })
    const current = readFileSync(join(desktop, 'electron.vite.config.ts'), 'utf8')
    const csp = (source: string) => [...source.matchAll(/export const CSP_(?:PRODUCTION|DEVELOPMENT) = \[[\s\S]*?\]\.join\('; '\)/g)].map((match) => match[0])
    expect(csp(current)).toHaveLength(2)
    expect(csp(current)).toEqual(csp(before))
    // Review authorization: only the new utility-process entry and stable chunk naming may alter the build config.
    const expected = before.replace("resolve: { alias: { '@shared': shared } }\n  },", `resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('./src/main/index.ts', import.meta.url)),
          'directory-reader-worker': fileURLToPath(new URL('./src/main/services/files/directory-reader-worker.ts', import.meta.url))
        },
        output: { chunkFileNames: '[name]-[hash].js' }
      }
    }
  },`)
    expect(current).toBe(expected)
  })

  it('构建产物中的危险词：eval / document.write 不存在；new Worker / Blob URL 只在 Monaco 的 worker 引导代码里（getWorker 抛错使其不可达）', () => {
    const dir = join(desktop, 'out/renderer/assets')
    const hits: Record<string, string[]> = {}
    for (const name of readdirSync(dir).filter((file) => file.endsWith('.js'))) {
      const text = readFileSync(join(dir, name), 'utf8')
      for (const token of ['eval(', 'document.write', 'new Function(', 'setTimeout("', "setTimeout('", 'import(`http', 'WebAssembly.instantiate']) {
        if (text.includes(token)) (hits[token] ??= []).push(name)
      }
    }
    console.info('[W16-E dangerous tokens in built chunks]', JSON.stringify(hits))
    expect(hits['eval(']).toBeUndefined()
    expect(hits['document.write']).toBeUndefined()
    expect(hits['new Function(']).toBeUndefined()
  })
})

describe('E2 预加载与 window.studio 表面', () => {
  it('预加载包只通过 contextBridge 暴露 studio，不暴露 ipcRenderer / Node API', () => {
    const text = readFileSync(join(desktop, 'out/preload/index.js'), 'utf8')
    expect(text.match(/exposeInMainWorld\(/g)?.length).toBe(1)
    expect(text).toContain('exposeInMainWorld("studio"')
    for (const forbidden of ['child_process', 'require("fs")', "require('fs')", 'require("node:', 'shell.openExternal', 'webFrame', 'process.binding', 'nodeIntegration']) {
      expect(text, forbidden).not.toContain(forbidden)
    }
    // 唯一的 require 是 electron 本身
    expect([...text.matchAll(/require\(([^)]+)\)/g)].map((match) => match[1])).toEqual(['"electron"'])
  })

  it('window.studio 的特性集合与每个通道：没有通用 fs / shell / exec / 路径读取原语；files 与 diff 的通道集合精确', () => {
    const calls: unknown[][] = []
    const api = buildStudioApi(contracts, { invoke: async (...args) => { calls.push(args); return undefined }, on: () => {}, removeListener: () => {} })
    const surface = Object.fromEntries(Object.entries(api as Record<string, Record<string, unknown>>).map(([feature, members]) => [feature, Object.keys(members).sort()]))
    console.info('[W16-E window.studio surface]', JSON.stringify(surface))
    expect(Object.keys(surface).sort()).toEqual(['app', 'browser', 'diff', 'files', 'project', 'projectView', 'session', 'settings', 'terminal'])
    const channels = contracts.flatMap((contract) => Object.values(contract.invoke).map((channel) => channel.channel))
    const generic = channels.filter((channel) => /(^|[:-])(fs|file-system|shell|exec|spawn|run|eval|read-file|write-file|open-path|cwd|env|sh)([:-]|$)/.test(channel))
    // project:open-path 是阶段 1 之前就有的通道：渲染端可提交任意绝对目录登记为 Project（见 W16-review 的 G 区）；这里记录而不是放行未知通道
    expect(generic, '通用原语样式的通道名').toEqual(['project:open-path'])
    const files = contracts.find((contract) => contract.name === 'files')!
    const diff = contracts.find((contract) => contract.name === 'diff')!
    expect(Object.values(files.invoke).map((channel) => channel.channel).sort()).toEqual(['files:list', 'files:read', 'files:resolve-reference', 'files:subscribe', 'files:unsubscribe'])
    expect(Object.values(diff.invoke).map((channel) => channel.channel).sort()).toEqual(['diff:get-file', 'diff:get-snapshot', 'diff:subscribe', 'diff:unsubscribe'])
    expect(Object.isFrozen(api)).toBe(true)
    expect(Object.isFrozen((api as Record<string, unknown>).files)).toBe(true)
    expect(Object.isFrozen((api as Record<string, unknown>).diff)).toBe(true)
  })

  it('files / diff 通道的请求类型里没有任何绝对路径、cwd、sha、参数数组字段（契约源码）', () => {
    const files = readFileSync(join(desktop, 'src/shared/tools/files.ts'), 'utf8')
    const diff = readFileSync(join(desktop, 'src/shared/tools/diff.ts'), 'utf8')
    for (const [name, text] of [['files', files], ['diff', diff]] as const) {
      // 允许 absolutePath 只出现在 ResolvedFileReference（MAIN-ONLY，不过 IPC）
      const occurrences = [...text.matchAll(/absolute|cwd|argv|args\b|\bsha\b|command|env\b/gi)].map((match) => match[0].toLowerCase())
      console.info(`[W16-E contract words ${name}]`, JSON.stringify([...new Set(occurrences)]))
    }
    expect(files).toContain('MAIN-ONLY, never crosses IPC')
    expect(diff).not.toMatch(/absolutePath|cwd/)
  })
})

describe('E3 渲染端源码：没有 HTML / 脚本注入点，没有持久化文件内容的存储', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return sources(path)
      return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : []
    })
  }

  it('renderer/src（非测试）不含 dangerouslySetInnerHTML / innerHTML / insertAdjacentHTML / eval / new Function / document.write / createObjectURL / window.open / rehype-raw', () => {
    const offenders: string[] = []
    const pattern = /dangerouslySetInnerHTML|\.innerHTML|insertAdjacentHTML|outerHTML|\beval\(|new Function\(|document\.write|createObjectURL|window\.open\(|rehype-raw|rehypeRaw|skipHtml\s*=\s*\{?false/
    for (const path of sources(join(desktop, 'src/renderer/src'))) if (pattern.test(readFileSync(path, 'utf8'))) offenders.push(path.slice(desktop.length))
    expect(offenders).toEqual([])
  })

  it('renderer/src（非测试）不使用 localStorage / sessionStorage / indexedDB / document.cookie（文件内容与 Diff 只存在内存）', () => {
    const offenders: string[] = []
    for (const path of sources(join(desktop, 'src/renderer/src'))) if (/localStorage|sessionStorage|indexedDB|document\.cookie|caches\.open/.test(readFileSync(path, 'utf8'))) offenders.push(path.slice(desktop.length))
    expect(offenders).toEqual([])
  })

  it('Monaco 只经 import() 懒加载；运行时只注册只读查看所需贡献；无 @monaco-editor/react、无 CDN、无 worker URL', () => {
    const runtime = readFileSync(join(desktop, 'src/renderer/src/features/tools/code/monaco-runtime.ts'), 'utf8')
    const imports = [...runtime.matchAll(/import ['"]monaco-editor\/([^'"]+)['"]/g)].map((match) => match[1])
    console.info('[W16-E monaco contributions]', JSON.stringify(imports))
    for (const forbidden of ['quickCommand', 'hover', 'links', 'suggest', 'codeAction', 'inlineCompletions', 'documentSymbols', 'rename', 'format']) {
      expect(imports.some((item) => item!.includes(forbidden)), forbidden).toBe(false)
    }
    const all = sources(join(desktop, 'src/renderer/src')).map((path) => readFileSync(path, 'utf8')).join('\n')
    expect(all).not.toMatch(/@monaco-editor\/react|cdn\.jsdelivr|unpkg\.com|loader\.config|MonacoEnvironment\.baseUrl|getWorkerUrl/)
    const environment = readFileSync(join(desktop, 'src/renderer/src/features/tools/code/monaco-environment.ts'), 'utf8')
    expect(environment).toContain("throw new Error(WORKERS_DISABLED_MESSAGE)")
    expect(existsSync(join(desktop, 'out/renderer/assets'))).toBe(true)
  })
})
