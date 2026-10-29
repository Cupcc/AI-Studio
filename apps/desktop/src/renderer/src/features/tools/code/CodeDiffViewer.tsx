import { useEffect, useRef, useState } from 'react'
import { openDiffSession, type DiffContent, type DiffSession } from './diff-session'
import { modifiedAriaLabel } from './editor-options'
import { CODE_DIFF_TOO_LARGE, diffTooLarge } from './limits'
import { loadMonaco } from './monaco-loader'
import type { CodeDiffViewerProps } from './types'
import './code.css'

type Phase = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; message: string }

/**
 * Read-only Monaco diff of two full texts (FR-TOOL-002 item 5). The lifecycle mirrors `CodeViewer`; the props have no
 * error callback, so failures are shown in place. Only the panel decides when two sides exist: a historic patch without both
 * sides must not be faked from the working tree, it goes to a patch view instead.
 */
export default function CodeDiffViewer({ path, original, modified, active, viewStateKey, sideBySide = true, hideUnchanged = true, navigate }: CodeDiffViewerProps) {
  const host = useRef<HTMLDivElement>(null)
  const session = useRef<DiffSession | null>(null)
  const latest = useRef<DiffContent>({ path, original, modified, viewStateKey })
  latest.current = { path, original, modified, viewStateKey }
  const layout = useRef({ sideBySide, hideUnchanged })
  layout.current = { sideBySide, hideUnchanged }
  const tooLarge = diffTooLarge(original, modified)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  useEffect(() => {
    const node = host.current
    if (!active || tooLarge || !node) return
    let cancelled = false
    setPhase({ kind: 'loading' })
    void loadMonaco()
      .then((runtime) => openDiffSession(runtime, node, latest.current, () => cancelled))
      .then((opened) => {
        if (!opened) return
        if (cancelled) { opened.dispose(); return }
        session.current = opened
        opened.show(latest.current)
        opened.configure(layout.current)
        setPhase({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setPhase({ kind: 'failed', message: `代码对比查看器无法加载：${error instanceof Error ? error.message : String(error)}` })
      })
    return () => {
      cancelled = true
      session.current?.dispose()
      session.current = null
    }
  }, [active, tooLarge])

  useEffect(() => { session.current?.show({ path, original, modified, viewStateKey }) }, [path, original, modified, viewStateKey])
  useEffect(() => { session.current?.configure({ sideBySide, hideUnchanged }) }, [sideBySide, hideUnchanged])
  useEffect(() => { if (navigate) session.current?.goToDiff(navigate.direction) }, [navigate?.direction, navigate?.nonce])

  const notice = tooLarge ? { role: 'alert', text: CODE_DIFF_TOO_LARGE }
    : !active ? null
    : phase.kind === 'failed' ? { role: 'alert', text: phase.message }
    : phase.kind === 'loading' ? { role: 'status', text: '代码对比查看器加载中…' }
    : null
  return (
    <div className="code-viewer" role="group" aria-label={modifiedAriaLabel(path)} data-state={tooLarge ? 'too-large' : active ? phase.kind : 'inactive'}>
      <div className="code-viewer__host" ref={host} />
      {notice && <p className="code-viewer__notice" role={notice.role}>{notice.text}</p>}
    </div>
  )
}
