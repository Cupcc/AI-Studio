import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createFontGate, FONT_WAIT_MS } from './terminal-font'

const FONT = "12px 'IBM Plex Mono', monospace"

class FakeFonts extends EventTarget {
  usable = false
  loading: { resolve(): void; reject(error: Error): void } | null = null
  check = vi.fn((_font: string) => this.usable)
  load = vi.fn((_font: string) => new Promise<FontFace[]>((resolve, reject) => {
    this.loading = { resolve: () => { this.usable = true; resolve([]) }, reject }
  }))
}
const fakeFonts = () => new FakeFonts() as FakeFonts & Pick<FontFaceSet, 'check' | 'load' | 'addEventListener' | 'removeEventListener'>

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

it('is never pending when the font is already usable or the document has no font set', async () => {
  const fonts = fakeFonts(); fonts.usable = true
  const loaded = createFontGate(FONT, { fonts })
  expect(loaded.pending).toBe(false)
  expect(fonts.load).not.toHaveBeenCalled()
  await expect(loaded.settled).resolves.toBeUndefined()
  expect(createFontGate(FONT).pending).toBe(false)
  fonts.check.mockImplementation(() => { throw new SyntaxError('invalid font shorthand') })
  expect(createFontGate(FONT, { fonts }).pending).toBe(false)
})

it('stays pending while the web font loads, then settles', async () => {
  const fonts = fakeFonts()
  const gate = createFontGate(FONT, { fonts })
  expect(gate.pending).toBe(true)
  expect(fonts.load).toHaveBeenCalledWith(FONT)
  let settled = false
  void gate.settled.then(() => { settled = true })
  await vi.advanceTimersByTimeAsync(100)
  expect(settled).toBe(false)
  fonts.loading!.resolve()
  await gate.settled
  expect(gate.pending).toBe(false)
  gate.dispose()
})

it('stops waiting when the font fails to load or never arrives', async () => {
  const failing = fakeFonts()
  const failed = createFontGate(FONT, { fonts: failing })
  failing.loading!.reject(new Error('network'))
  await expect(failed.settled).resolves.toBeUndefined()
  expect(failed.pending).toBe(false)

  const hanging = fakeFonts()
  const hung = createFontGate(FONT, { fonts: hanging })
  expect(hung.pending).toBe(true)
  await vi.advanceTimersByTimeAsync(FONT_WAIT_MS)
  await expect(hung.settled).resolves.toBeUndefined()
  expect(hung.pending).toBe(false)
})

it('reports later font loads until it is disposed', () => {
  const fonts = fakeFonts(); fonts.usable = true
  const gate = createFontGate(FONT, { fonts })
  const listener = vi.fn()
  const off = gate.onLoaded(listener)
  fonts.dispatchEvent(new Event('loadingdone'))
  expect(listener).toHaveBeenCalledTimes(1)
  off()
  fonts.dispatchEvent(new Event('loadingdone'))
  expect(listener).toHaveBeenCalledTimes(1)
  gate.onLoaded(listener)
  gate.dispose()
  fonts.dispatchEvent(new Event('loadingdone'))
  expect(listener).toHaveBeenCalledTimes(1)
})
