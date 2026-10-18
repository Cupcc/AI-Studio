#!/bin/zsh
# W5 Part 3 复验：本轮实际执行的矩阵脚本（由 scratch 脚本合并而来）。source 后调用函数。
# 前置：W5-gui-fixture-theme.mjs 已启动（W5_GUI_CDP_PORT=9388）；agent-browser 会话已 connect；只开一个 Project；
#       connect 之后立刻安装 W5-csp-trace-r3.js；需要首个终端时间线时在点击 Terminal 前安装 W5-first-fit-sampler-r4.js。
# 变量：W5_SCRATCH 输出目录；W5_WINDOW_ID；W5_CDP_PORT（默认 9388）；AB（agent-browser 命令，默认 npx --yes agent-browser）。
E="${W5_EVIDENCE:-$(cd "$(dirname "${(%):-%x}")" && pwd)}"
: ${W5_CDP_PORT:=9388}
ab() { AGENT_BROWSER_SESSION=${AB_SESSION:-w5r4-main} ${=AB:-npx --yes agent-browser} "$@" }
typeline() { ab keyboard type "$1" >/dev/null && ab press Enter >/dev/null }

# 第一行必须以空格开头（用户 zsh 有 HIST_IGNORE_SPACE），随后在无 rc / 无历史的 shell 里操作，不写 ~/.zsh_history
quiet_shell() {
  typeline " exec zsh -f"; sleep 1.5
  typeline "PROMPT='\$ '; unset HISTFILE; export CLICOLOR_FORCE=1; mkdir -p alpha beta; touch a.txt b.sh notes.md; chmod +x b.sh; ln -sf a.txt link-to-a; clear; stty size"; sleep 1.2
}
winch_trap() { typeline "trap 'print -r -- WINCH \$(stty size)' WINCH"; }   # 近似统计 PTY 实际尺寸变化（IPC 调用次数页面内不可见：window.studio 已冻结）

scene() {
  typeline "clear"; sleep 0.6
  typeline "printf 'plain text line one: the quick brown fox 0123456789\\n'"; sleep 0.4
  typeline 'for i in 0 1 2 3 4 5 6 7; do printf "\e[3%smANSI-%s\e[0m " $i $i; done; echo'; sleep 0.4
  typeline 'for i in 0 1 2 3 4 5 6 7; do printf "\e[9%smANSI-%s\e[0m " $i $((i+8)); done; echo'; sleep 0.4
  typeline 'for i in 0 1 2 3 4 5 6 7; do printf "\e[1;3%smBOLD-%s\e[0m " $i $i; done; echo'; sleep 0.4
  typeline 'printf "\e[7mREV-DEFAULT\e[0m \e[7;31mREV-RED\e[0m \e[7;32mREV-GREEN\e[0m \e[1;37;41mWHITE-ON-RED\e[0m \e[30;47mBLACK-ON-WHITE\e[0m\n"'; sleep 0.4
  typeline "ls -lGg"; sleep 0.8
}
bgscene() {   # 彩色背景组合（W5-F9）
  typeline 'clear; printf "\e[41mDEF-ON-RED\e[0m \e[42mDEF-ON-GREEN\e[0m \e[44;97mBRWHITE-ON-BLUE\e[0m \e[43;30mBLACK-ON-YELLOW\e[0m \e[42;30mBLACK-ON-GREEN\e[0m \e[46;30mBLACK-ON-CYAN\e[0m \e[100mDEF-ON-BRBLACK\e[0m \e[47mDEF-ON-WHITE\e[0m \e[41;37mWHITE-ON-RED2\e[0m\n"'; sleep 1
}
fill() { typeline 'clear; for i in {1..60}; do echo "fill line $i"; done; stty size'; sleep 1.6 }
longout() {
  typeline 'for i in {1..150}; do echo "scroll line $i: lorem ipsum dolor sit amet 0123456789"; done'; sleep 1.5
  node "$E/W5-cdp-wheel.mjs" $W5_CDP_PORT 900 300 -900; sleep 0.8
}
setappearance() {   # setappearance 深色 毛玻璃 [极光|薄荷|晚霞|海雾|无]
  ab find role button click --name "设置" >/dev/null; sleep 0.8
  ab find role radio click --name "$1" >/dev/null; sleep 0.4
  ab find role radio click --name "$2" >/dev/null; sleep 0.4
  [ -n "$3" ] && { ab find role radio click --name "$3" --exact >/dev/null; sleep 0.4 }
  ab find role button click --name "关闭设置" >/dev/null; sleep 1
}
cap() {   # 窗口截图（只截应用自身）+ DOM probe + 测量
  local n=$1 d=${W5_SCRATCH:?}
  screencapture -x -o -l${W5_WINDOW_ID:?} "$d/$n.window.png"
  ab eval --stdin < "$E/W5-terminal-probe-r4.js" > "$d/$n.probe.json"
  node "$E/W5-measure-r3.mjs" "$d/$n.window.png" "$d/$n.probe.json" --label $n > "$d/$n.measure.json"
}
cell() {  # scene -> cap -> 选区 -> cap -> 失焦（点聊天输入框）-> cap（非活动选区）-> 长输出滚动 -> cap
  local n=$1 d=${W5_SCRATCH:?}
  scene; ab mouse move 1100 650 >/dev/null; sleep 0.3; cap $n
  local sx sy ex; read sx sy ex <<< $(node -e 'const p=JSON.parse(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")));const r=p.rows.find(r=>r.text.startsWith("plain text line one: the quick"));console.log(Math.round(r.box.x+2),Math.round(r.box.y+r.box.h/2),Math.round(r.box.x+300))' $d/$n.probe.json)
  ab mouse move $sx $sy >/dev/null; ab mouse down >/dev/null; ab mouse move $ex $sy >/dev/null; ab mouse up >/dev/null; sleep 0.5; cap $n-sel
  ab find role textbox click --name "消息" >/dev/null; sleep 0.6; ab mouse move 1100 650 >/dev/null; sleep 0.2; cap $n-inactive
  ab mouse move 1100 700 >/dev/null; ab mouse down >/dev/null; ab mouse up >/dev/null; sleep 0.4   # 点击终端：清选区并重新聚焦
  longout; ab mouse move 1100 650 >/dev/null; sleep 0.3; cap $n-scroll
}
geometry() { ab eval --stdin < "$E/W5-terminal-geometry-r3.js" }
live_state() { ab eval --stdin < "$E/W5-live-state-r4.js" }   # 外观切换前后比较行文本 / 光标 / 拇指几何 / computed 颜色
cursor_timeline() { local out=""; for i in $(seq 1 ${1:-40}); do out="$out$(ab eval "(()=>{const c=document.querySelector('.xterm-cursor');return c?(c.className.includes('blink')?'B':'1'):'0'})()" | tr -d '"')"; sleep 0.12; done; echo $out }
# 注意：不要用 Shift+End / Shift+Home 滚动（xterm 会把 CSI 1;2F 转发给 shell）；Shift+PageUp / Shift+PageDown 由 xterm 自己滚动。
