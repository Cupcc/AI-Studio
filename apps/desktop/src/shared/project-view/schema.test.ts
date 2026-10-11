import { describe, expect, it } from 'vitest'
import { DEFAULT_DEFINITIONS } from './defaults'
import { bindingValue, hasRenderableContent, isSafeRelativePath, parseDefinition, parseKnowledge } from './schema'
const doc = (data: unknown) => ({ schemaVersion: 1, viewId: 'architecture', data })
const def = () => structuredClone(DEFAULT_DEFINITIONS.get('architecture')!)
describe('Project View schema · DEC-04/05', () => {
  it('loads five versioned resources and uses safe, own-property bindings', () => {
    expect(DEFAULT_DEFINITIONS.size).toBe(5)
    const definition = def(), knowledge = parseKnowledge(doc({ summary: 'Payments' }), 'architecture')
    expect(bindingValue(knowledge, definition, definition.root.children![0]!)).toBe('Payments')
    expect(hasRenderableContent(knowledge, definition)).toBe(true)
    expect(hasRenderableContent(parseKnowledge(doc({ unrelated: true }), 'architecture'), definition)).toBe(false)
  })
  it.each(['../../secret', '/etc/passwd', 'https://example.com', 'C:\\secret', 'a/../b', 'a//b'])('rejects escaped path %s', path => {
    expect(isSafeRelativePath(path)).toBe(false)
    expect(() => parseKnowledge(doc({ modules: [{ path }] }), 'architecture')).toThrow()
  })
  it.each(['script', 'html', 'style', 'css', '__proto__', 'constructor', 'onClick'])('rejects executable field %s', key => {
    expect(() => parseKnowledge(doc({ [key]: 'unsafe' }), 'architecture')).toThrow()
  })
  it('rejects unknown versions, components, binding expressions, styles and oversized trees', () => {
    expect(() => parseKnowledge({ ...doc({}), schemaVersion: 2 }, 'architecture')).toThrow('schemaVersion')
    expect(() => parseKnowledge(doc({}), 'progress')).toThrow('viewId')
    expect(() => parseDefinition({ ...def(), root: { type: 'iframe' } }, 'architecture')).toThrow('component')
    expect(() => parseDefinition({ ...def(), root: { type: 'text', props: { style: 'background:url(x)' } } }, 'architecture')).toThrow()
    for (const path of ['sessions.title', 'data.__proto__.secret', 'data[0]', 'data.foo()', 'data.constructor']) {
      expect(() => parseDefinition({ ...def(), bindings: { summary: path } }, 'architecture')).toThrow()
    }
    expect(() => parseDefinition({ ...def(), root: { type: 'stack', children: Array.from({ length: 500 }, () => ({ type: 'text' })) } }, 'architecture')).toThrow('limit')
  })
})
