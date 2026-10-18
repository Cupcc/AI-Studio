#!/bin/zsh
source "$(dirname "$0")/lib.sh"
runcell() { # runcell NAME scheme-radio theme-radio [glass-colour]
  local n=$1; shift
  echo "### cell $n $(date +%T)"
  if [ $# -gt 0 ]; then setappearance "$@"; fi
  cell7 m-$n
  sweeps7 m-$n
  echo "violations: $(cspv)"
}
sweeps7 m-gl-light
runcell gl-light-none 浅色 毛玻璃 无
runcell gl-dark 深色 毛玻璃 极光
runcell gl-dark-none 深色 毛玻璃 无
runcell so-light 浅色 纯色
runcell so-dark 深色 纯色
echo "### done $(date +%T)"
