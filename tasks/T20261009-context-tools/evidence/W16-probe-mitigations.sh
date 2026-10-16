#!/bin/bash
# W16: 验证缓解方向：-c core.hooksPath=/dev/null 阻止钩子；GIT_INDEX_FILE 指向索引副本使真实 .git/index 不被改写。
set -u
BASE=$(mktemp -d "${TMPDIR:-/tmp}/w16-fix2-XXXXXX"); cd "$BASE"; mkdir home bin repo
git=/usr/bin/git
BASEENV=(PATH=/usr/bin:/bin HOME="$BASE/home" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_AUTHOR_NAME=a GIT_AUTHOR_EMAIL=a@b.invalid GIT_COMMITTER_NAME=a GIT_COMMITTER_EMAIL=a@b.invalid LC_ALL=C GIT_OPTIONAL_LOCKS=0)
S() { env -i "${BASEENV[@]}" "$git" "$@"; }
cd repo; S -c init.defaultBranch=main init -q .; echo a > a.txt; S add -A; S commit -q -m i
printf '#!/bin/sh\necho "hook" >> "%s/markers"\n' "$BASE" > .git/hooks/post-index-change; chmod +x .git/hooks/post-index-change
: > "$BASE/markers"; sleep 1; touch a.txt
cp .git/index "$BASE/index.copy"; before=$(stat -f %Fm .git/index)
env -i "${BASEENV[@]}" GIT_INDEX_FILE="$BASE/index.copy" "$git" --no-optional-locks -c core.hooksPath=/dev/null diff HEAD --raw -z --relative -- . >/dev/null
after=$(stat -f %Fm .git/index)
echo "real .git/index mtime before=$before after=$after"; echo "hook markers:"; cat "$BASE/markers"
echo "-- control: same without GIT_INDEX_FILE and without hooksPath"
sleep 1; touch a.txt; before=$(stat -f %Fm .git/index)
S --no-optional-locks diff HEAD --raw -z --relative -- . >/dev/null
after=$(stat -f %Fm .git/index); echo "real .git/index mtime before=$before after=$after"; cat "$BASE/markers"
cd /; /bin/rm -rf "$BASE"
