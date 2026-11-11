import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function buildWorkbenchPackages(options = {}) {
  const sourceRoot = options.sourceRoot ?? fileURLToPath(new URL('../build/workbenches', import.meta.url))
  const commonRoot = options.commonRoot ?? fileURLToPath(new URL('../build/workbench-common', import.meta.url))
  const outputRoot = options.outputRoot ?? fileURLToPath(new URL('../out/workbench-packages', import.meta.url))
  mkdirSync(outputRoot, { recursive: true })
  const packages = readdirSync(sourceRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  const fonts = [400, 500, 600].map(weight => {
    const name = `ibm-plex-sans-latin-${weight}-normal.woff2`
    return [name, readFileSync(fileURLToPath(new URL(`../node_modules/@fontsource/ibm-plex-sans/files/${name}`, import.meta.url)))]
  })
  const common = readdirSync(commonRoot, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name).sort()
  for (const name of packages) {
    const output = join(outputRoot, name)
    mkdirSync(output, { recursive: true })
    const files = new Map([
      ['manifest.json', readFileSync(join(sourceRoot, name, 'manifest.json'))],
      ['index.html', readFileSync(join(sourceRoot, name, 'index.html'))],
      ...readdirSync(join(sourceRoot, name)).filter(file => !['manifest.json', 'index.html'].includes(file)).map(file => [file, readFileSync(join(sourceRoot, name, file))]),
      ...common.map(file => [file, readFileSync(join(commonRoot, file))]),
      ...fonts,
      ['FONT-LICENSE.txt', readFileSync(fileURLToPath(new URL('../node_modules/@fontsource/ibm-plex-sans/LICENSE', import.meta.url)))]
    ])
    for (const [file, content] of files) {
      const destination = join(output, file)
      if (existsSync(destination) && readFileSync(destination).equals(content)) continue
      const temporary = `${destination}.${process.pid}.tmp`
      writeFileSync(temporary, content)
      renameSync(temporary, destination)
    }
    for (const entry of readdirSync(output)) if (!files.has(entry)) rmSync(join(output, entry), { recursive: true, force: true })
  }
  for (const entry of readdirSync(outputRoot)) if (!packages.includes(entry)) rmSync(join(outputRoot, entry), { recursive: true, force: true })
  return packages.map(name => join(outputRoot, name))
}
