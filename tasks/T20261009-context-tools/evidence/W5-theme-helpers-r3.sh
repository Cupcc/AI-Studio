#!/bin/zsh
# W5 Part 2 复验：本轮实际执行的矩阵脚本（由 scratch 脚本合并而来）。source 后调用函数。
# 前置：W5-gui-fixture-theme.mjs 已启动（输出 windowId / cdpPort）；agent-browser 会话已 connect；应用只开一个 Project。
# 变量：W5_SCRATCH 输出目录；W5_WINDOW_ID；W5_CDP_PORT（默认 9387）；AB（agent-browser 命令，默认 npx --yes agent-browser）。
E="${W5_EVIDENCE:-$(cd "$(dirname "${(%):-%x}")" && pwd)}"
: ${W5_CDP_PORT:=9387}
ab() { AGENT_BROWSER_SESSION=${AB_SESSION:-w5r3-main} ${=AB:-npx --yes agent-browser} "$@" }
typeline() { ab keyboard type "$1" >/dev/null && ab press Enter >/dev/null }

# 打开 Terminal 后的第一行必须以空格开头（用户 zsh 配置了 HIST_IGNORE_SPACE），切到无 rc / 无历史的 shell，避免写入 ~/.zsh_history
quiet_shell() {
  typeline " exec zsh -f"; sleep 1.2
  typeline "PROMPT='\$ '; unset HISTFILE; export CLICOLOR_FORCE=1; mkdir -p alpha beta; touch a.txt b.sh notes.md; chmod +x b.sh; ln -sf a.txt link-to-a; clear"; sleep 1.2
}

# 标准场景：普通文字、ANSI 0-15 普通 / 亮 / 粗体、反显、ls 颜色
scene() {
  typeline "clear"; sleep 0.6
  typeline "printf 'plain text line one: the quick brown fox 0123456789\\n'"; sleep 0.4
  typeline 'for i in 0 1 2 3 4 5 6 7; do printf "\e[3%smANSI-%s\e[0m " $i $i; done; echo'; sleep 0.4
  typeline 'for i in 0 1 2 3 4 5 6 7; do printf "\e[9%smANSI-%s\e[0m " $i $((i+8)); done; echo'; sleep 0.4
  typeline 'for i in 0 1 2 3 4 5 6 7; do printf "\e[1;3%smBOLD-%s\e[0m " $i $i; done; echo'; sleep 0.4
  typeline 'printf "\e[7mREV-DEFAULT\e[0m \e[7;31mREV-RED\e[0m \e[7;32mREV-GREEN\e[0m \e[1;37;41mWHITE-ON-RED\e[0m \e[30;47mBLACK-ON-WHITE\e[0m\n"'; sleep 0.4
  typeline "ls -lGg"; sleep 0.8
}
truecolor_scene() {
  typeline 'clear; printf "\e[38;2;255;0;0mRGB-FG-RED\e[0m \e[38;2;0;160;0mRGB-FG-GREEN\e[0m \e[38;2;0;0;255mRGB-FG-BLUE\e[0m \e[38;5;208mIDX-208-ORANGE\e[0m\n"; printf "\e[48;2;0;128;0m\e[38;2;255;255;255m RGB-BG-GREEN white-on-green \e[0m \e[48;5;22m\e[38;5;231m IDX-BG-22 white-on-dark-green \e[0m\n"; printf "\e[48;2;255;220;0m\e[38;2;0;0;0m RGB-BG-YELLOW black-on-yellow \e[0m\n"'
}
fill() { typeline 'clear; for i in {1..60}; do echo "fill line $i"; done'; sleep 1.5 }
longout() {
  typeline 'for i in {1..150}; do echo "scroll line $i: lorem ipsum dolor sit amet 0123456789"; done'; sleep 1.5
  node "$E/W5-cdp-wheel.mjs" $W5_CDP_PORT 900 300 -900; sleep 0.8   # agent-browser 的 mouse wheel 固定在 (0,0)
}
setappearance() {   # setappearance 深色 毛玻璃 [极光|薄荷|晚霞|海雾|无]
  ab find role button click --name "设置" >/dev/null; sleep 0.8
  ab find role radio click --name "$1" >/dev/null; sleep 0.4
  ab find role radio click --name "$2" >/dev/null; sleep 0.4
  [ -n "$3" ] && { ab find role radio click --name "$3" --exact >/dev/null; sleep 0.4 }
  ab find role button click --name "关闭设置" >/dev/null; sleep 1
}
cap() {   # cap <name>：窗口截图（只截应用自身）+ DOM probe + 测量
  local n=$1 d=${W5_SCRATCH:?}
  screencapture -x -o -l${W5_WINDOW_ID:?} "$d/$n.window.png"
  ab eval --stdin < "$E/W5-terminal-probe-r3.js" > "$d/$n.probe.json"
  node "$E/W5-measure-r3.mjs" "$d/$n.window.png" "$d/$n.probe.json" --label $n > "$d/$n.measure.json"
}
cell() {  # cell <name>：scene -> cap -> 选区拖选 -> cap -> 光标多帧 -> 长输出滚动 -> cap（外观需已设置）
  local n=$1 d=${W5_SCRATCH:?}
  scene; ab mouse move 1100 650 >/dev/null; sleep 0.3; cap $n
  local sx sy ex; read sx sy ex <<< $(node -e 'const p=JSON.parse(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")));const r=p.rows.find(r=>r.text.startsWith("plain text line one: the quick"));console.log(Math.round(r.box.x+2),Math.round(r.box.y+r.box.h/2),Math.round(r.box.x+300))' $d/$n.probe.json)
  ab mouse move $sx $sy >/dev/null; ab mouse down >/dev/null; ab mouse move $ex $sy >/dev/null; ab mouse up >/dev/null; sleep 0.5; cap $n-sel
  ab mouse move 1100 700 >/dev/null; ab mouse down >/dev/null; ab mouse up >/dev/null; sleep 0.4   # 点击清除选区
  longout; ab mouse move 1100 650 >/dev/null; sleep 0.3; cap $n-scroll
}
# 光标是否闪烁：在底部时轮询 .xterm-cursor 是否存在 / 是否带 blink 类（1=存在，0=不存在，B=带 blink 类）
cursor_timeline() { local out=""; for i in $(seq 1 ${1:-40}); do out="$out$(ab eval "(()=>{const c=document.querySelector('.xterm-cursor');return c?(c.className.includes('blink')?'B':'1'):'0'})()" | tr -d '"')"; sleep 0.15; done; echo $out }
geometry() { ab eval --stdin < "$E/W5-terminal-geometry-r3.js" }
# 注意：不要用 Shift+End / Shift+Home 滚动：xterm 会把 CSI 1;2F 转发给 shell（实测在提示符处出现 ";2F" 字符）。
