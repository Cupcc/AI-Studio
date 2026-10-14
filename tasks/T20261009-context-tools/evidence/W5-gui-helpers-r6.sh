# sourced helpers for the Part 4 scratch run (zsh)
cd "$(dirname "${(%):-%x}")"; source ./env.sh
info() { node -e 'const i=JSON.parse(require("fs").readFileSync(process.env.R+"/fixture-info.json","utf8"));console.log(i[process.argv[1]])' $1 }
export W5_WINDOW_ID=$(info windowId); export EPID=$(info pid); export CTL=$(info controlUrl); export PREVIEW=$(info previewUrl)
typeline() { ./ab keyboard type "$1" >/dev/null && ./ab press Enter >/dev/null }
quiet_shell() { typeline " exec zsh -f"; sleep 1.6; typeline "PROMPT='\$ '; unset HISTFILE; clear"; sleep 0.9 }
tool() { ./ab find role button click --name "$1" --exact >/dev/null; sleep ${2:-1.2} }
vrows() { ./ab eval "(()=>{const s=[...document.querySelectorAll('.xterm-rows')].find(r=>r.getBoundingClientRect().width>0);return s?s.innerText.split('\n').filter(Boolean).join(' | '):'none'})()" }
shot() { screencapture -x -o -l$W5_WINDOW_ID "$R/$1.window.png" }
snap() { node "$E/W5-proc-tree.mjs" $EPID --out "$R/proc-$1.json" }
alive() { node "$E/W5-proc-alive.mjs" "$R/proc-$1.json" "${@:2}" }
cdp_targets() { curl -s http://127.0.0.1:$W5_CDP_PORT/json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).map(t=>t.type+" "+t.url).join("\n"))}catch(e){console.log("(cdp unreachable)")}})' }
newproj() { # newproj [first]
  if [ "$1" != first ]; then ./ab find role button click --name "新建标签页" >/dev/null; sleep 1; fi
  ./ab find role button click --name "打开本地目录" >/dev/null; sleep 2.2
}
srv() { # srv TAG -> starts a foreground node HTTP server in the current terminal, echoes "pid url"
  typeline "node -e 'require(\"http\").createServer((q,r)=>r.end(\"<h1>$1</h1>\")).listen(0,\"127.0.0.1\",function(){console.log(\"SRV \"+process.pid+\" http://127.0.0.1:\"+this.address().port+\"/\")})'"
  sleep 1.8; vrows | /usr/bin/grep -o 'SRV [0-9]* http://127.0.0.1:[0-9]*/' | tail -1
}
browse() { ./ab find role textbox fill "$1" --name "本地 Web 地址" >/dev/null; ./ab press Enter >/dev/null; sleep 2.2 }
longsession() { # longsession TEXT: New Chat (first button) -> message -> Send; waits for the Stop button
  ./ab tab t1 >/dev/null 2>&1
  local ref=$(AB_NOPIN=1 ./ab snapshot -i 2>&1 | /usr/bin/grep '\- button "New Chat"' | head -1 | sed -E 's/.*ref=(e[0-9]+).*/\1/')
  AB_NOPIN=1 ./ab click @$ref >/dev/null; sleep 1
  ./ab find role textbox fill "$1" --name "消息" >/dev/null; sleep 0.4
  ./ab find role button click --name "Send" --exact >/dev/null; sleep 2
  ./ab eval "JSON.stringify({stop:!![...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Stop'||b.textContent.trim()==='Stop')})"
}
vstate() { ./ab eval "(()=>{const w=document.querySelector('.project-workspace:not([hidden])');if(!w)return 'no visible workspace';const e=w.querySelector('.runtime-tool__error');const r=w.querySelector('.xterm-rows');return JSON.stringify({project:(document.querySelector('[role=tab][aria-selected=true]')||{}).textContent,error:e?e.innerText.replace(/\n+/g,' '):null,rows:r?r.innerText.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0,120):null,tabs:[...w.querySelectorAll('[role=tab]')].map(t=>t.textContent+':'+t.getAttribute('aria-selected'))})})()" }
fullproj() { # fullproj first|next TAG : Project + T1 (foreground server) + T2 (idle) + Browser preview + running [e2e:slow] session
  newproj $1; tool Terminal 3; quiet_shell
  local url=$(srv "$2-SERVICE" | tee $R/$2-srv.txt | cut -d' ' -f3)
  ./ab find role button click --name "新建终端" >/dev/null; sleep 2.5; quiet_shell; typeline "echo $2-T2-IDLE"; sleep 0.6
  tool Browser 1.5; browse "$url"
  longsession "[e2e:slow] $2 running turn" >/dev/null
  cat $R/$2-srv.txt
}
quit_now() { curl -s -X POST $CTL/app-quit; echo; }
axquit() { /usr/bin/osascript -e "tell application \"System Events\" to tell (first process whose unix id is $EPID) to click menu item \"Quit AI Developer Studio\" of menu 1 of menu bar item 2 of menu bar 1" 2>&1 | head -2 }
dialogs() { ./ab eval "JSON.stringify([...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map(d=>d.innerText.replace(/\n+/g,' / ')))" }
ptysize() { ./ab eval "(async()=>{const r=await window.studio.project.listRecent();const open=[...document.querySelectorAll('[role=tab]')].map(t=>t.textContent);const out={};for(const x of r){if(!open.includes(x.project.name))continue;const t=await window.studio.terminal.list({projectId:x.project.id});out[x.project.name]=t.map(s=>[s.title,s.cols+'x'+s.rows])}return JSON.stringify(out)})()" }
cycle() { # cycle N : switch to a launcher tab and back, then type into the terminal and read stty size
  ./ab find role button click --name "新建标签页" >/dev/null; sleep 1.2
  ./ab find role tab click --name "W5 Alpha" >/dev/null; sleep 2.2
  ./ab eval "(()=>{const w=document.querySelector('.project-workspace:not([hidden])');const e=w&&w.querySelector('.runtime-tool__error');return e?'ERROR: '+e.innerText.replace(/\n+/g,' '):'no error'})()"
  typeline "echo CYCLE-$1; stty size"; sleep 0.9
  vrows | /usr/bin/grep -o "CYCLE-$1 | CYCLE-$1 | [0-9]* [0-9]*\|CYCLE-$1 | [0-9]* [0-9]*" | tail -1
}
