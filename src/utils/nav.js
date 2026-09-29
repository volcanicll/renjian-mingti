/**
 * 导航工具。
 *
 * 防抖按「目标 url」隔离。
 * 旧实现是一个全局 700ms 锁：连点两个不同的 tab 时，第二次会被静默丢掉，
 * 用起来就像底栏卡死了一样。真正要防的只是「双击 push 两个相同页面」，
 * 所以这里只拦同一个目标在窗口内的重复触发，不同目标一律放行。
 */
const DEDUP_MS = 600
const lastAt = {}

function repeat(url) {
  const now = Date.now()
  if (lastAt[url] && now - lastAt[url] < DEDUP_MS) return true
  lastAt[url] = now
  return false
}

export function goNav(url) {
  if (!repeat(url)) uni.navigateTo({ url })
}

export function goRedir(url) {
  if (!repeat(url)) uni.redirectTo({ url })
}

/**
 * 底部 tab 切换。
 *
 * 用 redirectTo 而不是 reLaunch：reLaunch 会先把整个页面栈关掉再重建目标页，
 * 那一瞬间就是用户看到的白板；目标页还会以全新的空 data 重新挂载，
 * 必须等接口回来才有内容。redirectTo 只替换当前这一页，代价小得多，
 * 配合 tab 页的缓存（见 src/store）就能做到「点下去立刻有内容」。
 * 若目标页将来被声明成 tabBar 页（redirectTo 不允许），再退回 reLaunch。
 */
export function goTab(url) {
  if (repeat(url)) return
  uni.redirectTo({
    url,
    fail: () => uni.reLaunch({ url })
  })
}

/** 有上级页则返回，否则兜底回首页 */
export function goBack() {
  if (repeat('__back__')) return
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.reLaunch({ url: '/pages/home/index' })
}
