import { useEffect, useRef, type ReactNode } from 'react'
import { projectPathName, projectPathParent, type ProjectPath } from '@shared/tools/files'
import type { SearchLine, SearchResult } from '@shared/tools/search'
import { Icon } from '../../../app/Icon'
import { displayName } from '../../../lib/display-path'
import { FileIcon } from '../files/file-icon'
import { useFiles } from '../files/files-store'
import { showTool } from '../show-tool'
import { useSearch } from './search-store'
import './search.css'

export const SEARCH_TEXT = {
  title: 'Search',
  query: '搜索',
  placeholder: '搜索',
  caseSensitive: '区分大小写',
  wholeWord: '全字匹配',
  regex: '使用正则表达式',
  details: '切换搜索详细信息',
  include: '包含的文件',
  includePlaceholder: '例如：src, *.ts, docs/**',
  exclude: '排除的文件',
  excludePlaceholder: '例如：**/*.test.ts, dist',
  refresh: '重新搜索',
  clear: '清除搜索结果',
  collapse: '全部折叠',
  expand: '全部展开',
  searching: '正在搜索…',
  empty: '未找到结果。可检查搜索条件和包含 / 排除的文件；被 .gitignore 忽略的文件不在结果中。',
  results: '搜索结果',
  summary: (matches: number, files: number) => `在 ${files} 个文件中找到 ${matches} 个结果`,
  limitHit: '结果过多，只显示前一部分；请缩小搜索范围。',
  invalid: '搜索条件无效',
  failed: (reason: string) => reason === 'timeout' ? '搜索超时，请缩小范围后重试' : reason === 'project_closing' ? 'Project 正在关闭' : '搜索失败，请重试',
  hint: '在当前 Project 中搜索文本。遵守 .gitignore，不搜索 .git。'
} as const

function Highlighted({ line }: { line: SearchLine }) {
  const parts: ReactNode[] = []
  let at = 0
  line.ranges.forEach((range, index) => {
    if (range.start > at) parts.push(line.preview.slice(at, range.start))
    parts.push(<mark key={index}>{line.preview.slice(range.start, range.end)}</mark>)
    at = Math.max(at, range.end)
  })
  parts.push(line.preview.slice(at))
  return <>{parts}</>
}

function Toggle({ icon, label, pressed, onToggle }: { icon: string; label: string; pressed: boolean; onToggle(): void }) {
  return <button type="button" className={`search-toggle ${pressed ? 'is-selected' : ''}`} aria-label={label} aria-pressed={pressed} data-tip={label} onClick={onToggle}><Icon name={icon} size={14} /></button>
}

function Summary({ result, searching }: { result: SearchResult | null; searching: boolean }) {
  if (searching) return <p className="search-summary" role="status">{SEARCH_TEXT.searching}</p>
  if (!result) return null
  if (result.status === 'invalid') return <div className="search-summary search-summary--error" role="alert"><strong>{SEARCH_TEXT.invalid}</strong><pre>{result.message}</pre></div>
  if (result.status === 'unavailable') return <p className="search-summary search-summary--error" role="alert">{SEARCH_TEXT.failed(result.reason)}</p>
  if (result.status !== 'ok') return null
  if (!result.matches) return <p className="search-summary" role="status">{result.limitHit ? SEARCH_TEXT.limitHit : SEARCH_TEXT.empty}</p>
  return <>
    <p className="search-summary" role="status">{SEARCH_TEXT.summary(result.matches, result.files.length)}</p>
    {result.limitHit && <p className="search-summary search-summary--warn" role="status">{SEARCH_TEXT.limitHit}</p>}
  </>
}

/** VS Code's Search view (FR-TOOL-005): query with case / word / regex toggles, include / exclude, grouped results. */
export function SearchPanel({ projectId, active }: { projectId: string; active: boolean }) {
  const search = useSearch(state => state.projects[projectId])
  const store = useSearch.getState()
  const input = useRef<HTMLInputElement>(null)
  const query = search?.query ?? ''
  useEffect(() => { if (active) { input.current?.focus(); input.current?.select() } }, [active, search?.focus])

  function open(path: ProjectPath, line: SearchLine) {
    showTool(projectId, 'files')
    void useFiles.getState().open(projectId, path, { line: line.line })
  }
  const result = search?.result ?? null
  const files = result?.status === 'ok' ? result.files : []
  const allCollapsed = files.length > 0 && files.every(file => search?.collapsed.has(file.path))

  return <section className="search-tool" aria-label={SEARCH_TEXT.title}>
    <div className="search-header">
      <div className="search-row">
        <button type="button" className={`icon-button search-details ${search?.details ? 'is-open' : ''}`} aria-label={SEARCH_TEXT.details} aria-expanded={search?.details ?? false} data-tip={SEARCH_TEXT.details}
          onClick={() => store.update(projectId, { details: !search?.details })}><Icon name="chevron" size={12} /></button>
        <div className="search-field">
          <input ref={input} type="text" aria-label={SEARCH_TEXT.query} placeholder={SEARCH_TEXT.placeholder} value={query} spellCheck={false} autoComplete="off"
            onChange={event => store.update(projectId, { query: event.target.value })}
            onKeyDown={event => {
              const toggle = event.altKey && event.metaKey ? ({ KeyC: 'caseSensitive', KeyW: 'wholeWord', KeyR: 'isRegex' } as const)[event.code as 'KeyC'] : undefined
              if (toggle) { event.preventDefault(); store.update(projectId, { [toggle]: !search?.[toggle] }); return }
              if (event.key === 'Enter') { event.preventDefault(); void store.run(projectId) }
              else if (event.key === 'Escape' && query) { event.preventDefault(); store.clear(projectId) }
            }} />
          <Toggle icon="case-sensitive" label={`${SEARCH_TEXT.caseSensitive} ⌥⌘C`} pressed={search?.caseSensitive ?? false} onToggle={() => store.update(projectId, { caseSensitive: !search?.caseSensitive })} />
          <Toggle icon="whole-word" label={`${SEARCH_TEXT.wholeWord} ⌥⌘W`} pressed={search?.wholeWord ?? false} onToggle={() => store.update(projectId, { wholeWord: !search?.wholeWord })} />
          <Toggle icon="regex" label={`${SEARCH_TEXT.regex} ⌥⌘R`} pressed={search?.isRegex ?? false} onToggle={() => store.update(projectId, { isRegex: !search?.isRegex })} />
        </div>
      </div>
      {search?.details && <div className="search-details-fields">
        <label><span>{SEARCH_TEXT.include}</span><input type="text" value={search.include} placeholder={SEARCH_TEXT.includePlaceholder} spellCheck={false}
          onChange={event => store.update(projectId, { include: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') void store.run(projectId) }} /></label>
        <label><span>{SEARCH_TEXT.exclude}</span><input type="text" value={search.exclude} placeholder={SEARCH_TEXT.excludePlaceholder} spellCheck={false}
          onChange={event => store.update(projectId, { exclude: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') void store.run(projectId) }} /></label>
      </div>}
      <div className="search-actions">
        <Summary result={result} searching={search?.searching ?? false} />
        <span className="grow" />
        <button className="icon-button" aria-label={SEARCH_TEXT.refresh} data-tip={SEARCH_TEXT.refresh} disabled={!query} onClick={() => void store.run(projectId)}><Icon name="refresh" size={14} /></button>
        <button className="icon-button" aria-label={SEARCH_TEXT.clear} data-tip={SEARCH_TEXT.clear} disabled={!query && !result} onClick={() => store.clear(projectId)}><Icon name="close" size={14} /></button>
        <button className="icon-button" aria-label={allCollapsed ? SEARCH_TEXT.expand : SEARCH_TEXT.collapse} data-tip={allCollapsed ? SEARCH_TEXT.expand : SEARCH_TEXT.collapse} data-tip-align="end" disabled={!files.length}
          onClick={() => store.collapseAll(projectId, !allCollapsed)}><Icon name="collapse" size={14} /></button>
      </div>
    </div>
    <div className="search-results" role="tree" aria-label={SEARCH_TEXT.results}>
      {!query && !result && <p className="search-hint">{SEARCH_TEXT.hint}</p>}
      {files.map(file => {
        const collapsed = search?.collapsed.has(file.path) ?? false
        const dir = projectPathParent(file.path)
        return <div key={file.path} className="search-file" role="treeitem" aria-expanded={!collapsed} aria-level={1}>
          <button className="search-file__row" onClick={() => store.toggleFile(projectId, file.path)} title={displayName(file.path)}>
            <span className="search-file__chevron" aria-hidden="true"><Icon name="chevron" size={12} /></span>
            <FileIcon name={file.path} kind="file" />
            <span className="search-file__name">{displayName(projectPathName(file.path))}</span>
            {dir && <span className="search-file__dir">{displayName(dir)}</span>}
            <span className="search-file__count">{file.matches}</span>
          </button>
          {!collapsed && <div role="group">
            {file.lines.map((line, index) => <button key={`${line.line}:${index}`} className="search-match" role="treeitem" aria-level={2}
              title={`${displayName(file.path)}:${line.line}:${line.column}`} onClick={() => open(file.path, line)}>
              <span className="search-match__line">{line.line}</span><span className="search-match__text"><Highlighted line={line} /></span>
            </button>)}
          </div>}
        </div>
      })}
    </div>
  </section>
}

export default SearchPanel
