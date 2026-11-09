import { Suspense, useEffect, useState } from 'react'
import { Icon } from '../../app/Icon'
import { readReference, useReferenceInspector, type ReferenceContent } from '../input/reference-preview'
import { LazyCodeViewer } from './code/lazy'

/** A native Skill may live outside the Project. Its opaque ID opens this read-only inspector, never Files paths. */
export function ReferenceInspector({ projectId, active }: { projectId: string; active: boolean }) {
  const current = useReferenceInspector(s => s.current)
  const [content, setContent] = useState<ReferenceContent | null>(null), [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!current || !active || current.projectId !== projectId) return
    let live = true
    setContent(null); setError(null)
    void readReference(projectId, current.cli, current.item).then(result => { if (live) setContent(result) })
      .catch(reason => { if (live) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { live = false }
  }, [current, projectId, active])
  if (!current || current.projectId !== projectId) return null
  return <section className="reference-inspector" aria-label="Skill 文件查看器">
    <header><Icon name="terminal" size={16} /><strong>{current.item.name}/SKILL.md</strong><button type="button" aria-label="关闭 Skill 文件" onClick={() => useReferenceInspector.setState({ current: null })}><Icon name="close" size={14} /></button></header>
    {error ? <p role="alert">{error}</p> : !content ? <p role="status">正在读取…</p> : <>
      {content.truncated && <p role="status">文件较大，仅展示前 256 KiB。</p>}
      <Suspense fallback={<pre>{content.text}</pre>}><LazyCodeViewer path="SKILL.md" text={content.text} active={active} wordWrap viewStateKey={`${projectId}:skill:${current.item.id}`} /></Suspense>
    </>}
  </section>
}
