// W5 Part 1 复验：agent-browser 0.39.0 的 `mouse wheel` 固定投递在 (0,0)（实测 target 为 topbar），无法滚动指定区域；
// 这里经同一 CDP 端口用 Input.dispatchMouseEvent(mouseWheel) 在指定坐标合成滚轮，等价于真实滚轮输入，不读写任何应用状态。
// 用法：node W5-cdp-wheel.mjs <cdpPort> <x> <y> <deltaY>
const [port, x, y, dy] = process.argv.slice(2).map(Number)
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find(t => t.type === 'page' && t.url.startsWith('app://'))
if (!page) throw new Error('app page target not found')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
ws.send(JSON.stringify({ id: 1, method: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy } }))
await new Promise(res => { ws.onmessage = e => { if (JSON.parse(e.data).id === 1) res() } })
ws.close()
