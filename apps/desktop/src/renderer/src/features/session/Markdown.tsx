import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { common, createLowlight } from 'lowlight'
import { Icon } from '../../app/Icon'

// Agent replies as Markdown (Shell Spec v02 §6; interactive prototype v02, confirmed 2026-10-10).
// Raw HTML stays literal text (react-markdown turns it into text nodes), images and math are not
// rendered, and only http(s) links become anchors; the main process hands them to the system browser.

const lowlight = createLowlight(common)
type HastNode = ReturnType<typeof lowlight.highlight>['children'][number]
const COPIED_MS = 1600

export function isExternalHref(href: string | undefined): href is string {
  return !!href && /^https?:\/\//i.test(href)
}

function renderHast(nodes: HastNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === 'text') return node.value
    if (node.type !== 'element') return null
    const className = node.properties.className
    return <span key={index} className={Array.isArray(className) ? className.join(' ') : undefined}>{renderHast(node.children)}</span>
  })
}

/** Unified diff lines get a full-width background; file headers and hunks stay neutral. */
function diffLines(code: string): ReactNode {
  return code.split('\n').map((line, index) => {
    const kind = /^(\+\+\+|---)(\s|$)/.test(line) ? '' : line.startsWith('+') ? ' code-block__line--add' : line.startsWith('-') ? ' code-block__line--del' : line.startsWith('@@') ? ' code-block__line--hunk' : ''
    return <span key={index} className={`code-block__line${kind}`}>{line || ' '}</span>
  })
}

function highlight(code: string, language: string): ReactNode {
  if (language === 'diff' || language === 'patch') return diffLines(code)
  if (!language || !lowlight.registered(language)) return code
  try {
    return renderHast(lowlight.highlight(language, code).children)
  } catch {
    return code
  }
}

export const CodeBlock = memo(function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle')
  const preRef = useRef<HTMLPreElement>(null), timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const body = useMemo(() => highlight(code, language), [code, language])
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copyCode() {
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(code)
      setCopy('copied')
    } catch {
      // Clipboard unavailable: select the code so ⌘C copies it.
      const pre = preRef.current, selection = window.getSelection()
      if (pre && selection) { const range = document.createRange(); range.selectNodeContents(pre); selection.removeAllRanges(); selection.addRange(range) }
      setCopy('manual')
    }
    timer.current = setTimeout(() => setCopy('idle'), COPIED_MS)
  }
  return <div className="code-block">
    <div className="code-block__header">
      <span>{language || 'text'}</span>
      <button className="code-block__copy" aria-label="复制代码" onClick={() => void copyCode()}>
        <Icon name={copy === 'copied' ? 'check' : 'copy'} size={13} />{copy === 'copied' ? '已复制' : copy === 'manual' ? '已选中，按 ⌘C 复制' : '复制'}
      </button>
      <span className="sr-only" role="status">{copy === 'copied' ? '已复制' : ''}</span>
    </div>
    <pre ref={preRef}><code>{body}</code></pre>
  </div>
})

function cellClass(style: ComponentProps<'td'>['style']): string | undefined {
  return style?.textAlign === 'right' ? 'is-numeric' : undefined
}

const components: Components = {
  // Reply headings sit inside a message, so they are demoted to two quiet levels (prototype v02 .ma h3 / h4).
  h1: ({ node: _node, ...props }) => <h3 {...props} />,
  h2: ({ node: _node, ...props }) => <h3 {...props} />,
  h3: ({ node: _node, ...props }) => <h4 {...props} />,
  h4: ({ node: _node, ...props }) => <h4 {...props} />,
  h5: ({ node: _node, ...props }) => <h4 {...props} />,
  h6: ({ node: _node, ...props }) => <h4 {...props} />,
  a: ({ node: _node, href, children }) => isExternalHref(href) ? <a href={href} target="_blank" rel="noreferrer" title={href}>{children}</a> : <span>{children}</span>,
  img: ({ alt }) => alt ? <span>{alt}</span> : null,
  table: ({ node: _node, ...props }) => <div className="markdown-table"><table {...props} /></div>,
  th: ({ node: _node, style, ...props }) => <th {...props} style={style} className={cellClass(style)} />,
  td: ({ node: _node, style, ...props }) => <td {...props} style={style} className={cellClass(style)} />,
  // Fenced and indented code arrive as <pre><code class="language-x">; inline code keeps the default <code>.
  pre: ({ node, children }) => {
    const code = node?.children[0]
    if (code?.type !== 'element' || code.tagName !== 'code') return <pre>{children}</pre>
    const classes = Array.isArray(code.properties.className) ? code.properties.className.map(String) : []
    const language = classes.find((name) => name.startsWith('language-'))?.slice('language-'.length).toLowerCase() ?? ''
    return <CodeBlock code={textOf(code).replace(/\n$/, '')} language={language} />
  }
}

function textOf(node: HastNode): string {
  return node.type === 'text' ? node.value : 'children' in node ? node.children.map(textOf).join('') : ''
}

const remarkPlugins = [remarkGfm]

export const AgentMarkdown = memo(function AgentMarkdown({ text }: { text: string }) {
  // Streaming deltas re-render often; parse the latest text without blocking input.
  const deferred = useDeferredValue(text)
  return <div className="markdown">
    <Markdown remarkPlugins={remarkPlugins} components={components}>{deferred}</Markdown>
  </div>
})
