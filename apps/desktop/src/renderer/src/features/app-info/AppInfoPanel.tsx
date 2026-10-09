import { useEffect } from 'react'
import { useAppInfoStore } from './store'
import './app-info.css'

export function AppInfoPanel() {
  const { status, info, error, load, watchWindowFocus } = useAppInfoStore()

  useEffect(() => {
    void load()
    return watchWindowFocus()
  }, [load, watchWindowFocus])

  if (status === 'error') return <p role="alert">Failed to load app info: {error}</p>
  if (!info) return <p className="app-info__muted">Loading…</p>

  return (
    <dl className="app-info" data-testid="app-info">
      <dt>Version</dt>
      <dd>{info.version}</dd>
      <dt>Electron</dt>
      <dd>{info.versions.electron}</dd>
      <dt>Chrome</dt>
      <dd>{info.versions.chrome}</dd>
      <dt>Node</dt>
      <dd>{info.versions.node}</dd>
      <dt>Platform</dt>
      <dd>
        {info.platform}-{info.arch}
      </dd>
    </dl>
  )
}
