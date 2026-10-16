import { useEffect, useState } from 'react'
import { TOOL_NAMES, S } from '@shared/project/strings'
import type { RightSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { useSettings } from '../settings/store'
import { Icon } from '../../app/Icon'
import { BrowserPanel } from './BrowserPanel'
import { TerminalPanel } from './TerminalPanel'
import { FilesPanel } from './files/FilesPanel'
import { DiffPanel } from './diff/DiffPanel'

/** Native content views sit above the DOM. Hide them while app dialogs or menus are visible. */
export function useNativeViewBlocked(): boolean {
  const confirming = useProjectShell(s => !!(s.closeDialog || s.quitRequest))
  const settings = useSettings(s => s.dialogOpen)
  const [popover, setPopover] = useState(false)
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const visible = [...document.querySelectorAll<HTMLElement>('.popover, [role="dialog"], [role="alertdialog"], [role="menu"]')].some(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
      setPopover(visible)
    }
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(measure) })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'] })
    measure()
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [])
  return confirming || settings || popover
}

/**
 * Only the tools that own a native view need the overlay observer. It watches the whole body, which the Monaco
 * based Files / Diff panels mutate constantly while scrolling, so they must not pay for it.
 */
function NativeViewTool(props: RightSlotProps) {
  const overlayBlocked = useNativeViewBlocked()
  if (props.area === 'terminal') return <TerminalPanel projectId={props.project.id} active={props.active} overlayBlocked={overlayBlocked} />
  return <BrowserPanel projectId={props.project.id} active={props.active} overlayBlocked={overlayBlocked} />
}

export function Tools(props: RightSlotProps) {
  if (props.area === 'terminal' || props.area === 'browser') return <NativeViewTool {...props} />
  if (props.area === 'files') return <FilesPanel projectId={props.project.id} canvas={props.canvas} active={props.active} />
  if (props.area === 'diff') return <DiffPanel projectId={props.project.id} active={props.active} />
  if (props.area === 'preview') return null
  return <div className="canvas-placeholder"><Icon name={props.area} size={28} /><h2>{TOOL_NAMES[props.area]}</h2><p>{S.placeholderTool(TOOL_NAMES[props.area])}</p></div>
}
