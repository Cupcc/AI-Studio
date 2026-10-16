import { useEffect, useRef, useState } from 'react'
import { openCodeSession, type CodeContent, type CodeSession } from './code-session'
import { codeAriaLabel } from './editor-options'
import { CODE_VIEWER_TOO_LARGE, viewerTextTooLarge } from './limits'
import { loadMonaco } from './monaco-loader'
import type { CodeViewerProps } from './types'
import './code.css'

type Phase = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; message: string }

/**
 * Read-only Monaco viewer of one file (FR-TOOL-001). The editor exists only while `active` and the text is within the
 * viewer limit: it is created on activation, destroyed (view state saved per `viewStateKey`) on deactivation or unmount,
 * and fed new content through the session instead of being recreated.
 */
export default function CodeViewer({ path, text, active, viewStateKey, onError }: CodeViewerProps) {
  const host = useRef<HTMLDivElement>(null)
  const session = useRef<CodeSession | null>(null)
  const latest = useRef({ content: { path, text, viewStateKey } as CodeContent, onError })
  latest.current = { content: { path, text, viewStateKey }, onError }
  const tooLarge = viewerTextTooLarge(text)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  useEffect(() => {
    const node = host.current
    if (!active || tooLarge || !node) return
    let cancelled = false
    setPhase({ kind: 'loading' })
    void loadMonaco()
      .then((runtime) => openCodeSession(runtime, node, latest.current.content, () => cancelled))
      .then((opened) => {
        if (!opened) return
        if (cancelled) { opened.dispose(); return }
        session.current = opened
        // Props may have changed while the font and grammar were loading.
        opened.show(latest.current.content)
        setPhase({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = `代码查看器无法加载：${error instanceof Error ? error.message : String(error)}`
        setPhase({ kind: 'failed', message })
        latest.current.onError?.(message)
      })
    return () => {
      cancelled = true
      session.current?.dispose()
      session.current = null
    }
  }, [active, tooLarge])

  useEffect(() => { session.current?.show({ path, text, viewStateKey }) }, [path, text, viewStateKey])

  // Reported once per file, not on every render: the panel shows its own state for files above the service limit.
  useEffect(() => { if (active && tooLarge) latest.current.onError?.(CODE_VIEWER_TOO_LARGE) }, [active, tooLarge, path, viewStateKey])

  const notice = tooLarge ? { role: 'alert', text: CODE_VIEWER_TOO_LARGE }
    : !active ? null
    : phase.kind === 'failed' ? { role: 'alert', text: phase.message }
    : phase.kind === 'loading' ? { role: 'status', text: '代码查看器加载中…' }
    : null
  return (
    <div className="code-viewer" role="group" aria-label={codeAriaLabel(path)} data-state={tooLarge ? 'too-large' : active ? phase.kind : 'inactive'}>
      <div className="code-viewer__host" ref={host} />
      {notice && <p className="code-viewer__notice" role={notice.role}>{notice.text}</p>}
    </div>
  )
}
