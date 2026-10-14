# sourced helpers for the Part 6 scratch run (zsh)
cd "$(dirname "${(%):-%x}")"; source ./env.sh
info() { node -e 'const i=JSON.parse(require("fs").readFileSync(process.env.R+"/fixture-info.json","utf8"));console.log(i[process.argv[1]])' $1 }
export W5_WINDOW_ID=$(info windowId); export EPID=$(info pid); export PREVIEW=$(info url)
typeline() { ./ab keyboard type "$1" >/dev/null && ./ab press Enter >/dev/null }
quiet_shell() { typeline " exec zsh -f"; sleep 1.6; typeline "PROMPT='\$ '; unset HISTFILE; export CLICOLOR_FORCE=1; clear"; sleep 0.9 }
tool() { ./ab find role button click --name "$1" >/dev/null; sleep ${2:-1.2} }
vrows() { ./ab eval "(()=>{const s=[...document.querySelectorAll('.xterm-rows')].find(r=>r.getBoundingClientRect().width>0);return s?s.innerText.split('\n').filter(Boolean).join(' | '):'none'})()" }
shot() { screencapture -x -o -l$W5_WINDOW_ID "$R/$1.window.png" }
csp() { ./ab eval "JSON.stringify({violations:(window.__w5csp||{}).violations||'NOT-INSTALLED',styleSet:((window.__w5csp||{}).styleSetAttribute||[]).length})" }
cspv() { ./ab eval "(()=>{const t=window.__w5csp;if(!t)return 'NOT-INSTALLED';const by={};for(const v of t.violations){const k=v.effective+'|'+(v.file||'')+':'+v.line;by[k]=(by[k]||0)+1}return JSON.stringify({n:t.violations.length,by,styleSet:t.styleSetAttribute.length})})()" }
cap() { # cap NAME : window screenshot + r7 probe + r3 measure
  local n=$1
  screencapture -x -o -l$W5_WINDOW_ID "$R/$n.window.png"
  ./ab eval --stdin < "$E/W5-terminal-probe-r7.js" > "$R/$n.probe.json"
}
catscene() { # catscene FILE : clear and cat a scene file in the terminal
  typeline "clear; cat $1"; sleep ${2:-1.2}
}
sceneRun() { # sceneRun CELL NAME FILE [sweep|plain] : clear+cat, capture, measure; prints a one-line summary
  local cell=$1 n=$2 f=$3 kind=${4:-plain}
  catscene $f 1.4; cap $cell-$n
  node "$E/W5-measure-r7.mjs" "$R/$cell-$n.window.png" "$R/$cell-$n.probe.json" --scene $kind --label $cell-$n > "$R/$cell-$n.measure.json"
  node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const m=j.measured,c=j.nominalCss;console.log(j.label,"pairs="+j.pairs,"measured min/p5/p50="+[m.min,m.p5,m.p50].join("/"),"<4.5:"+m.below4_5,"<3:"+m.below3,"| css min="+(c&&c.min),"<4.5:"+(c&&c.below4_5))' "$R/$cell-$n.measure.json"
}
cmpspans() { node "$E/W5-compare-spans-r7.mjs" "$R/$1.probe.json" "$R/$2.probe.json" }
setappearance() { # setappearance 深色 毛玻璃 [极光|薄荷|晚霞|海雾|无]
  ./ab find role button click --name "设置" >/dev/null; sleep 0.8
  ./ab find role radio click --name "$1" >/dev/null; sleep 0.4
  ./ab find role radio click --name "$2" >/dev/null; sleep 0.4
  [ -n "$3" ] && { ./ab find role radio click --name "$3" --exact >/dev/null; sleep 0.4 }
  ./ab find role button click --name "关闭设置" >/dev/null; sleep 1.2
  ./ab eval "JSON.stringify({t:document.documentElement.dataset.theme,s:document.documentElement.dataset.scheme,g:document.documentElement.dataset.glassColor})"
}
msr() { # msr NAME [sweep|plain] : measure an existing capture
  node "$E/W5-measure-r7.mjs" "$R/$1.window.png" "$R/$1.probe.json" --scene ${2:-plain} --label $1 > "$R/$1.measure.json"
  node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const m=j.measured,c=j.nominalCss,d=j.defaultBgColoured;console.log(j.label,"scheme="+j.scheme,"pairs="+j.pairs,"measured min/p50="+[m&&m.min,m&&m.p50].join("/"),"<4.5:"+(m&&m.below4_5),"| css min="+(c&&c.min),"<4.5:"+(c&&c.below4_5),"| defaultBg nominal min="+(d&&d.nominalVsPixelBg&&d.nominalVsPixelBg.min),"measured min="+(d&&d.measured&&d.measured.min))' "$R/$1.measure.json"
}
scene7() { # same scene as W5-theme-helpers-r4.sh (plain text, ANSI 0-15, bold, reverse, ls colours)
  typeline "clear"; sleep 0.6
  typeline "printf 'plain text line one: the quick brown fox 0123456789\\n'"; sleep 0.4
  typeline 'for i in 0 1 2 3 4 5 6 7; do printf "\e[3%smANSI-%s\e[0m " $i $i; done; echo'; sleep 0.4
  typeline 'for i in 0 1 2 3 4 5 6 7; do printf "\e[9%smANSI-%s\e[0m " $i $((i+8)); done; echo'; sleep 0.4
  typeline 'for i in 0 1 2 3 4 5 6 7; do printf "\e[1;3%smBOLD-%s\e[0m " $i $i; done; echo'; sleep 0.4
  typeline 'printf "\e[7mREV-DEFAULT\e[0m \e[7;31mREV-RED\e[0m \e[7;32mREV-GREEN\e[0m \e[1;37;41mWHITE-ON-RED\e[0m \e[30;47mBLACK-ON-WHITE\e[0m\n"'; sleep 0.4
  typeline "ls -lGg"; sleep 0.8
}
msr3() { node "$E/W5-measure-r3.mjs" "$R/$1.window.png" "$R/$1.probe.json" --label $1 > "$R/$1.measure3.json" }
cell7() { # cell7 NAME : regression scene (plain/ANSI/bold/reverse/selection/inactive/scroll) in the current appearance
  local n=$1
  scene7; ./ab mouse move 1100 650 >/dev/null; sleep 0.3; cap $n; msr3 $n
  local sx sy ex; read sx sy ex <<< $(node -e 'const p=JSON.parse(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")));const r=p.rows.find(r=>r.text.startsWith("plain text line one: the quick"));console.log(Math.round(r.box.x+2),Math.round(r.box.y+r.box.h/2),Math.round(r.box.x+300))' $R/$n.probe.json)
  ./ab mouse move $sx $sy >/dev/null; ./ab mouse down >/dev/null; ./ab mouse move $ex $sy >/dev/null; ./ab mouse up >/dev/null; sleep 0.5; cap $n-sel; msr3 $n-sel
  ./ab find role textbox click --name "消息" >/dev/null; sleep 0.6; ./ab mouse move 1100 650 >/dev/null; sleep 0.2; cap $n-inactive; msr3 $n-inactive
  ./ab mouse move 1100 700 >/dev/null; ./ab mouse down >/dev/null; ./ab mouse up >/dev/null; sleep 0.4
  typeline 'for i in {1..150}; do echo "scroll line $i: lorem ipsum dolor sit amet 0123456789"; done'; sleep 1.5
  node "$E/W5-cdp-wheel.mjs" $W5_CDP_PORT 900 300 -900; sleep 0.8; ./ab mouse move 1100 650 >/dev/null; sleep 0.3; cap $n-scroll; msr3 $n-scroll
}
sweeps7() { # sweeps7 CELL : colour scenes S1..S7
  local c=$1
  sceneRun $c s1 s1-sweep.ansi sweep; sceneRun $c s2 s2-cases.ansi; sceneRun $c s3a s3a-256fg.ansi; sceneRun $c s3b s3b-256bg.ansi; sceneRun $c s4 s4-truecolor.ansi; sceneRun $c s5 s5-p10k.ansi; sceneRun $c s6 s6-bars.ansi; sceneRun $c s7 s7-attrs.ansi
}
realrun() { # realrun NAME 'command' : clear, run a real program, capture + measure
  typeline "clear; $2"; sleep ${3:-2}
  cap real-$1; node "$E/W5-measure-r7.mjs" "$R/real-$1.window.png" "$R/real-$1.probe.json" --scene plain --label real-$1 > "$R/real-$1.measure.json"
  node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const f=x=>x?`min ${x.min} p50 ${x.p50} n${x.n} <4.5:${x.below4_5}`:"-";const e=j.explicitBg,d=j.defaultBgColoured;console.log(j.label,"| explicitBg css:",f(e&&e.nominalCss),"px:",f(e&&e.measured),"| defaultBg coloured nomPx:",f(d&&d.nominalVsPixelBg),"px:",f(d&&d.measured))' "$R/real-$1.measure.json"
}
browse() { ./ab find role textbox fill "$1" --name "本地 Web 地址" >/dev/null; ./ab press Enter >/dev/null; sleep 2.2 }
pab() { AGENT_BROWSER_SESSION=w5r7-prev /Users/Chris/.npm/_npx/6de2aa2fded2970c/node_modules/agent-browser/bin/agent-browser-darwin-arm64 "$@" }
