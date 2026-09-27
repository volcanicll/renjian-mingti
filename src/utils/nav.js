/**
 * 导航防抖：700ms 内重复点击只生效一次，
 * 防止双击导致 push 两个相同页面（navigateTo 栈顶重复）。
 */
let lastTs = 0

function locked() {
  const now = Date.now()
  if (now - lastTs < 700) return true
  lastTs = now
  return false
}

export function goNav(url) {
  if (!locked()) uni.navigateTo({ url })
}

export function goRedir(url) {
  if (!locked()) uni.redirectTo({ url })
}

export function goRelaunch(url) {
  if (!locked()) uni.reLaunch({ url })
}

/** 有上级页则返回，否则兜底回首页 */
export function goBack() {
  if (locked()) return
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/home/index' })
}
