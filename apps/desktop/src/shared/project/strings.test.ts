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

it('names unsaved files and their consequence in the quit and close confirmations (TOOLS-Q13)', () => {
  expect(S.quitBody(0, 1, 0, 2)).toBe('1 个 Project 中有 2 个未保存的文件。不保存的修改将丢失。')
  expect(S.quitBody(1, 2, 1, 1)).toContain('1 个活动对话、1 个未退出终端及 1 个未保存的文件')
  expect(S.closeBody(0, 0, 1)).toBe('1 个文件有未保存的修改，不保存将丢失。')
})
