#!/bin/zsh
# native agent-browser; always re-pin the app page target (t1) first because the preview target appears as another tab
BIN=/Users/Chris/.npm/_npx/6de2aa2fded2970c/node_modules/agent-browser/bin/agent-browser-darwin-arm64
export AGENT_BROWSER_SESSION=${AB_SESSION:-w5r6-main}
if [ "$1" != "connect" ] && [ "$1" != "close" ] && [ "$1" != "tab" ] && [ -z "$AB_NOPIN" ]; then $BIN tab t1 >/dev/null 2>&1; fi
exec $BIN "$@"
