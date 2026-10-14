import { expect, it } from 'vitest'
import { S } from './strings'

// W5-F11: the quit confirmation must only mention what will actually happen.
it('lists only the consequences that apply to the running work', () => {
  const both = S.quitBody(2, 1, 3)
  expect(both).toContain('2 个活动对话及 3 个未退出终端')
  expect(both).toContain('对话当前一轮将停止，历史保留；终端及其运行的命令将结束。')
  const terminalsOnly = S.quitBody(0, 1, 2)
  expect(terminalsOnly).toContain('2 个未退出终端')
  expect(terminalsOnly).toContain('终端及其运行的命令将结束。')
  expect(terminalsOnly).not.toContain('对话')
  const sessionsOnly = S.quitBody(1, 1, 0)
  expect(sessionsOnly).toContain('1 个活动对话')
  expect(sessionsOnly.endsWith('对话当前一轮将停止，历史保留。')).toBe(true)
  expect(sessionsOnly).not.toContain('终端')
})
