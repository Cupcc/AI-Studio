import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { CliInstallation } from '@shared/session/cli-installation'
import { SESSION_CLIS, type SessionCli } from '@shared/session/types'
import { findExecutable, readVersion } from '../shell-env/executables'
import type { Env, ShellEnvService } from '../shell-env/login-env'

const installers = {
  codex: { executable: 'codex', url: 'https://chatgpt.com/codex/install.sh', shell: '/bin/sh', args: [] },
  'claude-code': { executable: 'claude', url: 'https://claude.ai/install.sh', shell: '/bin/bash', args: [] }
} satisfies Record<SessionCli, { executable: string; url: string; shell: string; args: string[] }>

/** Native installers use ~/.local/bin; preserve the user's existing PATH precedence. */
export function cliEnvironment(env: Env): Env {
  const localBin = join(env.HOME || homedir(), '.local', 'bin')
  const paths = (env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin').split(delimiter)
  return { ...env, PATH: [...new Set([...paths, localBin])].join(delimiter) }
}

interface Command {
  file: string
  args: string[]
  env: Env
  cwd: string
  signal: AbortSignal
}

/** No shell interpolation or renderer-supplied command; cancellation kills the complete process group. */
export function runInstallCommand({ file, args, env, cwd, signal }: Command): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env, cwd, stdio: 'ignore', detached: true })
    let stopped = false
    let timedOut = false
    const kill = () => {
      stopped = true
      try { if (child.pid) process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
    }
    const timer = setTimeout(() => { timedOut = true; kill() }, 10 * 60_000)
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', kill) }
    signal.addEventListener('abort', kill, { once: true })
    if (signal.aborted) kill()
    child.once('error', () => { cleanup(); reject(new Error('无法启动安装进程，请检查系统权限。')) })
    child.once('close', code => {
      cleanup()
      if (timedOut) reject(new Error('安装超时，请检查网络后重试。'))
      else if (stopped) reject(new Error('安装已取消，可重新安装。'))
      else if (code !== 0) reject(new Error(`安装命令失败（退出码 ${code ?? '未知'}）。请检查网络、代理及目录权限；可在终端运行官方命令查看详情。`))
      else resolve()
    })
  })
}

export interface CliInstallerOptions {
  shellEnv: ShellEnvService
  changed(states: CliInstallation[]): void
  installed(): Promise<void>
  run?: typeof runInstallCommand
  platform?: string
}

export class CliInstaller {
  private readonly states = new Map<SessionCli, CliInstallation>()
  private readonly running = new Map<SessionCli, { abort: AbortController; task: Promise<void> }>()
  private disposed = false
  constructor(private readonly options: CliInstallerOptions) {}

  snapshot(): CliInstallation[] {
    return SESSION_CLIS.map(cli => ({ ...(this.states.get(cli) ?? { cli, status: 'idle' }) }))
  }

  private update(state: CliInstallation): void {
    this.states.set(state.cli, state)
    if (!this.disposed) this.options.changed(this.snapshot())
  }

  install(cli: SessionCli): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('应用正在退出'))
    const existing = this.running.get(cli)
    if (existing) return existing.task
    const abort = new AbortController()
    const task = this.perform(cli, abort.signal).finally(() => this.running.delete(cli))
    this.running.set(cli, { abort, task })
    return task
  }

  cancel(cli: SessionCli): void { this.running.get(cli)?.abort.abort() }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const entry of this.running.values()) entry.abort.abort()
    await Promise.allSettled([...this.running.values()].map(entry => entry.task))
  }

  private async perform(cli: SessionCli, signal: AbortSignal): Promise<void> {
    let directory: string | undefined
    const phase = (value: Extract<CliInstallation, { status: 'installing' }>['phase']) => {
      signal.throwIfAborted()
      this.update({ cli, status: 'installing', phase: value })
    }
    try {
      phase('preparing')
      if ((this.options.platform ?? process.platform) !== 'darwin') throw new Error('一键安装目前仅支持 macOS。')
      const env = cliEnvironment((await this.options.shellEnv.refresh()).env)
      signal.throwIfAborted()
      const installer = installers[cli]
      if (!await findExecutable(installer.executable, env.PATH)) {
        directory = await mkdtemp(join(tmpdir(), 'ai-studio-cli-install-'))
        const script = join(directory, 'install.sh')
        const run = this.options.run ?? runInstallCommand
        phase('downloading')
        await run({ file: '/usr/bin/curl', args: ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '30', '--max-time', '120', '--max-filesize', '1048576', installer.url, '--output', script], env, cwd: directory, signal })
        phase('installing')
        await run({ file: installer.shell, args: [script, ...installer.args], env: cli === 'codex' ? { ...env, CODEX_NON_INTERACTIVE: '1' } : env, cwd: directory, signal })
      }
      phase('checking')
      const refreshed = cliEnvironment((await this.options.shellEnv.refresh()).env)
      signal.throwIfAborted()
      const file = await findExecutable(installer.executable, refreshed.PATH)
      if (!file) throw new Error('安装命令已结束，但仍未找到 CLI。请检查安装路径后重试。')
      await readVersion(file, refreshed)
      signal.throwIfAborted()
      await this.options.installed()
      signal.throwIfAborted()
      this.update({ cli, status: 'complete' })
    } catch (error) {
      this.update({ cli, status: 'error', message: signal.aborted ? '安装已取消，可重新安装。' : error instanceof Error ? error.message : '安装失败，请重试。' })
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true })
    }
  }
}
