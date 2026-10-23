import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import type { DraftKey, SkillCatalogResult } from '@shared/session/types'
import { FILES_LIMITS, isReferenceablePath } from '@shared/tools/files'
import { Icon } from '../../app/Icon'
import { filesApi } from '../tools/files/api'
import { draftId, useSessions } from '../session/store'
import { displayedDraftKey } from './add-file-reference'
import { useProjectShell } from '../project/store'

type Candidate = { id: string; name: string; detail?: string; kind: 'file' | 'directory' | 'skill' }
export function useSuggestions({ draftKey, text, input, active, cli, skills, loadSkills, report }: {
  draftKey: DraftKey; text: string; input: RefObject<HTMLTextAreaElement | null>; active: boolean; cli: string | null
  skills: SkillCatalogResult | null; loadSkills: () => Promise<void>; report: (message: string | null) => void
}) {
  const [caret, setCaret] = useState(0), [dismissed, setDismissed] = useState<string | null>(null), [index, setIndex] = useState(0)
  const [files, setFiles] = useState<Candidate[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false), [room, setRoom] = useState(300), request = useRef(0), listId = useId(), id = draftId(draftKey)
  const browsing = useRef<{ start: number; before: string } | null>(null)
  const prefix = text.slice(0, caret), anchor = browsing.current
  // Retain a directory chosen from the list even when its real name contains spaces.
  const inDirectory = anchor && text.slice(0, anchor.start) === anchor.before && prefix[anchor.start] === '@' && caret > anchor.start && !prefix.slice(anchor.start).includes('\n')
  const match = prefix.match(/(?:^|\s)([@/$])([^\s]*)$/)
  const kind = inDirectory ? '@' : match?.[1], query = inDirectory ? prefix.slice(anchor.start + 1) : match?.[2] ?? '', token = `${id}:${caret}:${text}`
  const open = active && !!kind && dismissed !== token
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => setRoom(Math.max(40, Math.min(300, (input.current?.closest('.composer__box')?.getBoundingClientRect().top ?? 400) - 100)))
    measure(); window.addEventListener('resize', measure)
    const observer = new ResizeObserver(measure), box = input.current?.closest('.composer__box')
    if (box) observer.observe(box)
    return () => { window.removeEventListener('resize', measure); observer.disconnect() }
  }, [open, text, id])
  const directory = query.includes('/') ? query.slice(0, query.lastIndexOf('/')) : ''
  const fileQuery = query.slice(directory ? directory.length + 1 : 0).toLowerCase()
  useEffect(() => { setIndex(0) }, [kind, query, id])
  useEffect(() => { setDismissed(null); setCaret(0); browsing.current = null; request.current++ }, [id, cli])
  useEffect(() => {
    if (!open || kind !== '$' || cli !== 'codex') return
    void loadSkills()
  }, [open, kind, cli, id])
  useEffect(() => {
    if (!open || kind !== '@') return
    const current = ++request.current
    setFiles([]); setLoading(true); setError(null); setTruncated(false)
    void filesApi().list({ projectId: draftKey.projectId, path: directory }).then(result => {
      if (request.current !== current) return
      if (result.status !== 'ok') { setError('无法读取此目录，可从 Files 选择文件。'); return }
      setFiles(result.entries.flatMap(entry => {
        const path = directory ? `${directory}/${entry.name}` : entry.name
        return (entry.kind === 'file' || entry.kind === 'directory') && isReferenceablePath(path)
          ? [{ id: path, name: entry.name, detail: entry.kind === 'directory' ? '打开目录' : path, kind: entry.kind }] : []
      }))
      setTruncated(result.truncated || !!result.omittedPaths)
    }).catch(() => { if (request.current === current) setError('无法读取此目录，可从 Files 选择文件。') })
      .finally(() => { if (request.current === current) setLoading(false) })
    return () => { request.current++ }
  }, [open, kind, directory, draftKey.projectId, id])
  const allItems: Candidate[] = kind === '@' ? files.filter(file => file.name.toLowerCase().includes(fileQuery)) : kind === '$' && cli === 'codex'
    ? (skills?.skills ?? []).filter(skill => `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase())).map(skill => ({ id: skill.id, name: skill.name, detail: skill.description, kind: 'skill' })) : []
  const items = allItems.slice(0, 40), selected = Math.min(index, Math.max(0, items.length - 1))
  useEffect(() => { document.getElementById(`${listId}-${selected}`)?.scrollIntoView?.({ block: 'nearest' }) }, [selected, listId, items[selected]?.id])
  async function choose(item: Candidate) {
    const start = inDirectory ? anchor.start : caret - query.length - 1, before = text.slice(0, start), after = text.slice(caret)
    if (item.kind === 'directory') {
      browsing.current = { start, before }
      const next = `${before}@${item.id}/${after}`, nextCaret = before.length + item.id.length + 2
      useSessions.getState().updateDraft(draftKey, { text: next }); setCaret(nextCaret)
      requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(nextCaret, nextCaret) })
      return
    }
    const ticket = ++request.current
    if (item.kind === 'file') {
      try {
        const result = await filesApi().resolveReference({ projectId: draftKey.projectId, paths: [item.id] })
        if (ticket !== request.current) return
        if (result.status !== 'ok') { report('文件已不可用，请从 Files 重新选择。'); return }
      } catch { if (ticket === request.current) report('无法添加文件，请重试。'); return }
    }
    const current = useSessions.getState().drafts[id], canvas = useProjectShell.getState().uiStates[draftKey.projectId]?.mainCanvas
    if (ticket !== request.current || !current || current.text !== text || !canvas || draftId(displayedDraftKey(draftKey.projectId, canvas)) !== id) return
    if (item.kind === 'file' && !current.contextItems.some(tag => tag.type === 'file' && tag.path === item.id) && current.contextItems.filter(tag => tag.type === 'file' || tag.type === 'image').length >= FILES_LIMITS.referencesPerMessage) { report(`最多添加 ${FILES_LIMITS.referencesPerMessage} 个文件或图片，请先移除标签。`); return }
    const context = item.kind === 'file' ? { type: 'file' as const, path: item.id } : { type: 'skill' as const, id: item.id, name: item.name }
    const duplicate = current.contextItems.some(tag => context.type === 'file' ? tag.type === 'file' && tag.path === context.path : tag.type === 'skill' && tag.id === context.id)
    useSessions.getState().updateDraft(draftKey, { text: before + after, contextItems: duplicate ? current.contextItems : [...current.contextItems, context] })
    browsing.current = null; setDismissed(token); setCaret(before.length); report(null)
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(before.length, before.length) })
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || event.nativeEvent.isComposing || event.keyCode === 229) return false
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); browsing.current = null; setDismissed(token); return true }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setIndex(items.length ? (selected + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length : 0); return true
    }
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab' && items.length > 0) {
      event.preventDefault(); if (items[selected]) void choose(items[selected]); return true
    }
    return false
  }
  const empty = kind === '/' ? '当前 CLI 未提供命令目录，Esc 后可继续输入。' : kind === '$' ? cli !== 'codex' ? '当前 CLI 未提供 Skill 目录。' : skills?.error ?? (skills ? '没有匹配的 Skill' : '正在读取 Skills…') : error ?? (loading ? '正在读取文件…' : '没有匹配的文件')
  return {
    dismiss: () => { browsing.current = null; setDismissed(token) },
    updateCaret: () => { setCaret(input.current?.selectionStart ?? 0); setDismissed(null) }, onKeyDown,
    attributes: open ? { role: 'combobox' as const, 'aria-autocomplete': 'list' as const, 'aria-expanded': true, 'aria-controls': listId, 'aria-activedescendant': items.length ? `${listId}-${selected}` : undefined } : {},
    popup: open ? <div className="composer__suggestions popover" style={{ maxHeight: room }}><div className="composer__menu-heading">{kind === '@' ? '引用文件' : kind === '$' ? 'Skills' : '命令'}<span>{kind}</span></div>
      <div id={listId} role="listbox" aria-label={kind === '@' ? '引用文件' : kind === '$' ? 'Skills' : '命令'}>
        {items.map((item, i) => <button type="button" tabIndex={-1} role="option" id={`${listId}-${i}`} key={item.id} aria-selected={i === selected} className="menu-item composer__candidate" onMouseDown={event => event.preventDefault()} onPointerDown={event => {
          // Directory navigation updates the controlled textarea synchronously. Handle it
          // at pointer-down so a textarea blur or a slow directory refresh cannot swallow
          // the click before the browsing anchor is recorded.
          event.preventDefault()
          if (item.kind === 'directory') void choose(item)
        }} onClick={() => { if (item.kind !== 'directory') void choose(item) }}>
          <Icon name={item.kind === 'directory' ? 'files' : item.kind === 'skill' ? 'terminal' : 'file'} size={15} /><span><span>{item.name}</span>{item.detail && <small>{item.detail}</small>}</span>
        </button>)}
      </div>
      {!items.length && <p className="composer__menu-empty" role="status">{empty}</p>}
      {(truncated || allItems.length > items.length) && <p className="composer__menu-empty">仅显示部分条目，可输入路径缩小范围或从 Files 选择。</p>}
    </div> : null
  }
}
