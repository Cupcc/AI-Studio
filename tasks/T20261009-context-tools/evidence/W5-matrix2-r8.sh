#!/bin/zsh
source "$(dirname "$0")/lib.sh"
run() { # run NAME scheme theme colour
  local n=$1; shift
  echo "### $n $(date +%T)"
  setappearance "$@"
  sceneRun $n s1 s1-sweep.ansi sweep
  sceneRun $n s3a s3a-256fg.ansi
  sceneRun $n s4 s4-truecolor.ansi
  realrun $n-bat-monokai 'BAT_CONFIG_PATH=/dev/null bat --color=always --paging=never --theme="Monokai Extended" --style=plain sample.js'
  echo "violations: $(cspv)"
}
for sch in 浅色 深色; do
  case $sch in 浅色) pre=l;; 深色) pre=d;; esac
  run gl-$pre-mint $sch 毛玻璃 薄荷
  run gl-$pre-dusk $sch 毛玻璃 晚霞
  run gl-$pre-mist $sch 毛玻璃 海雾
done
echo "### done $(date +%T)"
