// W5 Part 6 复验：生成终端色彩场景文件（纯 ANSI 文本，写入 Project 目录，再在终端里 `cat`）。
// 用法：node W5-scenes-r7.mjs <输出目录>
// 这些文件只是测试数据（与 Part 3 里在终端输入的 `printf` 等价，但避免长命令在终端里被自动补全 / 括号配对破坏）；
// 没有改变应用行为。htop / tmux / p10k 本机没有或不适合直接运行，这里按它们的转义序列习惯**模拟**输出（报告里注明是模拟）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: node W5-scenes-r7.mjs <dir>')
mkdirSync(out, { recursive: true })
const ESC = '\x1b'
const sgr = (...p) => `${ESC}[${p.join(';')}m`
const R0 = sgr(0)
const write = (name, lines) => writeFileSync(join(out, name), lines.join('\n') + '\n')

// S1：16 个 ANSI 前景 × 8 个 ANSI 背景（128 对，含同色对）。单元格 ` MW8 `，标签 4 列，所以第 b 列从 4 + 5b 开始。
{
  const lines = [`S1 ANSI fg 0-15 (rows) x bg 0-7 (cols)`]
  for (let f = 0; f < 16; f++) {
    let line = `f${String(f).padStart(2, '0')} `
    for (let b = 0; b < 8; b++) line += `${sgr(f < 8 ? 30 + f : 90 + f - 8, 40 + b)} MW8 ${R0}`
    lines.push(line)
  }
  write('s1-sweep.ansi', lines)
}

// S2：W5-F9 复现用例 + 其它常见彩色背景写法（每行一种，文字不同便于定位）
write('s2-cases.ansi', [
  `S2 repro cases`,
  `${sgr(41)} CASE-41 default-fg on red ${R0}`,
  `${sgr(44, 97)} CASE-44-97 bright white on blue ${R0}`,
  `${sgr(43, 30)} CASE-43-30 black on yellow ${R0}`,
  `${sgr(1, 37, 41)} CASE-1-37-41 bold white on red ${R0}`,
  `${sgr(30, 47)} CASE-30-47 black on white ${R0}`,
  `${sgr(42)} CASE-42 default-fg on green ${R0}`,
  `${sgr(46, 30)} CASE-46-30 black on cyan ${R0}`,
  `${sgr(100)} CASE-100 default-fg on bright black ${R0}`,
  `${sgr(47)} CASE-47 default-fg on white ${R0}`,
  `${sgr(41, 37)} CASE-41-37 white on red ${R0}`,
  `${sgr(104, 30)} CASE-104-30 black on bright blue ${R0}`,
  `${sgr(7)} CASE-REV default reverse ${R0}  ${sgr(7, 31)} CASE-REV-31 reverse red ${R0}  ${sgr(1, 7, 34)} CASE-REV-BOLD-34 ${R0}`
])

// S3a / S3b：256 色前景（16×16）与背景（16×16，默认前景）
{
  const fg = [`S3a 256-colour foreground 0-255 on the default background`]
  for (let r = 0; r < 16; r++) { let l = ''; for (let c = 0; c < 16; c++) l += `${sgr(38, 5, r * 16 + c)} MW ${R0}`; fg.push(l) }
  write('s3a-256fg.ansi', fg)
  const bg = [`S3b 256-colour background 0-255 with the default foreground`]
  for (let r = 0; r < 16; r++) { let l = ''; for (let c = 0; c < 16; c++) l += `${sgr(48, 5, r * 16 + c)} MW ${R0}`; bg.push(l) }
  write('s3b-256bg.ansi', bg)
}

// S4：24 位色（前景 / 背景 / 渐变 / 下划线色 / 已达标的颜色 / 中亮度同色对）
{
  const hue = (h) => { // h 0..360 -> rgb（饱和 0.8，亮度 0.5）
    const c = 0.8, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = 0.5 - c / 2
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
    return [r, g, b].map(v => Math.round((v + m) * 255))
  }
  const N = 56
  let a = '', b = '', c = '', d = '', e = ''
  for (let i = 0; i < N; i++) {
    const [r, g, bl] = hue((i / N) * 360), gray = Math.round((i / (N - 1)) * 255)
    a += `${sgr(38, 2, r, g, bl)}M`
    b += `${sgr(48, 2, r, g, bl)}M`
    c += `${sgr(48, 2, gray, gray, gray)}M`
    d += `${sgr(38, 2, gray, gray, gray)}M`
    e += `${sgr(48, 2, r, g, bl)} `
  }
  write('s4-truecolor.ansi', [
    `S4 24-bit colour`,
    `fg hue ramp:  ${a}${R0}`,
    `bg hue ramp:  ${b}${R0}`,
    `bg gray ramp: ${c}${R0}`,
    `fg gray ramp: ${d}${R0}`,
    `bg bar (spaces): ${e}${R0}`,
    `${sgr(38, 2, 0, 60, 140)}PASS-A fg 0,60,140 on default${R0} ${sgr(48, 2, 20, 60, 110, 38, 2, 255, 255, 255)} PASS-B white on 20,60,110 ${R0} ${sgr(48, 2, 255, 220, 120, 38, 2, 40, 20, 0)} PASS-C 40,20,0 on 255,220,120 ${R0}`,
    `${sgr(38, 2, 255, 0, 0)}FIX-RED 255,0,0${R0} ${sgr(38, 2, 255, 255, 0)}FIX-YELLOW 255,255,0${R0} ${sgr(38, 2, 0, 255, 255)}FIX-CYAN 0,255,255${R0} ${sgr(38, 2, 0, 255, 0)}FIX-LIME 0,255,0${R0}`,
    `${sgr(4, 58, 2, 255, 0, 0)}UL-RGB-RED${R0} ${sgr(4, 58, 5, 196)}UL-256-196${R0} ${sgr('4:3', 58, 2, 0, 160, 0)}UL-CURLY-GREEN${R0} ${sgr(4, 58, 2, 0, 0, 255)}UL-BLUE${R0}`,
    `${sgr(48, 2, 119, 119, 119, 38, 2, 119, 119, 119)} SAME-119 ${R0} ${sgr(48, 2, 128, 128, 128, 38, 2, 100, 100, 100)} MID-128/100 ${R0} ${sgr(48, 2, 90, 90, 90, 38, 2, 140, 140, 140)} MID-90/140 ${R0} ${sgr(48, 2, 120, 120, 120, 38, 2, 200, 200, 200)} MID-120/200 ${R0}`,
    `${sgr(48, 2, 119, 119, 119, 38, 2, 255, 255, 255)} MID-119/255 ${R0} ${sgr(48, 2, 119, 119, 119, 38, 2, 0, 0, 0)} MID-119/0 ${R0} ${sgr(48, 2, 0, 0, 0, 38, 2, 0, 0, 0)} BLACK-ON-BLACK ${R0} ${sgr(48, 2, 255, 255, 255, 38, 2, 255, 255, 255)} WHITE-ON-WHITE ${R0}`,
    `${sgr(48, 5, 244, 38, 5, 244)} 256-SAME-244 ${R0} ${sgr(48, 5, 243, 38, 5, 8)} 256-243/8 ${R0} ${sgr(48, 5, 202, 38, 5, 196)} 256-202/196 ${R0} ${sgr(48, 5, 21, 38, 5, 17)} 256-21/17 ${R0}`
  ])
}

// S5：p10k 风格提示符（powerline 分隔符 U+E0B0 / U+E0B1；本机没有 p10k，按其 rainbow / lean 配色与转义习惯模拟）
{
  const PL = '', PLT = '', RPL = ''
  const seg = (fg, bg, text, nextBg) => `${sgr(38, 5, fg, 48, 5, bg)}${text}${nextBg === null ? `${sgr(0, 38, 5, bg)}${PL}${R0}` : `${sgr(38, 5, bg, 48, 5, nextBg)}${PL}`}`
  const tseg = (fg, bg, text, nextBg) => `${sgr(38, 2, ...fg, 48, 2, ...bg)}${text}${nextBg === null ? `${sgr(0, 38, 2, ...bg)}${PL}${R0}` : `${sgr(38, 2, ...bg, 48, 2, ...nextBg)}${PL}`}`
  write('s5-p10k.ansi', [
    `S5 p10k-style prompts (simulated escape output)`,
    // rainbow（256 色）
    seg(254, 31, '  ~/proj ', 236) + seg(76, 236, '  main ', 178) + seg(0, 178, ' !2 ?1 ', 66) + seg(254, 66, ' 12ms ', null),
    seg(0, 76, ' OK ', 236) + seg(254, 236, ' 2.4s ', 31) + seg(254, 31, ' node 22 ', 24) + seg(255, 24, ' 14:55:01 ', null),
    // rainbow（24 位色，p10k 在 COLORTERM=truecolor 下的写法）
    tseg([230, 230, 230], [0, 95, 135], '  ~/work/app ', [60, 60, 60]) + tseg([0, 175, 0], [60, 60, 60], '  feature/x ', [215, 175, 0]) + tseg([0, 0, 0], [215, 175, 0], ' ⇡1 ⇣2 *3 ', null),
    tseg([255, 255, 255], [175, 0, 0], ' ✘ 130 ', [58, 58, 58]) + tseg([200, 200, 200], [58, 58, 58], ' vpn ', [0, 135, 175]) + tseg([255, 255, 255], [0, 135, 175], ' py 3.12 ', null),
    // lean（只有前景色，24 位）
    `${sgr(38, 2, 95, 175, 255)}~/proj${R0} ${sgr(38, 2, 95, 215, 95)}main${R0} ${sgr(38, 2, 215, 175, 0)}!2 ?1${R0} ${sgr(38, 2, 135, 135, 135)}12ms${R0}`,
    `${sgr(38, 5, 76)}❯${R0} ${sgr(38, 5, 244)}git status${R0}   ${sgr(38, 5, 66)}${RPL}${R0}${sgr(38, 5, 254, 48, 5, 66)} 14:55:01 ${R0}  ${sgr(38, 5, 242)}${PLT}${R0}`
  ])
}

// S6：htop / tmux 风格的状态条（按其默认配色习惯模拟，不是真实程序输出）
{
  const bar = (label, pct, width = 38) => {
    const filled = Math.round((pct / 100) * width)
    return `${sgr(1, 36)}${label}${R0} ${sgr(1, 30)}[${R0}${sgr(32)}${'|'.repeat(Math.round(filled * 0.6))}${R0}${sgr(31)}${'|'.repeat(Math.round(filled * 0.25))}${R0}${sgr(34)}${'|'.repeat(filled - Math.round(filled * 0.6) - Math.round(filled * 0.25))}${R0}${' '.repeat(width - filled)}${sgr(1, 30)}${pct.toFixed(1).padStart(5)}%]${R0}`
  }
  write('s6-bars.ansi', [
    `S6 htop-like and tmux-like bars (simulated escape output)`,
    bar('  1', 34.5), bar('  2', 61.2), bar('  3', 8.7),
    `${sgr(1, 36)}Mem${R0}${sgr(1, 30)}[${R0}${sgr(32)}|||||||||||${R0}${sgr(34)}||${R0}${sgr(33)}||||${R0}${' '.repeat(18)}${sgr(1, 30)}4.2G/16.0G]${R0}`,
    `${sgr(30, 42)}  PID USER      PRI  NI  VIRT   RES   SHR S CPU% MEM%   TIME+  Command             ${R0}`,
    `${sgr(30, 46)}12345 chris      20   0 1234M  567M  89M R 61.2  3.4  1:02.33 node dev-server.js     ${R0}`,
    ` 6789 root       20   0  400M   20M  10M S  0.0  0.1  0:00.12 ${sgr(32)}/usr/sbin/cron${R0}`,
    ` 6790 chris      20   0  300M   10M   9M S  0.0  0.1  0:00.02 ${sgr(1, 31)}zombie-process${R0}`,
    `${sgr(37, 40)}F1${R0}${sgr(30, 46)}Help  ${R0}${sgr(37, 40)}F2${R0}${sgr(30, 46)}Setup ${R0}${sgr(37, 40)}F3${R0}${sgr(30, 46)}Search${R0}${sgr(37, 40)}F4${R0}${sgr(30, 46)}Filter${R0}${sgr(37, 40)}F5${R0}${sgr(30, 46)}Tree  ${R0}${sgr(37, 40)}F9${R0}${sgr(30, 46)}Kill  ${R0}${sgr(37, 40)}F10${R0}${sgr(30, 46)}Quit${R0}`,
    ``,
    `${sgr(38, 5, 0, 48, 5, 2)}[0] 0:zsh* 1:vim- 2:node                                  "host" 14:55 14-Oct-26${R0}`,
    `${sgr(30, 42)}[work] 0:zsh${R0}${sgr(30, 43)} 1:vim! ${R0}${sgr(97, 41)} 2:build ${R0}${sgr(30, 42)}                          14:55${R0}`,
    `${sgr(38, 5, 15, 48, 5, 24)} session-a ${R0}${sgr(38, 5, 24, 48, 5, 238)}${''}${R0}${sgr(38, 5, 250, 48, 5, 238)} 1 zsh  2 vim* ${R0}${sgr(38, 5, 238, 48, 5, 31)}${''}${R0}${sgr(38, 5, 255, 48, 5, 31)} 3 node ${R0}`
  ])
}

// S7：属性与调色板行（回归用）
{
  const names = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
  const fg0 = names.map((n, i) => `${sgr(30 + i)}${n}${R0}`).join(' ')
  const fg1 = names.map((n, i) => `${sgr(90 + i)}b-${n}${R0}`).join(' ')
  const bold = names.map((n, i) => `${sgr(1, 30 + i)}B${n}${R0}`).join(' ')
  const dim = names.map((n, i) => `${sgr(2, 30 + i)}D${n}${R0}`).join(' ')
  write('s7-attrs.ansi', [
    `S7 palette and attributes`,
    `plain default text`,
    fg0, fg1, bold, dim,
    `${sgr(2)}dim default${R0} ${sgr(1)}bold default${R0} ${sgr(3)}italic${R0} ${sgr(4)}underline${R0} ${sgr(9)}strike${R0} ${sgr(53)}overline${R0} ${sgr(7)}reverse${R0} ${sgr(8)}CONCEALED${R0} ${sgr(5)}blink${R0}`,
    `${sgr(7, 30)}rev30${R0} ${sgr(7, 31)}rev31${R0} ${sgr(7, 32)}rev32${R0} ${sgr(7, 33)}rev33${R0} ${sgr(7, 34)}rev34${R0} ${sgr(7, 35)}rev35${R0} ${sgr(7, 36)}rev36${R0} ${sgr(7, 37)}rev37${R0}`,
    `${sgr(7, 90)}rev90${R0} ${sgr(7, 91)}rev91${R0} ${sgr(7, 92)}rev92${R0} ${sgr(7, 93)}rev93${R0} ${sgr(7, 94)}rev94${R0} ${sgr(7, 95)}rev95${R0} ${sgr(7, 96)}rev96${R0} ${sgr(7, 97)}rev97${R0}`
  ])
}
console.log('scenes written to', out)
