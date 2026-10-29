import { browserContract } from '@shared/ipc/browser'
import type { BrowserBounds, BrowserRef, BrowserZoom } from '@shared/tools/browser'
import type { CoreServices } from '../services/core'
import { browserFor } from '../services/browser'
import { defineHandlers, IpcValidationError } from './registry'
import { expectOnlyKeys, expectRecord, expectString } from './validate'

function reference(raw: unknown, extra: string[] = []): BrowserRef {
  const value = expectRecord(raw)
  expectOnlyKeys(value, ['projectId', 'generation', ...extra])
  return {
    projectId: expectString(value.projectId, 'projectId', { minLength: 1, maxLength: 100 }),
    generation: expectString(value.generation, 'generation', { minLength: 1, maxLength: 100 })
  }
}
function bounds(raw: unknown): BrowserBounds {
  const value = expectRecord(raw, 'bounds')
  expectOnlyKeys(value, ['x', 'y', 'width', 'height'])
  for (const key of ['x', 'y', 'width', 'height']) {
    const number = value[key]
    if (typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > 32768 || ((key === 'width' || key === 'height') && number < 0)) {
      throw new IpcValidationError(`Invalid bounds.${key}`)
    }
  }
  return value as unknown as BrowserBounds
}
function externalReference(raw: unknown) {
  const value = expectRecord(raw)
  return { ...reference(value, ['requestId']), requestId: expectString(value.requestId, 'requestId', { minLength: 1, maxLength: 100 }) }
}

export function createBrowserFeature(core: CoreServices) {
  const service = browserFor(core)
  return defineHandlers(browserContract, {
    getState: {
      parse: raw => {
        const value = expectRecord(raw); expectOnlyKeys(value, ['projectId'])
        return { projectId: expectString(value.projectId, 'projectId', { minLength: 1, maxLength: 100 }) }
      },
      handle: ({ projectId }, context) => service.getState(projectId, context.senderId)
    },
    navigate: {
      parse: raw => {
        const value = expectRecord(raw)
        return { ...reference(value, ['url']), url: expectString(value.url, 'url', { minLength: 1, maxLength: 8192 }) }
      },
      handle: (request, context) => service.navigate(request, request.url, context.senderId)
    },
    reload: { parse: reference, handle: (request, context) => service.reload(request, context.senderId) },
    stop: { parse: reference, handle: (request, context) => service.stop(request, context.senderId) },
    goBack: { parse: reference, handle: (request, context) => service.goBack(request, context.senderId) },
    goForward: { parse: reference, handle: (request, context) => service.goForward(request, context.senderId) },
    toggleDevTools: { parse: reference, handle: (request, context) => service.toggleDevTools(request, context.senderId) },
    zoom: {
      parse: raw => {
        const value = expectRecord(raw)
        const zoom = value.zoom
        if (zoom !== 'in' && zoom !== 'out' && zoom !== 'reset') throw new IpcValidationError('zoom must be in, out or reset')
        return { ...reference(value, ['zoom']), zoom: zoom as BrowserZoom }
      },
      handle: (request, context) => service.zoom(request, request.zoom, context.senderId)
    },
    openInSystemBrowser: { parse: reference, handle: (request, context) => service.openInSystemBrowser(request, context.senderId) },
    clearData: { parse: reference, handle: (request, context) => service.clearData(request, context.senderId) },
    dismissNotice: { parse: reference, handle: (request, context) => service.dismissNotice(request, context.senderId) },
    newTab: {
      parse: raw => {
        const value = expectRecord(raw); expectOnlyKeys(value, ['projectId', 'url'])
        const projectId = expectString(value.projectId, 'projectId', { minLength: 1, maxLength: 100 })
        return value.url === undefined ? { projectId } : { projectId, url: expectString(value.url, 'url', { maxLength: 8192 }) }
      },
      handle: (request, context) => service.newTab(request.projectId, request.url, context.senderId)
    },
    selectTab: { parse: reference, handle: (request, context) => service.selectTab(request, context.senderId) },
    closeTab: { parse: reference, handle: (request, context) => service.closeTab(request, context.senderId) },
    toggleFavorite: { parse: reference, handle: (request, context) => service.toggleFavorite(request, context.senderId) },
    suggest: {
      parse: raw => { const value = expectRecord(raw); expectOnlyKeys(value, ['query']); return { query: expectString(value.query, 'query', { maxLength: 8192 }) } },
      handle: ({ query }) => service.suggest(query)
    },
    clearHistory: { parse: reference, handle: (request, context) => service.clearHistory(request, context.senderId) },
    answerPermission: {
      parse: raw => {
        const value = expectRecord(raw)
        if (typeof value.allow !== 'boolean') throw new IpcValidationError('allow must be a boolean')
        return { ...reference(value, ['requestId', 'allow']), requestId: expectString(value.requestId, 'requestId', { minLength: 1, maxLength: 100 }), allow: value.allow }
      },
      handle: (request, context) => service.answerPermission(request, request.requestId, request.allow, context.senderId)
    },
    resetPermissions: { parse: reference, handle: (request, context) => service.resetPermissions(request, context.senderId) },
    setBounds: {
      parse: raw => {
        const value = expectRecord(raw)
        return { ...reference(value, ['bounds']), bounds: bounds(value.bounds) }
      },
      handle: (request, context) => service.setBounds(request, request.bounds, context.senderId)
    },
    setVisible: {
      parse: raw => {
        const value = expectRecord(raw)
        if (typeof value.visible !== 'boolean') throw new IpcValidationError('visible must be a boolean')
        return { ...reference(value, ['visible']), visible: value.visible }
      },
      handle: (request, context) => service.setVisible(request, request.visible, context.senderId)
    },
    focus: { parse: reference, handle: (request, context) => service.focus(request, context.senderId) },
    openExternal: { parse: externalReference, handle: (request, context) => service.openExternal(request, context.senderId) },
    dismissExternal: { parse: externalReference, handle: (request, context) => service.dismissExternal(request, context.senderId) }
  }, () => service.dispose())
}
