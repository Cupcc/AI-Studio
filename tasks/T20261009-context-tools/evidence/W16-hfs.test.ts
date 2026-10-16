// W16 区域 B：HFS+ 卷上的 .git 排除（HFS+ 会忽略部分 Unicode 码点，.g‌it 等名字与 .git 是同一目录）。
// 需要一个已挂载的 HFS+ 卷：`W16_HFS_MOUNT=<挂载点> pnpm exec vitest run --config … W16-hfs`；未设置时整组跳过。
// 准备方式（只在 mktemp 目录里操作）：hdiutil create -size 8m -fs HFS+ -volname W16HFS x.dmg && hdiutil attach x.dmg -nobrowse -mountpoint <dir>
import { mkdirSync, realpathSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createFilesService } from '../../../apps/desktop/src/main/services/files/service'

const mount = process.env.W16_HFS_MOUNT
const run = mount ? describe : describe.skip

run('HFS+：.git 的 Unicode 忽略码点别名', () => {
  it('读取 / 列表 / 引用经别名名字都不能到达 .git 内容', async () => {
    const root = realpathSync.native(join(mount!, 'project'))
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.git', 'config'), '[core]\n\ttoken = HFS-SECRET\n')
    writeFileSync(join(root, 'visible.txt'), 'x')
    const service = createFilesService({ projectRoot: (id) => (id === 'p' ? root : null), changed: () => {}, watchChanged: () => {} })
    try {
      const leaks: string[] = []
      for (const name of ['.GIT', '.g‌it', '.gi‍t', '.‌git', '.g‎it', '.git‬', '.G‌IT']) {
        const read = await service.read({ projectId: 'p', path: `${name}/config` })
        if (JSON.stringify(read).includes('HFS-SECRET')) leaks.push(`read ${JSON.stringify(name)}`)
        const list = await service.list('p', name)
        if (list.status === 'ok') leaks.push(`list ${JSON.stringify(name)}`)
        const refs = await service.resolveReference('p', [`${name}/config`])
        if (refs.status === 'ok') leaks.push(`reference ${JSON.stringify(name)}`)
      }
      const root_list = await service.list('p', '')
      expect(root_list.status).toBe('ok')
      if (root_list.status === 'ok') expect(root_list.entries.map((entry) => entry.name)).toEqual(['visible.txt'])
      expect(leaks).toEqual([])
    } finally { await service.dispose(); rmSync(join(root, '.git'), { recursive: true, force: true }) }
  })
})
