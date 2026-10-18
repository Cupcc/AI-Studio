import { useEffect, useState } from 'react'
import type { TurnDiffRecord, TurnDiffRef } from '@shared/tools/turn-diff'
import { TURN_DIFF_COVERAGE } from '@shared/tools/turn-diff'
import { studio } from '../../../lib/studio'
import { displayName } from '../../../lib/display-path'
import { PatchView } from './FileDiffView'
import { useTurnDiff } from './turn-diff-store'
import './diff.css'

const STATUS = { unknown: '没有取得原生聚合补丁', available: '已保存的原生补丁', empty: 'CLI 原生记录为空', unavailable: '本轮补丁不可用', failed: '原生补丁接收失败' }
const OUTCOME = { completed: '已完成', interrupted: '已停止', failed: '执行失败' }
const FILE_STATUS = { in_progress: '进行中', completed: '已完成', failed: '失败', declined: '已拒绝', interrupted: '已停止' }
const keyOf = (ref: TurnDiffRef) => `${ref.projectId}\0${ref.sessionId}\0${ref.turnId}`

export function TurnDiffPanel({ source, active }: { source: TurnDiffRef; active: boolean }) {
  const [result, setResult] = useState<{ key: string; record?: TurnDiffRecord; error?: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState('aggregate')
  const key = keyOf(source)
  useEffect(() => {
    if (!active) return
    let cancelled = false
    setResult(null)
    setSelected('aggregate')
    void studio().session.getTurnDiff(source).then(record => {
      if (!cancelled) setResult({ key, record })
    }, error => {
      if (!cancelled) setResult({ key, error: error instanceof Error ? error.message : '无法读取保存的补丁' })
    })
    return () => { cancelled = true }
  }, [source.projectId, source.sessionId, source.turnId, active, retry])
  const record = result?.key === key ? result.record : undefined
  const error = result?.key === key ? result.error : undefined
  const selectedFile = record?.files[Number(selected)]
  const patch = selected === 'aggregate' ? record?.patch : selectedFile?.patch
  return <section className="diff-tool" aria-label="本轮变更">
    <header className="diff-header">
      <div className="diff-header__row"><h2 className="diff-header__title">本轮变更</h2>
        <button className="secondary-button button--small" onClick={() => useTurnDiff.getState().clear(source.projectId)}>项目变更</button>
      </div>
      <div className="diff-header__meta"><span title={source.sessionId}>Session {source.sessionId.slice(0, 8)}</span><span title={source.turnId}>轮次 {source.turnId.slice(0, 8)}</span>{record?.outcome && <span>{OUTCOME[record.outcome]}</span>}</div>
    </header>
    <div className="diff-banner" role="note">{TURN_DIFF_COVERAGE}</div>
    <div className="diff-body turn-diff-body" aria-busy={!record && !error}>
      {error ? <div className="diff-state" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => setRetry(value => value + 1)}>重试</button></div>
        : !record ? <p className="diff-note" role="status">{active ? '正在读取本轮补丁…' : '面板已隐藏'}</p>
        : <>
          <div className="turn-diff-summary"><strong>{STATUS[record.state]}</strong>
            {!record.final && <span role="status">此轮尚未结束，当前为已收到的记录。</span>}
            {record.state === 'empty' && <span>原生聚合补丁明确为空；不代表共享工作区没有变更。</span>}
            {record.reason && <span>{record.reason}</span>}
            <details><summary>记录来源</summary><p>{record.provider}{record.cliVersion ? ` ${record.cliVersion}` : ''} · {record.source}</p><p>原生 Thread：{record.nativeSessionId || '未提供'}</p><p>原生 Turn：{record.nativeTurnId || '未提供'}</p><p>此处展示保存的 patch，未读取当前文件重建历史内容。文件数未知时不显示为 0。</p></details>
          </div>
          {record.files.length > 0 && <label className="turn-diff-selector">原生文件记录<select aria-label="原生补丁范围" value={selected} onChange={event => setSelected(event.target.value)}>
            <option value="aggregate">本轮聚合补丁</option>
            {record.files.map((file, index) => <option key={`${file.itemId}:${index}`} value={index}>{displayName(file.path)} · {FILE_STATUS[file.status]}</option>)}
          </select></label>}
          {selectedFile && <p className="diff-note">{selectedFile.change} · {displayName(selectedFile.path)} · {FILE_STATUS[selectedFile.status]}{selectedFile.oldPath ? `（原路径：${displayName(selectedFile.oldPath)}）` : ''}。补丁记录不代表写入成功。</p>}
          {record.fileListTruncated && <p className="diff-note diff-note--warn" role="status">原生文件记录超过保存限额，文件列表不完整。</p>}
          {patch ? <PatchView text={patch} truncated={selected === 'aggregate' ? (record.patchTruncated ?? record.truncated) : (selectedFile?.truncated ?? record.truncated)} /> : <p className="diff-note" role="status">{selected === 'aggregate' ? '没有可显示的聚合补丁。' : '该条目没有可显示的文本补丁。'}{record.files.length > 0 && selected === 'aggregate' ? '可选择原生文件记录查看。' : ''}</p>}
          {record.truncated && !patch && <p className="diff-note diff-note--warn" role="status">原生数据超过保存限额，记录不完整。</p>}
        </>}
    </div>
  </section>
}
