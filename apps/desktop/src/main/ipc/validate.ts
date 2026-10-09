// Small input validators for IPC handlers. Renderer input is untrusted.
import { IpcValidationError } from './registry'

export function noInput(raw: unknown): void {
  if (raw !== undefined) throw new IpcValidationError('Expected no input')
}

export function expectRecord(raw: unknown, what = 'input'): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new IpcValidationError(`Expected ${what} to be an object`)
  }
  const proto = Object.getPrototypeOf(raw)
  if (proto !== Object.prototype && proto !== null) {
    throw new IpcValidationError(`Expected ${what} to be a plain object`)
  }
  return raw as Record<string, unknown>
}

export function expectOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) throw new IpcValidationError(`Unexpected field: ${key}`)
  }
}

export function expectString(
  value: unknown,
  field: string,
  options: { minLength?: number; maxLength: number }
): string {
  if (typeof value !== 'string') throw new IpcValidationError(`${field} must be a string`)
  if (value.length < (options.minLength ?? 0)) throw new IpcValidationError(`${field} is too short`)
  if (value.length > options.maxLength) throw new IpcValidationError(`${field} is too long`)
  return value
}
