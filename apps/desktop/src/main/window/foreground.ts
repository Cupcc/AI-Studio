/** Native visibility events may arrive after focus during macOS animations. */
interface ForegroundWindow {
  isDestroyed(): boolean
  isFocused(): boolean
  isVisible(): boolean
  isMinimized(): boolean
  on(event: string, listener: () => void): unknown
  removeListener(event: string, listener: () => void): unknown
}

const events = ['focus', 'blur', 'show', 'hide', 'minimize', 'restore'] as const

export function observeWindowForeground(window: ForegroundWindow, publish: (focused: boolean) => void): () => void {
  let pending: ReturnType<typeof setImmediate> | undefined
  const sync = () => {
    if (pending) return
    pending = setImmediate(() => {
      pending = undefined
      if (!window.isDestroyed()) publish(window.isFocused() && window.isVisible() && !window.isMinimized())
    })
  }
  const dispose = () => {
    if (pending) clearImmediate(pending)
    pending = undefined
    for (const event of events) window.removeListener(event, sync)
    window.removeListener('closed', dispose)
  }
  for (const event of events) window.on(event, sync)
  window.on('closed', dispose)
  sync()
  return dispose
}
