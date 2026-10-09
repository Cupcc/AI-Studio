// Shell composition. Placeholder only: real regions (tabs, navigation,
// canvas, side bar) are built by the project-shell task.
import { AppInfoPanel } from '../features/app-info/AppInfoPanel'
import { TopBar } from './TopBar'
import './shell.css'

export function App() {
  return (
    <div className="shell">
      <TopBar />
      <main className="shell__body">
        <section className="shell__placeholder">
          <h1>AI Developer Studio</h1>
          <p className="shell__muted">Application skeleton. Product UI is not part of this build.</p>
          <AppInfoPanel />
        </section>
      </main>
    </div>
  )
}
