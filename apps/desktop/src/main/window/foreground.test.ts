import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { observeWindowForeground } from './foreground'

class WindowFixture extends EventEmitter {
  focused = true
  visible = true
  minimized = false
  destroyed = false
  isFocused() { return this.focused }
  isVisible() { return this.visible }
  isMinimized() { return this.minimized }
  isDestroyed() { return this.destroyed }
}
const settled = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('native window foreground · S-Q1 / FR-STATE-005', () => {
  it('samples current state when a late minimize event follows restored focus', async () => {
    const window = new WindowFixture(), publish = vi.fn()
    const dispose = observeWindowForeground(window, publish)
    window.minimized = true; window.focused = false; window.emit('minimize')
    await settled()
    expect(publish).toHaveBeenLastCalledWith(false)
    window.minimized = false; window.focused = true
    window.emit('restore'); window.emit('focus'); window.emit('minimize')
    await settled()
    expect(publish).toHaveBeenLastCalledWith(true)
    dispose()
  })

  it('publishes hidden or minimized as inactive and resynchronizes show/restore without a focus event', async () => {
    const window = new WindowFixture(), publish = vi.fn()
    const dispose = observeWindowForeground(window, publish)
    window.visible = false; window.emit('hide')
    await settled(); expect(publish).toHaveBeenLastCalledWith(false)
    window.visible = true; window.emit('show')
    await settled(); expect(publish).toHaveBeenLastCalledWith(true)
    window.minimized = true; window.emit('minimize')
    await settled(); expect(publish).toHaveBeenLastCalledWith(false)
    window.minimized = false; window.emit('restore')
    await settled(); expect(publish).toHaveBeenLastCalledWith(true)
    dispose()
  })

  it('does not publish against a destroyed window', async () => {
    const window = new WindowFixture(), publish = vi.fn()
    observeWindowForeground(window, publish)
    window.destroyed = true; window.emit('closed')
    await settled()
    expect(publish).not.toHaveBeenCalled()
    expect(window.listenerCount('focus')).toBe(0)
  })
})
