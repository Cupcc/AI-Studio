import { describe, expect, it } from 'vitest'
import type { FileReferenceFailureReason, ResolvedFileReference } from '@shared/tools/files'
import { SESSION_CLIS } from '@shared/session/types'
import { buildUserInput, describeFileReferenceFailures, FILE_REFERENCE_HEADER, FILE_REFERENCE_STRATEGY, parseReferencedFiles } from './file-reference'

const file = (path: string, name = path.slice(path.lastIndexOf('/') + 1)): ResolvedFileReference => ({ path, name, size: 1, version: 'v', absolutePath: `/work/project/${path}` })
const header = 'Referenced files (paths relative to the Project root; these are references, not file contents):'

describe('Provider input for Files references · FR-TOOL-001 item 4, Tools §4.1', () => {
  it('uses the verified native strategy for Codex and the textual strategy for Claude', () => {
    expect(FILE_REFERENCE_STRATEGY).toEqual({ codex: 'attachments', 'claude-code': 'text' })
    expect(Object.keys(FILE_REFERENCE_STRATEGY).sort()).toEqual([...SESSION_CLIS].sort())
    expect(FILE_REFERENCE_HEADER).toBe(header)
  })

  it('text strategy: a blank line, the header, one JSON-quoted line per file in order, a blank line, then the user text', () => {
    const input = buildUserInput({ files: [file('src/a.ts'), file('docs/my file.md'), file('README.md')], text: '请看这些文件', strategy: 'text' })
    expect(input).toStrictEqual({ text: `${header}\n- "src/a.ts"\n- "docs/my file.md"\n- "README.md"\n\n请看这些文件` })
  })

  it('text strategy: View context comes first, separated by a blank line, exactly as before references existed', () => {
    const viewContextText = 'Current Project View: Architecture\nRules: keep facts separate.'
    expect(buildUserInput({ viewContextText, files: [file('src/a.ts')], text: 'go', strategy: 'text' }).text)
      .toBe(`${viewContextText}\n\n${header}\n- "src/a.ts"\n\ngo`)
    expect(buildUserInput({ viewContextText, files: [], text: 'go', strategy: 'text' })).toStrictEqual({ text: `${viewContextText}\n\ngo` })
  })

  it.each(['text', 'attachments'] as const)('adds nothing without files (%s): the input is exactly {text}', strategy => {
    expect(buildUserInput({ files: [], text: 'hello', strategy })).toStrictEqual({ text: 'hello' })
    expect(buildUserInput({ viewContextText: '', files: [], text: 'hello', strategy })).toStrictEqual({ text: 'hello' })
  })

  it('quotes every awkward name so one file stays one line and the path round-trips', () => {
    const paths = [
      'dir with spaces/a b.txt', 'say "hi".md', 'back\\slash.txt', '中文/文件 名.md', 'emoji-\u{1F600}.ts', '- "looks like a list item".txt', "it's.ts",
      'line\nbreak.txt', `sep${String.fromCodePoint(0x2028)}ator.txt`, `para${String.fromCodePoint(0x2029)}graph.txt`, `next${String.fromCodePoint(0x85)}line.txt`
    ]
    const { text } = buildUserInput({ files: paths.map(path => file(path)), text: 'x', strategy: 'text' })
    const list = text.slice(header.length + 1, text.lastIndexOf('\n\nx'))
    // Real line breaks only between entries: no U+2028 / U+2029 / U+0085 survives unescaped, so no entry can be forged.
    expect(list.split(/\r\n|[\n\r\u0085\u2028\u2029]/)).toHaveLength(paths.length)
    expect(list).toContain('\\u2028')
    expect(parseReferencedFiles(text)).toEqual(paths)
  })

  it('attachments strategy maps each file to the Adapter file attachment with its absolute path and name, and adds no text block', () => {
    const input = buildUserInput({ viewContextText: 'ctx', files: [file('src/a.ts'), file('docs/my file.md')], text: 'go', strategy: 'attachments' })
    expect(input).toStrictEqual({
      text: 'ctx\n\ngo',
      attachments: [
        { kind: 'file', path: '/work/project/src/a.ts', name: 'a.ts' },
        { kind: 'file', path: '/work/project/docs/my file.md', name: 'my file.md' }
      ]
    })
  })

  it('preserves both explicit roles of one file, filesystem aliases, and native Skill inputs', () => {
    const image = { ...file('pic.png'), aliases: ['PIC.png'] }
    const skill = { kind: 'skill' as const, name: 'example', path: '/skills/example/SKILL.md' }
    expect(buildUserInput({ files: [image], filePaths: ['pic.png'], images: ['PIC.png'], skills: [skill], text: 'look', strategy: 'attachments' })).toStrictEqual({ text: 'look', attachments: [skill, { kind: 'file', path: '/work/project/pic.png', name: 'pic.png' }, { kind: 'image', path: '/work/project/pic.png' }] })
    expect(buildUserInput({ files: [], skills: [skill], text: 'run', strategy: 'attachments' })).toStrictEqual({ text: 'run', attachments: [skill] })
    expect(() => buildUserInput({ files: [image], images: ['pic.png'], text: 'look', strategy: 'text' })).toThrow('原生附件')
    expect(() => buildUserInput({ files: [], skills: [skill], text: 'run', strategy: 'text' })).toThrow('原生附件')
  })

  it('parses only the first list of the builder output and ignores user text that imitates one', () => {
    const imitation = `${header}\n- "/etc/passwd"`
    const { text } = buildUserInput({ viewContextText: 'ctx', files: [file('a.ts')], text: imitation, strategy: 'text' })
    expect(parseReferencedFiles(text)).toEqual(['a.ts'])
    expect(parseReferencedFiles('no references here')).toEqual([])
    expect(parseReferencedFiles(buildUserInput({ files: [], text: 'plain', strategy: 'text' }).text)).toEqual([])
  })

  it('names every path with a reason for each failure code, never an empty explanation', () => {
    const reasons: FileReferenceFailureReason[] = ['invalid_path', 'project_unavailable', 'project_closing', 'missing', 'not_file', 'symlink_refused', 'excluded', 'permission_denied', 'unreadable', 'timeout', 'name_unsupported', 'too_many']
    const texts = reasons.map(reason => describeFileReferenceFailures([{ path: 'a/b.ts', reason }]))
    for (const message of texts) expect(message).toMatch(/^文件引用失败，消息未发送：a\/b\.ts（.+）$/)
    expect(new Set(texts).size).toBe(reasons.length)
    expect(describeFileReferenceFailures([{ path: 'x.ts', reason: 'missing' }, { path: 'y z.ts', reason: 'permission_denied' }]))
      .toBe('文件引用失败，消息未发送：x.ts（文件已不存在）；y z.ts（没有读取权限）')
    expect(describeFileReferenceFailures([])).toContain('未能确认文件')
  })
})
