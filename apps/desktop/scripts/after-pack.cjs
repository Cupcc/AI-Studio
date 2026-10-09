// electron-builder afterPack hook: node-pty 1.1.0 prebuilds ship spawn-helper
// without the executable bit. Make sure the packaged copy is executable and
// fail the build if the helper for the target arch is missing.
const { chmodSync, existsSync, readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')

const ARCH_NAMES = { 1: 'x64', 3: 'arm64', 4: 'universal' }

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = `${context.packager.appInfo.productFilename}.app`
  const ptyDir = join(context.appOutDir, appName, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', 'node-pty')
  const prebuilds = join(ptyDir, 'prebuilds')
  if (!existsSync(prebuilds)) throw new Error(`node-pty prebuilds not unpacked: ${prebuilds}`)
  for (const dir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, dir, 'spawn-helper')
    if (existsSync(helper)) chmodSync(helper, statSync(helper).mode | 0o755)
  }
  const arch = ARCH_NAMES[context.arch] ?? String(context.arch)
  const target = join(prebuilds, `darwin-${arch}`, 'spawn-helper')
  if (arch !== 'universal' && !existsSync(target)) throw new Error(`Missing ${target}`)
  console.log(`  • afterPack: node-pty spawn-helper executable for darwin-${arch}`)
}
