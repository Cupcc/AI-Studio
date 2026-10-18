# W17 辅助函数（zsh，source 使用）。依赖 scratch 目录里的 env.sh（定义 S / E / R / ROOT / AB）和 $S/ab（agent-browser 包装，先 `tab t1` 固定到应用页面）。
# 绝对路径指向本次会话的 scratch 目录，仅供复现参考。
source /private/tmp/claude-502/-Users-Chris-Projects-AI-Stduio/659c1ec4-bab4-4954-984b-9fc51b0168fb/scratchpad/w17/env.sh
export AB_SESSION=${AB_SESSION:-w17-main}
ab() { "$S/ab" "$@" }
wid() { node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.ROOT+"/fixture-info.json","utf8")).windowId)' }
cap() { screencapture -x -o -l$(wid) "$R/$1.png" && echo "$R/$1.png" }   # 只截应用窗口（窗口 ID）
ctl() { curl -s -X POST "http://127.0.0.1:9418/$1"; echo }
cget() { curl -s "http://127.0.0.1:9418/$1"; echo }
openproj() { # openproj "<目录名>"：登记目录选择器 stub，再点击界面里的「打开本地目录」
  local enc=$(node -e 'console.log(encodeURIComponent(process.env.ROOT+"/projects/"+process.argv[1]))' "$1")
  ctl "next-folder?path=$enc" >/dev/null; ab find role button click --name "打开本地目录" >/dev/null; sleep 1.5 }
newtab() { ab find role button click --name "新建标签页" >/dev/null; sleep 0.8 }
tool() { ab find role button click --name "$1" --exact >/dev/null; sleep ${2:-1.0} }
ev() { ab eval "$1" }
fprobe() { ab eval --stdin < "$E/W17-files-probe.js" | node "$E/W17-pj.mjs" "$@" }
mcap() { # mcap NAME [clipx0,y0,x1,y1]：窗口截图 + Monaco 探针 + 像素对比度，打印摘要
  local n=$1; cap $n >/dev/null; ab eval --stdin < "$E/W17-monaco-probe.js" > "$R/$n.probe.json"
  node "$E/W17-monaco-contrast.mjs" "$R/$n.png" "$R/$n.probe.json" --label $n ${2:+--clip $2} > "$R/$n.contrast.json"
  node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const t=j.tokens;console.log(j.label,JSON.stringify(j.attrs),"tokens n="+(t.all&&t.all.n),"colours="+t.distinctColours,"nominal min/p5/med="+(t.all&&[t.all.min,t.all.p5,t.all.median].join("/")),"<4.5:"+(t.all&&t.all.below4_5),"| ink min="+(t.measuredInk&&t.measuredInk.min),"| diffText n="+j.diffText.n+" min="+j.diffText.min+" <4.5:"+j.diffText.below4_5)' "$R/$n.contrast.json" }
setappearance() { # setappearance 深色|浅色|跟随系统 毛玻璃|纯色 [极光|…]
  ab find role button click --name "设置" --exact >/dev/null; sleep 0.8
  ab find role radio click --name "$1" --exact >/dev/null; sleep 0.4
  ab find role radio click --name "$2" >/dev/null; sleep 0.4
  [ -n "$3" ] && { ab find role radio click --name "$3" --exact >/dev/null; sleep 0.4 }
  ab find role button click --name "关闭设置" --exact >/dev/null; sleep 1.2
  ab eval "JSON.stringify({t:document.documentElement.dataset.theme,s:document.documentElement.dataset.scheme,g:document.documentElement.dataset.glassColor})" }
dprobe() { ab eval --stdin < "$E/W17-diff-probe.js" | node "$E/W17-pj.mjs" "$@" }
drows() { ab eval --stdin < "$E/W17-diff-probe.js" | node -e 'const fs=require("fs");let v=fs.readFileSync(0,"utf8").trim();for(let i=0;i<3&&typeof v==="string";i++){try{v=JSON.parse(v)}catch{break}};if(v.error){console.log(v.error);process.exit()};console.log("TITLE:",v.title,"| META:",v.meta);for(const b of v.banners)console.log("BANNER["+b.cls+"]:",b.text);if(v.stateTitle)console.log("STATE:",v.stateTitle,"::",v.state);for(const r of v.rows)console.log((r.selected==="true"?"*":" ")+(r.tabindex==="0"?"t":" "),r.label);if(v.file)console.log("FILE:",JSON.stringify(v.file));if(v.monaco)console.log("MONACO:",JSON.stringify(v.monaco))' }
