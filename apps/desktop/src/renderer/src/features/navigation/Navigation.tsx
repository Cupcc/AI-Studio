import { useState } from 'react'
import { S } from '@shared/project/strings'
import { Icon } from '../../app/Icon'
import { useProjectShell } from '../project/store'
import { useShellIntegration, type ShellSlotProps } from '../project/integration'

export function Navigation(props: ShellSlotProps) {
  const { project, canvas } = props
  const shell = useProjectShell()
  const slots = useShellIntegration()
  const [menu, setMenu] = useState(false)
  return <aside className="navigation" aria-label={S.navLabel}>
    <div className="navigation__new-chat">
      <div className="split-button"><button className="split-button__main" onClick={() => shell.startDraft(project.id)}><Icon name="pencil" size={15} />{S.newChat}{slots.NewChatBadge && <span className="split-button__badge" aria-hidden="true"><slots.NewChatBadge {...props} /></span>}</button><button className="split-button__more" aria-label={S.chooseCli} data-tip={S.chooseCli} data-tip-align="end" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="chevron" size={14} /></button></div>
      {menu && <div className="cli-menu popover" onKeyDown={(event) => { if (event.key === 'Escape') setMenu(false) }}>
        {slots.CliMenu ? <slots.CliMenu {...props} dismiss={() => setMenu(false)} /> : <p>{S.cliMenuPending}</p>}
      </div>}
    </div>
    {slots.Workbenches && <slots.Workbenches {...props} />}
    <div className="navigation__divider" />
    <h2 className="navigation__heading">{S.sessions}</h2>
    <div className="navigation__sessions" data-testid={`sessions-${project.id}`}>
      {slots.SessionHistory ? <slots.SessionHistory {...props} /> : <div className="navigation__empty"><p>{S.sessionsEmpty}</p><button className="text-button" onClick={() => shell.startDraft(project.id)}>{S.newChat}</button></div>}
    </div>
    {slots.NavigationFooter && <div className="navigation__footer"><slots.NavigationFooter {...props} /></div>}
  </aside>
}
