/** Error text without Electron's "Error invoking remote method '…': Error:" wrapper (or the AdapterError name). */
export function ipcErrorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/, '')
}
