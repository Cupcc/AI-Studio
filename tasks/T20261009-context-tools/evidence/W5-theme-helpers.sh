#!/bin/zsh
# W5 Part 1 复验：F3 修复后可复跑同一矩阵的辅助函数（zsh）。用法：source 本文件后按函数调用。
# 前置：node tasks/T20261009-context-tools/evidence/W5-gui-fixture-theme.mjs 已启动（W5_GUI_ROOT 指向临时目录，输出 windowId / cdpPort）；
#       agent-browser 会话已 `connect <cdpPort>` 到应用页面 target（首个 t1）。
# 变量：W5_SCRATCH 临时输出目录；W5_WINDOW_ID 来自 fixture 输出的 windowId；W5_CDP_PORT 默认 9386。
E="${W5_EVIDENCE:-$(cd "$(dirname "${(%):-%x}")" && pwd)}"
: ${W5_CDP_PORT:=9386}
ab() { AGENT_BROWSER_SESSION=${AB_SESSION:-w5r-main} npx --yes agent-browser "$@"; }

# 向当前聚焦的 xterm 输入一行并回车（真实按键，经 agent-browser）
typeline() { ab keyboard type "$1" >/dev/null && ab press Enter >/dev/null; }

# 用无 rc / 无历史的 shell，避免写入用户 ~/.zsh_history（行首空格 + zsh -f）
quiet_shell() { typeline " exec zsh -f"; sleep 1; typeline "PROMPT='\$ '; unset HISTFILE; export CLICOLOR_FORCE=1; clear"; sleep 0.8 }

# 标准场景：普通文字、ANSI 颜色 / 反显 / 粗体、ls 颜色（需先在项目目录里 mkdir alpha beta; touch a.txt b.sh notes.md; chmod +x b.sh; ln -sf a.txt link-to-a）
scene() {
  typeline "clear"; sleep 0.6
  typeline "printf 'plain text line one: the quick brown fox 0123456789\\n'"; sleep 0.4
  typeline "printf '\\e[31mRED\\e[0m \\e[1;32mBOLD GREEN\\e[0m \\e[7mREV\\e[0m \\e[34mBLUE\\e[0m \\e[33mYELLOW\\e[0m \\e[90mBRIGHT-BLACK\\e[0m \\e[36mCYAN\\e[0m \\e[1;37;41mWHITE-ON-RED\\e[0m\\n'"; sleep 0.4
  typeline "ls -lGg"; sleep 0.8
}

# 长输出 + 在 (900,300) 处合成滚轮（agent-browser 0.39.0 的 mouse wheel 固定投递在 (0,0)，故用 W5-cdp-wheel.mjs）
longout() {
  typeline 'for i in {1..150}; do echo "scroll line $i: lorem ipsum dolor sit amet 0123456789"; done'; sleep 1.5
  node "$E/W5-cdp-wheel.mjs" $W5_CDP_PORT 900 300 -900; sleep 0.8
}

# 在设置弹层中切换外观（标签为 UI 文案）：setappearance 深色 毛玻璃 [极光|薄荷|晚霞|海雾|无]；模式可选 跟随系统 / 浅色 / 深色，主题 毛玻璃 / 纯色
setappearance() {
  ab find role button click --name "设置" >/dev/null; sleep 0.8
  ab find role radio click --name "$1" >/dev/null; sleep 0.4
  ab find role radio click --name "$2" >/dev/null; sleep 0.4
  [ -n "$3" ] && { ab find role radio click --name "$3" --exact >/dev/null; sleep 0.4 }
  ab find role button click --name "关闭设置" >/dev/null; sleep 1
}

# 抓取并测量：只截应用窗口自身（-l<windowId>），再读 DOM（W5-terminal-probe.js），输出 <name>.{window.png,probe.json,measure.json}
cap() {
  local n=$1 d=${W5_SCRATCH:?set W5_SCRATCH}
  screencapture -x -o -l${W5_WINDOW_ID:?set W5_WINDOW_ID} "$d/$n.window.png"
  ab eval --stdin < "$E/W5-terminal-probe.js" > "$d/$n.probe.json"
  node "$E/W5-measure.mjs" "$d/$n.window.png" "$d/$n.probe.json" --label $n > "$d/$n.measure.json"
  node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify({label:m.label,attrs:m.attrs,rowContrast:m.rowContrastMeasured,rowWorstBg:m.rowContrastWorstBg,empty:m.empty.meanLum,strip:m.strip.meanLum,cursor:m.cursor&&m.cursor.background,applied:m.styleElementsApplied}))' "$d/$n.measure.json"
}
# 注意：每张保留为证据的截图在复制进 evidence/ 前必须逐张查看；多 Project 打开时 probe 取第一个 .terminal-screen，可能是被隐藏的 Project。
