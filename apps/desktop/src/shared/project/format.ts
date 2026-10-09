// Recent Projects time format (spec §2.1.5 proposal): relative time today,
// a calendar date otherwise.
const MINUTE = 60_000
const HOUR = 60 * MINUTE

export function formatOpenedAt(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const sameDay =
    at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate()
  if (sameDay) {
    const diff = Math.max(0, now.getTime() - at.getTime())
    if (diff < MINUTE) return '刚刚'
    if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
    return `${Math.floor(diff / HOUR)} 小时前`
  }
  const md = `${at.getMonth() + 1}月${at.getDate()}日`
  return at.getFullYear() === now.getFullYear() ? md : `${at.getFullYear()}年${md}`
}
