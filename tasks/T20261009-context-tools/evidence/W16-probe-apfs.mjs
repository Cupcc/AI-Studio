// W16: 验证 O_NOFOLLOW_ANY 的值与效果（0x20000000），以及 APFS 上 .git 的大小写 / 不可见字符别名行为。
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync, constants, existsSync, readdirSync, openSync, closeSync } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'w16-probe-')))
console.log('tmp base', base.replace(process.env.HOME||'', '~'))
mkdirSync(join(base, '.git')); writeFileSync(join(base, '.git', 'config'), 'x')
// case-insensitivity
console.log('exists .GIT', existsSync(join(base, '.GIT')))
console.log('readdir', readdirSync(base))
// realpath case canonicalisation
console.log('promises.realpath .GIT ->', (await realpath(join(base, '.GIT'))).replace(base,'<b>'))
console.log('native .GIT ->', realpathSync.native(join(base, '.GIT')).replace(base,'<b>'))
// ignorable chars
for (const name of ['.g‌it', '.gi‍t', '.git​', '.git ', '.git.', '.GİT', '.gıt', '.ǵit', '.gıt', '.git\u0000']) {
  try { console.log(JSON.stringify(name), existsSync(join(base, name))) } catch (e) { console.log(JSON.stringify(name), 'ERR', e.code) }
}
// O_NOFOLLOW_ANY
const ANY = 0x20000000
mkdirSync(join(base, 'real')); writeFileSync(join(base, 'real', 'f.txt'), 'hello')
symlinkSync(join(base, 'real'), join(base, 'linkdir'))
for (const [label, p] of [['plain', join(base, 'real', 'f.txt')], ['via symlink dir', join(base, 'linkdir', 'f.txt')]]) {
  for (const [fl, flags] of [['O_NOFOLLOW', constants.O_RDONLY | constants.O_NOFOLLOW], ['O_NOFOLLOW_ANY', constants.O_RDONLY | ANY]]) {
    try { const h = await open(p, flags); await h.close(); console.log(label, fl, 'OPENED') } catch (e) { console.log(label, fl, e.code) }
  }
}
import { rmSync } from 'node:fs'; rmSync(base, { recursive: true, force: true })
