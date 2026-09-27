/** 时间与文案格式化工具 */

/** 剩余秒数 → HH:MM:SS */
export function fmtHMS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec))
  const h = String(Math.floor(s / 3600)).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${h}:${m}:${ss}`
}

/** 剩余毫秒 → "x天 HH:MM" 或 "HH:MM:SS"（列表摘要用） */
export function fmtLeft(deadlineTs) {
  const diff = deadlineTs - Date.now()
  if (diff <= 0) return '已截止'
  const day = Math.floor(diff / 86400000)
  if (day >= 1) return `${day} 天 ${String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0')} 小时`
  return fmtHMS(diff / 1000)
}

/** ts → MM.DD */
export function fmtDot(ts) {
  const d = new Date(ts)
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/** ts → YYYY.MM.DD（海报用） */
export function fmtPosterDate(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
