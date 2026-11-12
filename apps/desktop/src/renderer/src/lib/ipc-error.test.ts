import { expect, it } from 'vitest'
import { ipcErrorText } from './ipc-error'

it('drops the Electron IPC wrapper and the error name, keeping plain text as is', () => {
  expect(ipcErrorText(new Error("Error invoking remote method 'session:send': Error: 输入正在提交"))).toBe('输入正在提交')
  expect(ipcErrorText(new Error("Error invoking remote method 'session:send': AdapterError: Only PNG images"))).toBe('Only PNG images')
  expect(ipcErrorText('plain')).toBe('plain')
})
