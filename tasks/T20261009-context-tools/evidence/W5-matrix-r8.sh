#!/bin/zsh
source "$(dirname "$0")/lib.sh"
runcell() { # runcell NAME scheme-radio theme-radio [glass-colour]
  local n=$1; shift
  echo "### cell $n $(date +%T)"
  setappearance "$@"
  cell7 m-$n
  sweeps7 m-$n
  realrun $n-bat-monokai 'BAT_CONFIG_PATH=/dev/null bat --color=always --paging=never --theme="Monokai Extended" --style=plain sample.js'
  realrun $n-bat-github 'BAT_CONFIG_PATH=/dev/null bat --color=always --paging=never --theme=GitHub --style=plain sample.js'
  realrun $n-eza 'eza -l --color=always --color-scale=all --icons=never --git .'
  lessrun $n-less
  vimrun $n-vim
  echo "violations: $(cspv)"
}
runcell gl-light 浅色 毛玻璃 极光
runcell gl-light-none 浅色 毛玻璃 无
runcell gl-dark 深色 毛玻璃 极光
runcell gl-dark-none 深色 毛玻璃 无
runcell so-light 浅色 纯色
runcell so-dark 深色 纯色
echo "### done $(date +%T)"
