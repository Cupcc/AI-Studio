import { useRef, useState, type KeyboardEvent } from 'react'
import { DEFAULT_VIEW_IDS } from '@shared/project/types'
import { S, VIEW_NAMES } from '@shared/project/strings'
import { Icon } from '../../app/Icon'
import { useProjectShell } from '../project/store'
import { useShellIntegration, type ShellSlotProps } from '../project/integration'

export function Navigation(props: ShellSlotProps) {
  const { project, canvas } = props
  const shell = useProjectShell()
  const slots = useShellIntegration()
  const [menu, setMenu] = useState(false)
  const [focusIndex, setFocusIndex] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (event: KeyboardEvent, index: number) => {
    let next: number | undefined
    if (event.key === 'ArrowDown') next = (index + 1) % DEFAULT_VIEW_IDS.length
    if (event.key === 'ArrowUp') next = (index + DEFAULT_VIEW_IDS.length - 1) % DEFAULT_VIEW_IDS.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = DEFAULT_VIEW_IDS.length - 1
    if (next !== undefined) { event.preventDefault(); setFocusIndex(next); refs.current[next]?.focus() }
  }
  return <aside className="navigation" aria-label={S.navLabel}>
    <div className="navigation__new-chat">
      <div className="split-button"><button className="split-button__main" onClick={() => shell.startDraft(project.id)}><Icon name="pencil" size={15} />{S.newChat}{slots.NewChatBadge && <span className="split-button__badge" aria-hidden="true"><slots.NewChatBadge {...props} /></span>}</button><button className="split-button__more" aria-label={S.chooseCli} data-tip={S.chooseCli} data-tip-align="end" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="chevron" size={14} /></button></div>
      {menu && <div className="cli-menu popover" onKeyDown={(event) => { if (event.key === 'Escape') setMenu(false) }}>
        {slots.CliMenu ? <slots.CliMenu {...props} dismiss={() => setMenu(false)} /> : <p>{S.cliMenuPending}</p>}
      </div>}
    </div>
    <h2 className="navigation__heading">{S.projectViews}</h2>
    <div className="navigation__views" aria-label={S.projectViews}>
      {DEFAULT_VIEW_IDS.map((id, i) => <button key={id} ref={(el) => { refs.current[i] = el }} tabIndex={focusIndex === i ? 0 : -1}
        className={`navigation__view ${canvas.mode === 'view' && canvas.viewId === id ? 'is-selected' : ''}`}
        aria-current={canvas.mode === 'view' && canvas.viewId === id ? 'page' : undefined}
        onKeyDown={(event) => move(event, i)} onFocus={() => setFocusIndex(i)} onClick={() => shell.enterView(project.id, id)}><Icon name={id} /><span>{VIEW_NAMES[id]}</span></button>)}
    </div>
    <div className="navigation__divider" />
    <h2 className="navigation__heading">{S.sessions}</h2>
    <div className="navigation__sessions" data-testid={`sessions-${project.id}`}>
      {slots.SessionHistory ? <slots.SessionHistory {...props} /> : <div className="navigation__empty"><p>{S.sessionsEmpty}</p><button className="text-button" onClick={() => shell.startDraft(project.id)}>{S.newChat}</button></div>}
    </div>
  </aside>
}
