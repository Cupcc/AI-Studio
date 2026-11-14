import { useEffect, useState } from 'react'
import { REPOSITORY_URL, RELEASES_URL, releaseTagUrl, type UpdateState } from '@shared/ipc/updates'
import { SETTINGS_STRINGS as T } from '@shared/settings/strings'
import { Icon } from '../../app/Icon'
import { AgentMarkdown } from '../session/Markdown'
import iconLight from '../../assets/app-icon.png'
import iconDark from '../../assets/app-icon-dark.png'
import { useAbout, versionReport } from './store'
import './about.css'

const COPIED_MS = 1600

const time = (at: number) => new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Status line, progress and action of Settings › 关于 › 软件更新. */
function UpdateStatus({ update }: { update: UpdateState }) {
  const { check, restartToUpdate, actionError } = useAbout()
  const { phase, release, progress } = update
  const percent = progress && progress.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null
  const busy = phase === 'checking' || phase === 'downloading'
  const title =
    phase === 'checking' ? T.checking
      : phase === 'downloading' && release ? T.downloading(release.version)
        : phase === 'ready' && release ? T.ready(release.version)
          : (phase === 'available' || phase === 'error') && release ? T.available(release.version)
            : phase === 'current' ? T.current : null
  const detail =
    phase === 'downloading' && progress ? `${megabytes(progress.received)} / ${megabytes(progress.total)}${percent === null ? '' : ` · ${percent}%`}`
      : phase === 'ready' ? T.readyHint
        : phase === 'available' && update.blocked ? update.blocked
          : update.checkedAt ? T.lastChecked(time(update.checkedAt)) : null
  const error = actionError ?? (phase === 'error' ? update.error : null)
  return <div className="about-update" data-update-phase={phase}>
    <div className="about-update__row">
      <div className="about-update__text" role="status">
        {title && <p className="about-update__title">{phase === 'current' && <Icon name="check" size={14} />}{title}</p>}
        {detail && <p className="about-update__detail">{detail}</p>}
      </div>
      <div className="about-update__actions">
        {phase === 'ready'
          ? <button className="primary-button button--small" onClick={() => void restartToUpdate()}>{T.restart}</button>
          : <>
            {release && (update.blocked || phase === 'error') && <a className="secondary-button button--small" href={release.url} target="_blank" rel="noreferrer">{T.download}</a>}
            <button className="secondary-button button--small" disabled={busy} onClick={() => void check()}>{phase === 'error' ? T.retry : T.check}</button>
          </>}
      </div>
    </div>
    {phase === 'downloading' && <div className="about-update__progress" role="progressbar" aria-label={T.downloading(release?.version ?? '')}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}><span style={{ width: `${percent ?? 0}%` }} /></div>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {release && release.notes.trim() && <details className="about-update__notes">
      <summary>{T.releaseNotes} · {release.name}</summary>
      <div className="about-update__notes-body"><AgentMarkdown text={release.notes} /></div>
    </details>}
  </div>
}

/** Settings › 关于 (FR-SET-003): version and build, software updates, runtime details and project links. */
export function AboutPanel() {
  const { info, infoFailed, update, load, setAutomatic } = useAbout()
  const [copied, setCopied] = useState(false)
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () => { if (info) void navigator.clipboard.writeText(versionReport(info)).then(() => setCopied(true)) }

  return <section className="settings-dialog__content about" aria-label={T.about}>
    <header className="about__product">
      <picture className="about__icon">
        <source srcSet={iconDark} media="(prefers-color-scheme: dark)" />
        <img src={iconLight} alt="" width={64} height={64} />
      </picture>
      <div className="about__identity">
        <h3>{info?.name ?? 'AI Developer Studio'}</h3>
        {info && <p className="about__version" data-testid="app-version">
          {T.version(info.version)}{!info.isPackaged && <span className="about__tag">{T.development}</span>}
        </p>}
        {info?.build.commit && <p className="about__build">{info.build.commit}{info.build.date && ` · ${info.build.date.slice(0, 10)}`}</p>}
        {infoFailed && <p className="error-message" role="alert">{T.infoLoadFailed}</p>}
      </div>
      {info && <button className="secondary-button button--small about__copy" onClick={copy}>
        <Icon name={copied ? 'check' : 'copy'} size={13} />{copied ? T.copied : T.copyInfo}
      </button>}
    </header>

    <h3 className="settings-dialog__subheading">{T.updates}</h3>
    {update && <UpdateStatus update={update} />}
    {update && <label className="about__toggle">
      <input type="checkbox" checked={update.automatic} onChange={(event) => void setAutomatic(event.target.checked)} />
      <span><span>{T.automatic}</span><small>{T.automaticHint}</small></span>
    </label>}

    {info && <>
      <h3 className="settings-dialog__subheading">{T.details}</h3>
      <dl className="about__details" data-testid="app-info">
        <dt>Electron</dt><dd>{info.versions.electron}</dd>
        <dt>Chromium</dt><dd>{info.versions.chrome}</dd>
        <dt>Node.js</dt><dd>{info.versions.node}</dd>
        <dt>系统</dt><dd>macOS {info.osVersion} · {info.arch}</dd>
      </dl>
    </>}

    <h3 className="settings-dialog__subheading">{T.links}</h3>
    <ul className="about__links">
      {info && <li><a href={releaseTagUrl(info.version)} target="_blank" rel="noreferrer">{T.currentNotes}</a></li>}
      <li><a href={RELEASES_URL} target="_blank" rel="noreferrer">{T.releases}</a></li>
      <li><a href={REPOSITORY_URL} target="_blank" rel="noreferrer">{T.repository}</a></li>
    </ul>
    {info?.build.date && <p className="about__copyright">Copyright © {info.build.date.slice(0, 4)} AI Developer Studio</p>}
  </section>
}
