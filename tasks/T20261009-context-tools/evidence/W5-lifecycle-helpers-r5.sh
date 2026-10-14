#!/bin/zsh
# W5 Part 4 复验：本轮实际执行的 Project 关闭 / 应用退出 / Session Stop 脚本函数（由 scratch 脚本合并，仅 zsh -n 检查）。source 后调用。
# 前置：W5-gui-fixture-lifecycle.mjs 已启动（W5_GUI_ROOT 指向临时目录，输出 pid / windowId / controlUrl）；agent-browser 会话已 connect。
# 变量：E（本 evidence 目录）、R（实例根目录，含 fixture-info.json）、AB（agent-browser 原生二进制）、AB_SESSION、W5_CDP_PORT。
E="${W5_EVIDENCE:-$(cd "$(dirname "${(%):-%x}")" && pwd)}"
: ${W5_CDP_PORT:=9390}
info() { node -e 'const i=JSON.parse(require("fs").readFileSync(process.env.R+"/fixture-info.json","utf8"));console.log(i[process.argv[1]])' $1 }
ab() { [ "$1" != connect ] && [ "$1" != close ] && [ "$1" != tab ] && [ -z "$AB_NOPIN" ] && ${=AB} tab t1 >/dev/null 2>&1; AGENT_BROWSER_SESSION=${AB_SESSION:-w5r5-main} ${=AB} "$@" }   # 每次先固定应用页面 target（预览会作为另一个 tab 出现）
typeline() { ab keyboard type "$1" >/dev/null && ab press Enter >/dev/null }
quiet_shell() { typeline " exec zsh -f"; sleep 1.6; typeline "PROMPT='\$ '; unset HISTFILE; clear"; sleep 0.9 }   # 第一行行首空格（HIST_IGNORE_SPACE），之后在无历史 shell
tool() { ab find role button click --name "$1" --exact >/dev/null; sleep ${2:-1.2} }
vrows() { ab eval "(()=>{const s=[...document.querySelectorAll('.xterm-rows')].find(r=>r.getBoundingClientRect().width>0);return s?s.innerText.split('\n').filter(Boolean).join(' | '):'none'})()" }
vstate() { ab eval "(()=>{const w=document.querySelector('.project-workspace:not([hidden])');if(!w)return 'no visible workspace';const e=w.querySelector('.runtime-tool__error');const r=w.querySelector('.xterm-rows');return JSON.stringify({project:(document.querySelector('[role=tab][aria-selected=true]')||{}).textContent,error:e?e.innerText.replace(/\n+/g,' '):null,rows:r?r.innerText.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0,120):null,tabs:[...w.querySelectorAll('[role=tab]')].map(t=>t.textContent+':'+t.getAttribute('aria-selected'))})})()" }
dialogs() { ab eval "JSON.stringify([...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map(d=>d.innerText.replace(/\n+/g,' / ')))" }
shot() { screencapture -x -o -l$W5_WINDOW_ID "$R/$1.window.png" }   # 只截应用窗口自身
snap() { node "$E/W5-proc-tree.mjs" $EPID --out "$R/proc-$1.json" }
alive() { node "$E/W5-proc-alive.mjs" "$R/proc-$1.json" "${@:2}" }
cdp_targets() { curl -s http://127.0.0.1:$W5_CDP_PORT/json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).map(t=>t.type+" "+t.url).join("\n"))}catch(e){console.log("(cdp unreachable)")}})' }
newproj() { [ "$1" != first ] && { ab find role button click --name "新建标签页" >/dev/null; sleep 1 }; ab find role button click --name "打开本地目录" >/dev/null; sleep 2.2 }   # 目录选择器由 fixture stub 依次返回 4 个临时目录
srv() { typeline "node -e 'require(\"http\").createServer((q,r)=>r.end(\"<h1>$1</h1>\")).listen(0,\"127.0.0.1\",function(){console.log(\"SRV \"+process.pid+\" http://127.0.0.1:\"+this.address().port+\"/\")})'"; sleep 1.8; vrows | /usr/bin/grep -o 'SRV [0-9]* http://127.0.0.1:[0-9]*/' | tail -1 }   # 终端里的前台服务
browse() { ab find role textbox fill "$1" --name "本地 Web 地址" >/dev/null; ab press Enter >/dev/null; sleep 2.2 }
longsession() {   # 模拟 Provider：消息含 [e2e:slow] 时回合保持运行直到 Stop（[long] 不会保持运行）
  ab tab t1 >/dev/null 2>&1
  local ref=$(AB_NOPIN=1 ab snapshot -i 2>&1 | /usr/bin/grep '\- button "New Chat"' | head -1 | sed -E 's/.*ref=(e[0-9]+).*/\1/')
  AB_NOPIN=1 ab click @$ref >/dev/null; sleep 1
  ab find role textbox fill "$1" --name "消息" >/dev/null; sleep 0.4
  ab find role button click --name "Send" --exact >/dev/null; sleep 2
}
fullproj() {   # Project + T1（前台 node 服务）+ T2（空闲提示符）+ Browser 预览 + 运行中的 [e2e:slow] Session
  newproj $1; tool Terminal 3; quiet_shell
  local url=$(srv "$2-SERVICE" | tee $R/$2-srv.txt | cut -d' ' -f3)
  ab find role button click --name "新建终端" >/dev/null; sleep 2.5; quiet_shell; typeline "echo $2-T2-IDLE"; sleep 0.6
  tool Browser 1.5; browse "$url"; longsession "[e2e:slow] $2 running turn"; cat $R/$2-srv.txt
}
# 真实应用菜单项：Accessibility 按精确 PID 点击 Quit（不是按键）。主进程里 Menu item.click() 在本机不触发 before-quit（见 W5-review Part 4），故用它。
axquit() { /usr/bin/osascript -e "tell application \"System Events\" to tell (first process whose unix id is $EPID) to click menu item \"Quit AI Developer Studio\" of menu 1 of menu bar item 2 of menu bar 1" 2>&1 | head -2 }
quit_app() { curl -s -X POST $(info controlUrl)/app-quit }   # 对照路径：主进程 app.quit()，与实现者 e2e 相同
