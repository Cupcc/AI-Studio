import { useEffect } from 'react'
import { SESSION_CLIS } from '@shared/session/types'
import type { ShellSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { cliName, useSessions } from '../session/store'
import { CliBadge } from '../session/Status'

export function CliMenu({ project, dismiss }: ShellSlotProps & { dismiss(): void }) {
  const providers = useSessions((s) => s.providers), selected = useSessions((s) => s.defaultCli[project.id]), error = useSessions((s) => s.errors[`default:${project.id}`])
  const providersError = useSessions((s) => s.providersError), pending = useSessions((s) => s.pending[`default:${project.id}`])
  useEffect(() => { void useSessions.getState().loadProviders() }, [])
  const availability = (cli: (typeof SESSION_CLIS)[number]) => {
    const provider = providers.find((p) => p.cli === cli)
    return { available: provider?.status === 'available', reason: provider?.reason ?? (provider?.status === 'checking' || !provider ? '正在检查 CLI…' : 'CLI 不可用') }
  }
  return <div className="session-cli-menu" aria-label="选择 New Chat CLI">
    <p className="menu-heading">选择 CLI 新建对话</p>
    {SESSION_CLIS.map((cli) => {
      const { available, reason } = availability(cli)
      return <button className="menu-item session-cli-menu__select" key={cli} disabled={!available} title={!available ? reason : undefined} onClick={() => { useSessions.getState().startDraft(project.id, cli); useProjectShell.getState().startDraft(project.id); dismiss() }}>
        <CliBadge cli={cli} />
        <span className="menu-item__text"><span>{cliName(cli)}</span>{!available && <span className="menu-item__sub">{reason}</span>}</span>
        {selected === cli && <span className="menu-item__meta">默认</span>}
      </button>
    })}
    <div className="menu-divider" />
    {SESSION_CLIS.filter((cli) => cli !== selected).map((cli) => <button className="menu-item session-cli-menu__default" key={cli} disabled={!availability(cli).available || pending} onClick={() => void useSessions.getState().setDefaultCli(project.id, cli)}>将 {cliName(cli)} 设为此 Project 默认</button>)}
    {(error || providersError) && <p role="alert" className="error-message">{error || providersError}</p>}
  </div>
}

export function NewChatBadge({ project }: ShellSlotProps) {
  const selected = useSessions((s) => s.defaultCli[project.id])
  return selected ? <CliBadge cli={selected} /> : null
}
