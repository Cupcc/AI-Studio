import { useEffect } from 'react'
import { SESSION_CLIS } from '@shared/session/types'
import type { ShellSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { cliName, useSessions } from '../session/store'

export function CliMenu({ project, dismiss }: ShellSlotProps & { dismiss(): void }) {
  const providers = useSessions((s) => s.providers), selected = useSessions((s) => s.defaultCli[project.id]), error = useSessions((s) => s.errors[`default:${project.id}`])
  const providersError = useSessions((s) => s.providersError), pending = useSessions((s) => s.pending[`default:${project.id}`])
  useEffect(() => { void useSessions.getState().loadProviders() }, [])
  return <div className="session-cli-menu" aria-label="选择 New Chat CLI">
    {SESSION_CLIS.map((cli) => {
      const provider = providers.find((p) => p.cli === cli), available = provider?.status === 'available'
      const reason = provider?.reason ?? (provider?.status === 'checking' || !provider ? '正在检查 CLI…' : 'CLI 不可用')
      return <div className="session-cli-menu__item" key={cli}>
        <button className="session-cli-menu__select" disabled={!available} title={!available ? reason : undefined} onClick={() => { useSessions.getState().startDraft(project.id, cli); useProjectShell.getState().startDraft(project.id); dismiss() }}>
          <span>{cliName(cli)}</span>{selected === cli && <span className="muted">默认</span>}
        </button>
        {!available && <p>{reason}</p>}
        <button className="session-cli-menu__default" disabled={!available || pending || selected === cli} onClick={() => void useSessions.getState().setDefaultCli(project.id, cli)}>设为此 Project 默认</button>
      </div>
    })}
    {(error || providersError) && <p role="alert" className="error-message">{error || providersError}</p>}
  </div>
}
