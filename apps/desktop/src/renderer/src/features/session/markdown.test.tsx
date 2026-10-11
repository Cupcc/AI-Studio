import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptItem } from '@shared/session/types'
import { AgentMarkdown, CodeBlock } from './Markdown'
import { Transcript } from './Transcript'

afterEach(() => { cleanup(); vi.useRealTimers(); Reflect.deleteProperty(navigator, 'clipboard') })

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}

const reply = [
  '## 修改', '', '- **续费**：读取 `amount`', '  - 嵌套项', '- 取消', '', '1. 第一步', '2. 第二步', '',
  '| 测试集 | 通过 |', '|---|---:|', '| unit | 42 |', '',
  '> 引用说明', '', '---', '',
  '[Stripe 文档](https://docs.stripe.com/billing) [本地文件](src/a.ts) [脚本](javascript:alert(1))', '',
  '<b>raw</b> ![架构图](https://example.com/a.png) $x^2$'
].join('\n')

describe('Agent reply Markdown · Shell Spec v02 §6 · FR-SESSION-001', () => {
  it('renders headings, nested lists, tables, quotes, rules, inline code and bold', () => {
    const { container } = render(<AgentMarkdown text={reply} />)
    expect(screen.getByRole('heading', { level: 3, name: '修改' })).toBeTruthy()
    expect(container.querySelector('ul > li > ul > li')?.textContent).toBe('嵌套项')
    expect(container.querySelectorAll('ol > li')).toHaveLength(2)
    expect(container.querySelector('strong')?.textContent).toBe('续费')
    expect(container.querySelector(':not(pre) > code')?.textContent).toBe('amount')
    expect(container.querySelector('.markdown-table > table')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '通过' }).className).toBe('is-numeric')
    expect(screen.getByRole('cell', { name: '42' }).className).toBe('is-numeric')
    expect(screen.getByRole('cell', { name: 'unit' }).className).toBe('')
    expect(container.querySelector('blockquote')?.textContent?.trim()).toBe('引用说明')
    expect(container.querySelector('hr')).toBeTruthy()
  })

  it('links only http(s) URLs, keeps raw HTML literal and does not render images or math', () => {
    const { container } = render(<AgentMarkdown text={reply} />)
    const links = [...container.querySelectorAll('a')]
    expect(links.map((link) => [link.textContent, link.getAttribute('href'), link.target, link.rel])).toEqual([['Stripe 文档', 'https://docs.stripe.com/billing', '_blank', 'noreferrer']])
    expect(screen.getByText('本地文件').tagName).toBe('SPAN')
    expect(screen.getByText('脚本').tagName).toBe('SPAN')
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<b>raw</b>')
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('架构图')
    expect(container.textContent).toContain('$x^2$')
  })

  it('renders an unclosed fence while streaming as a code block up to the current end', () => {
    const { container } = render(<AgentMarkdown text={'正在修改：\n\n```ts\nconst total = 1'} />)
    expect(container.querySelector('.code-block pre')?.textContent).toBe('const total = 1')
  })

  it('keeps user messages as plain text', () => {
    const item: TranscriptItem = { id: 'u', sessionId: 's', turnId: 't', at: 1, sequence: 1, kind: 'user_message', text: '**不要加粗** `code`', contextItems: [] }
    const { container } = render(<Transcript item={item} />)
    expect(container.querySelector('strong, code')).toBeNull()
    expect(container.textContent).toBe('**不要加粗** `code`')
  })
})

describe('Code block · Shell Spec v02 §6', () => {
  it('labels the language and highlights keywords, strings, numbers and comments', () => {
    const { container } = render(<AgentMarkdown text={'```ts\n// 按分计算\nconst label = "amount"\nreturn Math.round(19.99 * 100)\n```'} />)
    expect(container.querySelector('.code-block__header')?.textContent).toContain('ts')
    expect(container.querySelector('.hljs-comment')?.textContent).toBe('// 按分计算')
    expect([...container.querySelectorAll('.hljs-keyword')].map((node) => node.textContent)).toEqual(['const', 'return'])
    expect(container.querySelector('.hljs-string')?.textContent).toBe('"amount"')
    expect([...container.querySelectorAll('.hljs-number')].map((node) => node.textContent)).toEqual(['19.99', '100'])
    expect(container.querySelector('pre')?.textContent).toBe('// 按分计算\nconst label = "amount"\nreturn Math.round(19.99 * 100)')
  })

  it('marks diff lines with full-width backgrounds but leaves file headers neutral', () => {
    const { container } = render(<CodeBlock language="diff" code={'--- a/callback.ts\n+++ b/callback.ts\n@@ -1,2 +1,2 @@\n-  res.redirect(nextUrl)\n+  await writeSession(res, user)\n }'} />)
    const lines = [...container.querySelectorAll('.code-block__line')].map((line) => line.className.replace('code-block__line', '').trim())
    expect(lines).toEqual(['', '', 'code-block__line--hunk', 'code-block__line--del', 'code-block__line--add', ''])
  })

  it('shows unlabelled or unknown languages as plain text', () => {
    const { container } = render(<AgentMarkdown text={'```\nplain <text>\n```\n\n```unknownlang\nx = 1\n```'} />)
    expect([...container.querySelectorAll('.code-block__header > span:first-child')].map((node) => node.textContent)).toEqual(['text', 'unknownlang'])
    expect(container.querySelector('.code-block [class^="hljs-"]')).toBeNull()
  })

  it('copies the code source and briefly shows 已复制', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async () => {}); stubClipboard(writeText)
    render(<CodeBlock language="bash" code={'pnpm test\n'} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制代码' })) })
    expect(writeText).toHaveBeenCalledWith('pnpm test\n')
    expect(screen.getByRole('button', { name: '复制代码' }).textContent).toBe('已复制')
    act(() => { vi.advanceTimersByTime(1600) })
    expect(screen.getByRole('button', { name: '复制代码' }).textContent).toBe('复制')
  })

  it('selects the code for ⌘C when the clipboard is unavailable', async () => {
    stubClipboard(async () => { throw new Error('denied') })
    render(<CodeBlock language="bash" code="pnpm test" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制代码' })) })
    expect(screen.getByRole('button', { name: '复制代码' }).textContent).toBe('已选中，按 ⌘C 复制')
    expect(window.getSelection()?.toString()).toBe('pnpm test')
  })
})
