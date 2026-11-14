// Swapping the app bundle (DEC-36). The running app cannot replace itself safely, so a detached POSIX shell script
// waits for this process to exit, moves the old bundle aside, moves the staged one into its place, restores the old
// one if that fails, and optionally relaunches. Kept as a file so tests run the exact script against fake bundles.
import { spawn } from 'node:child_process'
import { accessSync, constants, openSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export const INSTALL_SCRIPT = `#!/bin/sh
# AI Developer Studio updater: <pid> <target.app> <staged.app> <version> <relaunch 0|1> <status file> [app args...]
pid=$1; target=$2; staged=$3; version=$4; relaunch=$5; status=$6
shift 6
incoming="$target.incoming"; backup="$target.previous"; result=""
# Copy next to the target first, so both moves below are renames on one volume and cannot stop halfway.
rm -rf "$incoming"
if [ ! -d "$staged" ]; then
  result="failed 找不到已下载的新版本"
elif ! ditto "$staged" "$incoming"; then
  result="failed 无法把新版本复制到应用所在位置"
fi
if [ -z "$result" ]; then
  waited=0
  while kill -0 "$pid" 2>/dev/null; do
    waited=$((waited + 1))
    if [ "$waited" -gt 1200 ]; then result="failed 等待应用退出超时"; break; fi
    sleep 0.1
  done
fi
if [ -z "$result" ]; then
  rm -rf "$backup"
  if ! mv "$target" "$backup"; then
    result="failed 无法移动当前版本"
  elif mv "$incoming" "$target"; then
    rm -rf "$backup"
    xattr -dr com.apple.quarantine "$target" 2>/dev/null
    result="ok $version"
  else
    rm -rf "$target"
    if mv "$backup" "$target"; then result="failed 无法放入新版本，已恢复原版本"
    else result="failed 无法放入新版本，原版本保留在 $backup"; fi
  fi
fi
rm -rf "$incoming"
printf '%s\\n' "$result" > "$status"
# Relaunch whatever is now at the target: the new version, or the old one after a failure.
if [ "$relaunch" = 1 ] && [ -d "$target" ]; then open -n "$target" --args "$@"; fi
case "$result" in ok*) exit 0 ;; *) exit 1 ;; esac
`

/** The .app bundle that contains the running executable, or null when it is not inside one (development). */
export function bundleOf(execPath: string): string | null {
  const bundle = resolve(execPath, '../../..')
  return bundle.endsWith('.app') && basename(dirname(execPath)) === 'MacOS' ? bundle : null
}

/** Why this copy cannot replace its own bundle; null when it can. */
export function installBlock(options: { packaged: boolean; platform: string; execPath: string }): string | null {
  if (!options.packaged) return '开发版本不会自行安装更新，可在 GitHub 下载新版本。'
  if (options.platform !== 'darwin') return '只有 macOS 版本支持自动安装更新。'
  const bundle = bundleOf(options.execPath)
  if (!bundle) return '找不到应用所在位置，无法自行安装更新。'
  // Gatekeeper runs quarantined apps from a read-only random copy ("App Translocation").
  if (bundle.includes('/AppTranslocation/')) return '应用正从系统隔离的位置运行，无法自行更新。请把它移到“应用程序”文件夹后重新打开。'
  try {
    accessSync(dirname(bundle), constants.W_OK)
    accessSync(bundle, constants.W_OK)
  } catch {
    return `没有写入“${dirname(bundle)}”的权限，无法自行安装更新。`
  }
  return null
}

/** Arguments a relaunch keeps: only the isolated data directory used by tests and smoke runs. */
export const relaunchArgs = (argv: readonly string[]) => argv.filter(arg => arg.startsWith('--studio-user-data-dir='))

export function startInstaller(options: {
  directory: string; statusFile: string; pid: number; target: string; staged: string; version: string; relaunch: boolean; args: readonly string[]
}): void {
  const script = join(options.directory, 'install.sh')
  writeFileSync(script, INSTALL_SCRIPT, { mode: 0o700 })
  const log = openSync(join(options.directory, 'install.log'), 'w', 0o600)
  const child = spawn('/bin/sh', [script, String(options.pid), options.target, options.staged, options.version, options.relaunch ? '1' : '0', options.statusFile, ...options.args], {
    detached: true, stdio: ['ignore', log, log]
  })
  child.unref()
}
