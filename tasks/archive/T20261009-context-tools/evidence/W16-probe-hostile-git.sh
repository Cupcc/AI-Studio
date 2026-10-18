#!/bin/bash
# W16: 用服务的完全相同 git 参数（原生 git、清洗环境）观察哪些仓库自带内容会被执行。只在 mktemp 目录工作，结束删除。
set -u
BASE=$(mktemp -d "${TMPDIR:-/tmp}/w16-git-XXXXXX")
cd "$BASE"
git=/usr/bin/git
mkdir home repo bin
G() { env -i PATH=/usr/bin:/bin HOME="$BASE/home" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null LC_ALL=C GIT_OPTIONAL_LOCKS=0 GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat GIT_LITERAL_PATHSPECS=1 "$git" --no-optional-locks -c core.fsmonitor=false -c core.quotepath=false -c color.ui=false -c diff.external= -c core.pager=cat "$@"; }
mk() { printf '#!/bin/sh\necho "%s $*" >> "%s/markers"\nexec cat\n' "$1" "$BASE" > "bin/$1"; chmod +x "bin/$1"; }
mk clean; mk textconv; mk extdiff
printf '#!/bin/sh\necho "fsmonitor $*" >> "%s/markers"\nexit 1\n' "$BASE" > bin/fsmon; chmod +x bin/fsmon
printf '#!/bin/sh\necho "extdiff $*" >> "%s/markers"\nexit 0\n' "$BASE" > bin/extdiff; chmod +x bin/extdiff
cd repo
env -i PATH=/usr/bin:/bin HOME="$BASE/home" "$git" -c init.defaultBranch=main init -q .
echo a > a.txt; echo b > b.txt; echo c > c.dat
printf '*.txt filter=evil\n*.dat diff=evil\n' > .gitattributes
S="env -i PATH=/usr/bin:/bin HOME=$BASE/home GIT_AUTHOR_NAME=a GIT_AUTHOR_EMAIL=a@b.invalid GIT_COMMITTER_NAME=a GIT_COMMITTER_EMAIL=a@b.invalid $git"
$S add -A; $S commit -q -m init
cat >> .git/config <<CFG
[filter "evil"]
	clean = $BASE/bin/clean %f
[core]
	fsmonitor = $BASE/bin/fsmon
[diff]
	external = $BASE/bin/extdiff
[diff "evil"]
	textconv = $BASE/bin/textconv
	command = $BASE/bin/extdiff
CFG
printf '#!/bin/sh\necho "hook-post-index-change $*" >> "%s/markers"\n' "$BASE" > .git/hooks/post-index-change; chmod +x .git/hooks/post-index-change
check() { echo "### $1"; if [ -s "$BASE/markers" ]; then cat "$BASE/markers"; : > "$BASE/markers"; else echo "(nothing ran)"; fi; stat -f 'index mtime %Sm' -t %T .git/index; }
: > "$BASE/markers"
echo "## 0. pristine tree (nothing touched):"
G diff HEAD --no-ext-diff --no-textconv --no-color -M --raw --numstat -z --no-abbrev --relative --ignore-submodules=dirty -- . >/dev/null; check "pristine diff HEAD"
G ls-files -o --exclude-standard -z --no-empty-directory > /dev/null; check "ls-files -o"
G ls-files -u -z >/dev/null; check "ls-files -u"
G rev-parse --is-inside-work-tree --show-prefix >/dev/null; G rev-parse --verify -q --short=9 'HEAD^{commit}' >/dev/null; G symbolic-ref -q --short HEAD >/dev/null; check "rev-parse/symbolic-ref"
sleep 1; touch a.txt b.txt c.dat
echo "## 1. mtime-only touch (no content change) then the snapshot query"
G diff HEAD --no-ext-diff --no-textconv --no-color -M --raw --numstat -z --no-abbrev --relative --ignore-submodules=dirty -- . | tr '\0' '|'; echo; check "after touch diff HEAD (raw+numstat)"
sleep 1; touch a.txt b.txt c.dat
echo "## 2. touch again, patch query for ONE file (unchanged content)"
G diff HEAD --no-ext-diff --no-textconv --no-color -M --patch --unified=3 --src-prefix=a/ --dst-prefix=b/ --submodule=short --relative --ignore-submodules=dirty -- c.dat | head -3; check "after touch diff HEAD -- c.dat (diff=evil driver)"
echo "## 3. real content change in a.txt"
echo changed >> a.txt; echo more >> c.dat
G diff HEAD --no-ext-diff --no-textconv --no-color -M --patch --unified=3 -- a.txt c.dat | head -20 ; check "after content change"
echo "## 4. untracked file, patch via --no-index"
echo u > u.txt; echo v > v.dat
G diff --no-index --no-ext-diff --no-textconv --no-color --patch --unified=3 --src-prefix=a/ --dst-prefix=b/ -- /dev/null u.txt | head -5; check "untracked u.txt --no-index (filter attr)"
G diff --no-index --no-ext-diff --no-textconv --no-color --patch --unified=3 --src-prefix=a/ --dst-prefix=b/ -- /dev/null v.dat | head -5; check "untracked v.dat --no-index (diff driver attr)"
rm -rf "$BASE"
