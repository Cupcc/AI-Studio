#!/bin/zsh
source ~/.zprofile 2>/dev/null
export PATH="$HOME/ab/node_modules/.bin:$PATH"
OUT="/Volumes/My Shared Files/out"
pkill -if 'electron . --studio-user-data-dir'; for i in {1..20}; do pgrep -if 'electron . --studio-user-data-dir' > /dev/null || break; sleep 1; done
mkdir -p /tmp/probe-project && echo '# probe' > /tmp/probe-project/README.md
cd ~/ai-studio/apps/desktop
STUDIO_E2E_PROVIDERS=1 nohup ./node_modules/.bin/electron . --studio-user-data-dir=/tmp/ud-scenario-a --remote-debugging-port=9341 --inspect=9342 > "$OUT/electron-scenario.log" 2>&1 &!
for i in {1..60}; do curl -sf http://127.0.0.1:9341/json/version > /dev/null && curl -sf http://127.0.0.1:9342/json/list > /dev/null && break; sleep 1; done
node "$OUT/inject-a.mjs"
agent-browser --session sa connect 9341 | tail -1
agent-browser --session sa find role button click --name '打开本地目录' | tail -1
sleep 3
agent-browser --session sa find role textbox fill '虚拟机 a 的并行界面检查' --name '消息' | tail -1
agent-browser --session sa find role button click --name 'Send' | tail -1
sleep 4
agent-browser --session sa screenshot "$OUT/parallel-a.png" | tail -1
agent-browser --session sa snapshot | grep -c '模拟回复已完成'
