import { searchContract } from '@shared/ipc/search'
import { SEARCH_LIMITS, type SearchRequest } from '@shared/tools/search'
import type { CoreServices } from '../services/core'
import { searchFor } from '../services/search'
import { defineHandlers, IpcValidationError } from './registry'
import { expectOnlyKeys, expectRecord, expectString } from './validate'

function flag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new IpcValidationError(`${field} must be a boolean`)
  return value
}

export function parseSearchRequest(raw: unknown): SearchRequest {
  const value = expectRecord(raw)
  expectOnlyKeys(value, ['projectId', 'searchId', 'query', 'isRegex', 'caseSensitive', 'wholeWord', 'include', 'exclude'])
  const query = expectString(value.query, 'query', { minLength: 1, maxLength: SEARCH_LIMITS.queryLength })
  // eslint-disable-next-line no-control-regex
  if (/[\u0000\n\r]/.test(query)) throw new IpcValidationError('query must be a single line')
  return {
    projectId: expectString(value.projectId, 'projectId', { minLength: 1, maxLength: 100 }),
    searchId: expectString(value.searchId, 'searchId', { minLength: 1, maxLength: 100 }),
    query,
    isRegex: flag(value.isRegex, 'isRegex'), caseSensitive: flag(value.caseSensitive, 'caseSensitive'), wholeWord: flag(value.wholeWord, 'wholeWord'),
    include: expectString(value.include, 'include', { maxLength: SEARCH_LIMITS.globsLength }),
    exclude: expectString(value.exclude, 'exclude', { maxLength: SEARCH_LIMITS.globsLength })
  }
}

export function createSearchFeature(core: CoreServices) {
  const service = searchFor(core)
  return defineHandlers(searchContract, {
    run: { parse: parseSearchRequest, handle: (request, context) => service.run(request.projectId, request.searchId, request, context.senderId) },
    cancel: {
      parse: (raw) => {
        const value = expectRecord(raw)
        expectOnlyKeys(value, ['projectId', 'searchId'])
        return { projectId: expectString(value.projectId, 'projectId', { minLength: 1, maxLength: 100 }), searchId: expectString(value.searchId, 'searchId', { minLength: 1, maxLength: 100 }) }
      },
      handle: ({ projectId, searchId }, context) => service.cancel(projectId, searchId, context.senderId)
    }
  }, () => service.dispose())
}
