import { S, PRODUCT_NAME } from '@shared/project/strings'
import { openProjectIds } from '@shared/project/tabs'
import { formatOpenedAt } from '@shared/project/format'
import { Icon } from '../../app/Icon'
import { useProjectShell } from './store'

export function Launcher() {
  const shell = useProjectShell()
  const openIds = openProjectIds(shell.windowState)
  return <main className="launcher" aria-label="启动页">
    <div className="launcher__content">
      <div className="launcher__intro"><h1>{PRODUCT_NAME}</h1><p className="muted">{S.launcherSubtitle}</p></div>
      <button className="primary-button launcher__open" disabled={shell.opening} onClick={() => void shell.openDirectory()}>{S.openDirectory}</button>
      {shell.error && <p role="alert" className="error-message">{shell.error}</p>}
      {shell.recent.length > 0 && <section className="launcher__recent"><h2>{S.recentProjects}</h2>
        {shell.recent.map(({ project, status }) => { const detail = status === 'ok' ? formatOpenedAt(project.lastOpenedAt) : S.recentStatus[status]; return <div className={`recent-project ${status !== 'ok' ? 'recent-project--unavailable' : ''}`} key={project.id}>
          <button className="recent-project__open" disabled={shell.opening} onClick={() => void shell.openPath(project.canonicalPath)} title={project.localPath}>
            <span className="recent-project__title"><span className="recent-project__name">{project.name}</span>{openIds.includes(project.id) && <span className="recent-project__badge">{S.alreadyOpen}</span>}</span>
            <span className="recent-project__meta"><span className="recent-project__path">{project.localPath}</span>{detail && <span className="recent-project__time">· {detail}</span>}</span>
          </button><button className="recent-project__remove icon-button" aria-label={`${S.removeFromRecent} ${project.name}`} data-tip={S.removeFromRecent} onClick={() => void shell.removeRecent(project.id)}><Icon name="close" size={12} /></button>
        </div> })}
      </section>}
    </div>
  </main>
}
