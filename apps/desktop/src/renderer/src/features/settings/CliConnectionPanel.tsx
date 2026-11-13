import { useEffect, useRef, useState } from 'react'
import { DEFAULT_TEST_MODELS, type CliConnection, type CliConnectionDraft, type ConnectionTestResult } from '@shared/session/cli-connection'
import { Icon } from '../../app/Icon'
import { sessionApi } from '../session/api'
import { ipcErrorText } from '../../lib/ipc-error'

interface Props {
  connection: CliConnection
  name: string
  onClose(): void
  onSaved(connection: CliConnection): void
}
type TestState = { status: 'idle' } | { status: 'running' } | { status: 'complete'; result: ConnectionTestResult }

export function CliConnectionPanel({ connection, name, onClose, onSaved }: Props) {
  const [saved, setSaved] = useState(connection)
  const [mode, setMode] = useState(connection.mode)
  const [baseUrl, setBaseUrl] = useState(connection.profile?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  /** The saved key once loaded into the masked field; null when none is saved or it could not be read. */
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [testModel, setTestModel] = useState(connection.profile?.testModel ?? '')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const back = useRef<HTMLButtonElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; back.current?.focus(); return () => { active.current = false } }, [])
  // Fill the masked key field with the saved key, unless the user has already typed one. If it cannot be read, leaving the field empty keeps the saved key.
  useEffect(() => {
    if (!connection.profile?.hasApiKey) return
    void sessionApi().getCliConnectionKey({ cli: connection.cli }).then(key => {
      if (!active.current || !key) return
      setSavedKey(key); setApiKey(current => current || key)
    }, () => {})
  }, [connection.cli, connection.profile?.hasApiKey])
  // Results and errors render at the end of the scrolling body; bring them into view.
  useEffect(() => {
    if ((test.status === 'complete' || error) && body.current) body.current.scrollTop = body.current.scrollHeight
  }, [test, error])
  const keyChanged = Boolean(apiKey) && apiKey !== savedKey
  const dirty = mode !== saved.mode || (mode === 'app' && (baseUrl.trim().replace(/\/+$/, '') !== saved.profile?.baseUrl || keyChanged || testModel.trim() !== (saved.profile?.testModel ?? '')))
  const defaultModel = DEFAULT_TEST_MODELS[connection.cli]
  const busy = saving || test.status === 'running'
  const hasKey = Boolean(saved.profile?.hasApiKey)
  const complete = Boolean(baseUrl.trim() && (apiKey || hasKey))
  const canSave = dirty && (mode === 'local' || complete)
  const draft = (): CliConnectionDraft => ({ cli: connection.cli, baseUrl: baseUrl.trim(), auth: saved.profile?.auth ?? 'api_key', ...(keyChanged ? { apiKey } : {}), ...(testModel.trim() ? { testModel: testModel.trim() } : {}) })
  const changeMode = (next: 'local' | 'app') => { setMode(next); setTest({ status: 'idle' }); setError(null) }
  const save = async () => {
    if (!canSave || busy) return
    setSaving(true); setError(null); setTest({ status: 'idle' })
    try {
      const next = await sessionApi().saveCliConnection(mode === 'local' ? { cli: connection.cli, mode } : { mode, ...draft() })
      onSaved(next)
      if (!active.current) return
      if (mode === 'app' && apiKey) setSavedKey(apiKey)
      setSaved(next); setBaseUrl(next.profile?.baseUrl ?? ''); setShowKey(false); setTestModel(next.profile?.testModel ?? '')
    } catch (reason) { if (active.current) setError(ipcErrorText(reason)) }
    finally { if (active.current) setSaving(false) }
  }
  const runTest = async () => {
    if (busy || mode !== 'app' || !complete) return
    setTest({ status: 'running' }); setError(null)
    try {
      const result = await sessionApi().testCliConnection(draft())
      if (active.current) setTest({ status: 'complete', result })
    } catch (reason) { if (active.current) setTest({ status: 'complete', result: { ok: false, message: ipcErrorText(reason) } }) }
  }
  return <section className="settings-dialog__content cli-connection" aria-label={`${name} 连接`}>
    <header className="cli-connection__header">
      <button className="icon-button" ref={back} aria-label="返回 CLI 列表" disabled={saving} onClick={onClose}><Icon name="arrow-left" /></button>
      <h3>{name} <span>连接</span></h3>
      <span className="cli-connection__save-state">{dirty ? '未保存' : '已保存'}</span>
    </header>
    <div className="cli-connection__body" ref={body}>
      <div className="cli-connection__modes" role="radiogroup" aria-label="配置来源">
        {(['local', 'app'] as const).map(value => <button key={value} role="radio" aria-checked={mode === value} tabIndex={mode === value ? 0 : -1}
          disabled={busy} className={mode === value ? 'is-selected' : ''} onClick={() => changeMode(value)}
          onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'local' : event.key === 'End' ? 'app' : mode === 'local' ? 'app' : 'local'; changeMode(next); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus() } }} data-mode={value}>
          <Icon name={value === 'local' ? 'terminal' : 'browser'} size={15} />{value === 'local' ? '本机配置' : '自定义连接'}
        </button>)}
      </div>
      {mode === 'local' ? <div className="cli-connection__native">
        <span className="cli-connection__native-icon"><Icon name="terminal" size={24} /></span>
        <h4>与本机 CLI 保持一致</h4>
        <p>使用本机的连接地址、凭据与模型。<br />在终端中修改配置，这里也会沿用。</p>
      </div> : <>
        <p className="cli-connection__hint">仅替换地址与密钥；会话的模型和其他设置沿用本机。</p>
        <div className="cli-connection__fields">
          <label htmlFor="connection-url">Base URL</label>
          <input id="connection-url" value={baseUrl} spellCheck={false} autoComplete="off" disabled={busy} placeholder={connection.cli === 'codex' ? 'https://api.example.com/v1' : 'https://api.example.com'} onChange={event => { setBaseUrl(event.target.value); setTest({ status: 'idle' }) }} />
          <div className="cli-connection__key-label"><label htmlFor="connection-key">API Key</label>{hasKey && <span><Icon name="check" size={12} />已安全保存</span>}</div>
          <div className="cli-connection__key">
            <input id="connection-key" type={showKey ? 'text' : 'password'} value={apiKey} autoComplete="new-password" spellCheck={false} disabled={busy} placeholder={hasKey ? '留空保留已保存的密钥' : '输入 API Key'} onChange={event => { setApiKey(event.target.value); setTest({ status: 'idle' }) }} />
            <button aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} disabled={!apiKey} onClick={() => setShowKey(value => !value)}>{showKey ? '隐藏' : '显示'}</button>
          </div>
          <label className="cli-connection__spaced" htmlFor="connection-test-model">测试模型</label>
          <input id="connection-test-model" value={testModel} spellCheck={false} autoComplete="off" disabled={busy} placeholder={`${defaultModel}（默认）`} onChange={event => { setTestModel(event.target.value); setTest({ status: 'idle' }) }} />
        </div>
        <section className="cli-connection__test" aria-label="连接测试">
          <div className="cli-connection__test-heading"><div><h4>连接测试</h4><p>{complete ? '用当前填写的内容发送 hi，检查网关是否可达' : '填写 Base URL 与 API Key 后即可测试'}</p></div>
            <button className="secondary-button" disabled={busy || !complete} onClick={() => void runTest()}><Icon name="refresh" size={14} />{test.status === 'running' ? '测试中…' : '测试连接'}</button>
          </div>
          {test.status === 'complete' && <div className={`cli-connection__result ${test.result.ok ? 'is-success' : 'is-error'}`} role="status">
            <div className="cli-connection__result-heading"><Icon name={test.result.ok ? 'check' : 'close'} size={15} /><strong>{test.result.ok ? '连接正常' : '连接失败'}</strong>{test.result.ok && <span>{(test.result.durationMs / 1000).toFixed(1)} s</span>}</div>
            {test.result.ok ? <><span className="cli-connection__model">{test.result.model}</span><p>{test.result.reply}</p>{dirty && <p className="cli-connection__result-note">尚未保存，保存后新会话才会使用此连接。</p>}</> : <p>{test.result.message}</p>}
          </div>}
          {test.status === 'running' && <p className="cli-connection__testing" role="status">正在等待 API 回复…</p>}
        </section>
      </>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
    <footer className="cli-connection__footer"><button className="secondary-button" disabled={saving} onClick={onClose}>取消</button><button className="primary-button" disabled={!canSave || busy} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button></footer>
  </section>
}
