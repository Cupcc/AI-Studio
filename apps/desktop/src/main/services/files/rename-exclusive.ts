import { execFile } from 'node:child_process'
import { constants } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export function filesHelperPath(name: 'rename-exclusive' | 'project-ripgrep'): string {
  return process.versions.electron
    ? process.defaultApp ? join(__dirname, '..', 'native', name) : join(process.resourcesPath, 'files', name)
    : join(process.cwd(), 'out', 'native', name)
}

/** Resource override is main-only (also used by packaged smoke); no renderer-selected executables. */
export async function renameExclusive(from: string, to: string, helper?: string): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Exclusive file moves require macOS')
  const executable = helper ?? filesHelperPath('rename-exclusive')
  try { await exec(executable, [from, to], { timeout: 5000, maxBuffer: 1024 }) }
  catch (error) {
    const errno = (error as { code?: number | string }).code
    const code = typeof errno === 'number' ? Object.entries(constants.errno).find(([, value]) => value === errno)?.[0] : errno
    throw Object.assign(new Error('Exclusive rename failed'), { code: code ?? 'EIO' })
  }
}
