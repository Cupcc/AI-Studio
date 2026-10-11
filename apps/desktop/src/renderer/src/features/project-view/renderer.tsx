import { memo, type ReactNode } from 'react'
import { bindingValue, hasContent } from '@shared/project-view/schema'
import type { Json, ViewNode, ViewSnapshot } from '@shared/project-view/types'

function display(value: Json | undefined): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return Array.isArray(value) ? value.map(display).join(' · ') : Object.entries(value).map(([key, item]) => `${key}: ${display(item)}`).join(' · ')
  return String(value)
}
function object(value: Json | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
function Diagram({ value, direction }: { value: Json | undefined; direction?: string }) {
  const graph = object(value)
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.map(object) : []
  const edges = Array.isArray(graph.edges) ? graph.edges.map(object) : []
  if (!nodes.length) return <p className="muted">暂无关系节点</p>
  const horizontal = direction !== 'vertical'
  const columns = horizontal ? Math.min(3, nodes.length) : 1
  const positions = new Map(nodes.map((node, i) => [String(node.id), { x: 20 + i % columns * 220, y: 24 + Math.floor(i / columns) * 120 }]))
  const width = columns * 220 + 20, height = Math.ceil(nodes.length / columns) * 120 + 24
  return <div className="view-diagram"><svg role="img" aria-label="关系图" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
    {edges.map((edge, i) => {
      const from = positions.get(String(edge.from)), to = positions.get(String(edge.to))
      if (!from || !to) return null
      const x1 = horizontal ? from.x + 180 : from.x + 90, y1 = horizontal ? from.y + 28 : from.y + 56
      const x2 = horizontal ? to.x : to.x + 90, y2 = horizontal ? to.y + 28 : to.y
      const angle = Math.atan2(y2 - y1, x2 - x1), size = 7
      return <g key={i}><path className="view-diagram__edge" d={`M${x1},${y1} L${x2},${y2}`} /><path className="view-diagram__arrow" d={`M${x2},${y2} L${x2 - size * Math.cos(angle - .5)},${y2 - size * Math.sin(angle - .5)} L${x2 - size * Math.cos(angle + .5)},${y2 - size * Math.sin(angle + .5)} Z`} /><text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 - 6}>{typeof edge.label === 'string' ? edge.label.slice(0, 24) : ''}</text></g>
    })}
    {nodes.map((node, i) => {
      const x = 20 + i % columns * 220, y = 24 + Math.floor(i / columns) * 120
      const title = display(node.name ?? node.label ?? node.id)
      return <g key={i}><title>{title}{node.path ? ` · ${display(node.path)}` : ''}</title><rect x={x} y={y} width={180} height={56} rx={6} /><text x={x + 12} y={y + 24}>{title.length > 19 ? title.slice(0, 18) + '…' : title}</text>{node.path && <text className="view-diagram__path" x={x + 12} y={y + 43}>{display(node.path).slice(0, 24)}</text>}</g>
    })}
  </svg></div>
}
export function ViewRenderer({ snapshot }: { snapshot: ViewSnapshot }) {
  const { knowledge, definition } = snapshot
  function render(node: ViewNode, key: string): ReactNode {
    const value = bindingValue(knowledge, definition, node), props = node.props
    const children = node.children?.map((child, index) => render(child, `${key}.${index}`))
    let content: ReactNode
    if (['stack', 'grid', 'section'].includes(node.type)) content = children
    else if (!hasContent(value)) content = <p className="muted">暂无内容</p>
    else switch (node.type) {
      case 'diagram': content = <Diagram value={value} direction={props?.direction} />; break
      case 'table': {
        const rows = Array.isArray(value) ? value : []
        const columns = props?.columns ?? Object.keys(object(rows[0])).slice(0, 8)
        content = <div className="view-table-scroll"><table><thead><tr>{columns.map(col => <th key={col}>{col}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{columns.map(col => <td key={col}>{display(object(row)[col])}</td>)}</tr>)}</tbody></table></div>
        break
      }
      case 'list': case 'timeline':
        content = <ul>{(Array.isArray(value) ? value : [value!]).map((item, i) => <li key={i}>{display(item)}</li>)}</ul>; break
      case 'empty': content = <p className="muted">暂无内容</p>; break
      default: content = <p>{display(value)}</p>
    }
    return <section key={key} className={`view-node view-node--${node.type} view-node--${props?.variant ?? 'default'}`}>{props?.title && <h3>{props.title}</h3>}{content}</section>
  }
  return <>{knowledge?.example && <p className="view-example">示例数据</p>}{render(definition.root, 'root')}</>
}
export const MemoViewRenderer = memo(ViewRenderer)
