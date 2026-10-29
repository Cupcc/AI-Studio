import { useEffect, useId } from 'react'
import type { SessionCli } from '@shared/session/types'
import type { ShellSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { cliName, useSessions } from '../session/store'
import { CliBadge } from '../session/Status'
import { useSettings } from '../settings/store'

export function CliMenu({ project, dismiss }: ShellSlotProps & { dismiss(): void }) {
  const menuId = useId()
  const providers = useSessions((s) => s.providers), selected = useSessions((s) => s.defaultCli[project.id]), error = useSessions((s) => s.errors[`default:${project.id}`])
  const providersError = useSessions((s) => s.providersError), pending = useSessions((s) => s.pending[`default:${project.id}`])
  useEffect(() => { void useSessions.getState().loadProviders() }, [])
  const clis = providers.filter(provider => provider.status !== 'disabled').map(provider => provider.cli)
  const availability = (cli: SessionCli) => {
    const provider = providers.find((p) => p.cli === cli)
    return { available: provider?.status === 'available', reason: provider?.reason ?? (provider?.status === 'checking' || !provider ? '正在检查 CLI…' : 'CLI 不可用') }
  }
  return <div className="session-cli-menu" aria-label="选择 New Chat CLI">
    <p className="menu-heading">选择 CLI 新建对话</p>
    {!providers.length && !providersError && <p role="status" className="menu-item__sub">正在检查 CLI…</p>}
    {clis.map((cli) => {
      const { available, reason } = availability(cli)
      const labelId = `${menuId}-${cli}-label`, reasonId = `${menuId}-${cli}-reason`, defaultId = `${menuId}-${cli}-default`
      const descriptionIds = [!available && reasonId, selected === cli && defaultId].filter(Boolean).join(' ') || undefined
      return <button className="menu-item session-cli-menu__select" key={cli} aria-labelledby={labelId} aria-describedby={descriptionIds} disabled={!available} title={!available ? reason : undefined} onClick={() => { useSessions.getState().startDraft(project.id, cli); useProjectShell.getState().startDraft(project.id); dismiss() }}>
        <CliBadge cli={cli} />
        <span className="menu-item__text"><span id={labelId}>{cliName(cli)}</span>{!available && <span id={reasonId} className="menu-item__sub">{reason}</span>}</span>
        {selected === cli && <span id={defaultId} className="menu-item__meta">默认</span>}
      </button>
    })}
    <div className="menu-divider" />
    {providers.length > 0 && clis.length === 0 && <p className="menu-item__sub">尚未启用 CLI</p>}
    {clis.filter((cli) => cli !== selected).map((cli) => <button className="menu-item session-cli-menu__default" key={cli} disabled={!availability(cli).available || pending} onClick={() => void useSessions.getState().setDefaultCli(project.id, cli)}>将 {cliName(cli)} 设为所有 Project 默认</button>)}
    <button className="menu-item" onClick={() => { dismiss(); useSettings.getState().openDialog('cli') }}>CLI 设置</button>
    {(error || providersError) && <p role="alert" className="error-message">{error || providersError}</p>}
  </div>
}

export function NewChatBadge({ project }: ShellSlotProps) {
  const selected = useSessions((s) => s.defaultCli[project.id])
  return selected ? <CliBadge cli={selected} /> : null
}
