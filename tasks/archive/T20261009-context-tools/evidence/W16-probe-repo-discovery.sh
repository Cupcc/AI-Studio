#!/bin/bash
# W16: 仓库发现行为（构造的 HEAD 树、.git 文件 / 符号链接指向外部、core.worktree、裸仓库）。用服务的 git 全局参数，在 mktemp 目录里操作。
set -u
BASE=$(mktemp -d "${TMPDIR:-/tmp}/w16-g4-XXXXXX"); cd "$BASE"; mkdir home
git=/usr/bin/git
E=(env -i PATH=/usr/bin:/bin HOME="$BASE/home" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_AUTHOR_NAME=a GIT_AUTHOR_EMAIL=a@b.invalid GIT_COMMITTER_NAME=a GIT_COMMITTER_EMAIL=a@b.invalid LC_ALL=C)
G() { "${E[@]}" "$git" --no-optional-locks -c core.fsmonitor=false -c core.quotepath=false -c color.ui=false -c diff.external= -c core.pager=cat "$@"; }
S() { "${E[@]}" "$git" "$@"; }
echo "### 1. crafted HEAD tree with .git/config entry"
mkdir r1; cd r1; S -c init.defaultBranch=main init -q .
echo secret-token-in-config >> .git/config
echo hi > a.txt; S add a.txt
blob=$(echo fake | S hash-object -w --stdin)
t1=$(printf '100644 blob %s\tconfig\n' "$blob" | S mktree)
ablob=$(S rev-parse :a.txt)
t2=$(printf '100644 blob %s\ta.txt\n040000 tree %s\t.git\n' "$ablob" "$t1" | S mktree)
c=$(S commit-tree "$t2" -m crafted)
S update-ref refs/heads/main "$c"
S reset -q --mixed HEAD 2>&1 | head -3
echo "diff HEAD raw:"; G diff HEAD --no-ext-diff --no-textconv --raw --numstat -z --relative --ignore-submodules=dirty -- . 2>&1 | tr '\0' '|'; echo
cd "$BASE"
echo "### 2. .git FILE pointing outside"
mkdir other-repo; (cd other-repo; S -c init.defaultBranch=main init -q .; echo ONLY-IN-OTHER > other.txt; S add -A; S commit -q -m o; echo changed >> other.txt)
mkdir r2; echo 'gitdir: ../other-repo/.git' > r2/.git; echo p > r2/proj.txt
cd r2; echo "inside-work-tree/prefix:"; G rev-parse --is-inside-work-tree --show-prefix 2>&1; echo "diff:"; G diff HEAD --raw --numstat -z --relative -- . 2>&1 | tr '\0' '|'; echo; G ls-files -o --exclude-standard -z | tr '\0' '|'; echo
cd "$BASE"
echo "### 3. core.worktree outside"
mkdir wt-target; echo W > wt-target/w.txt
mkdir r3; (cd r3; S -c init.defaultBranch=main init -q .; echo a > a.txt; S add -A; S commit -q -m i; S config core.worktree "$BASE/wt-target")
cd r3; G rev-parse --is-inside-work-tree --show-prefix 2>&1; G diff HEAD --raw -z --relative -- . 2>&1 | tr '\0' '|'; echo
cd "$BASE"
echo "### 4. bare repo as project / inside .git"
S -c init.defaultBranch=main init -q --bare bare.git; cd bare.git; G rev-parse --is-inside-work-tree --show-prefix 2>&1; cd "$BASE/r1/.git"; G rev-parse --is-inside-work-tree --show-prefix 2>&1; cd "$BASE"
echo "### 5. .git symlink to other repo"
mkdir r5; ln -s ../other-repo/.git r5/.git; cd r5; G rev-parse --is-inside-work-tree --show-prefix 2>&1; G diff HEAD --raw -z --relative -- . 2>&1 | tr '\0' '|'; echo; cd "$BASE"
cd "$BASE"; /bin/rm -rf "$BASE"
