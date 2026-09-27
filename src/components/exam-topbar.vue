<template>
  <view class="tb-wrap" :style="wrapStyle">
    <view class="tb-row" :style="rowStyle">
      <view class="tb-inner"><slot /></view>
    </view>
  </view>
</template>

<script>
/**
 * 自定义导航栏容器 —— 把微信胶囊当作一块"禁入矩形"，横纵都让开。
 *
 * 横：padding-right = 屏幕宽 - 胶囊左缘 + CAPSULE_GAP，插槽内容永不到胶囊底下；
 * 纵：内容行 min-height = 胶囊高度，且与胶囊垂直居中；
 *     行底再留 HEAD_GAP，保证导航栏底部分割线永远落在胶囊下沿之外。
 *
 * 为什么纵向必须按胶囊来算：
 *   胶囊是固定在 statusBarHeight+4 起的 87×32pt 原生控件，位置不随页面变；
 *   而导航栏高度过去是"内容撑开"（首页 brand 40rpx、局内是返回键 + meta），
 *   内容一矮，底部分割线就落进胶囊的纵向区间里 —— 表现为胶囊盖住头部右下角，
 *   而且每页都这样（首页 83.6pt 侥幸躲过，结算/揭晓墙 81.3pt 贴住，局内 76.2pt 被吃掉 90pt 宽）。
 *   现在把三页的导航栏高度统一锁死为 capTop + 32 + HEAD_GAP，
 *   分割线稳定落在胶囊下沿 10px 之外。
 *
 * 拿不到胶囊位置时按微信标准值兜底（87 宽 / 32 高 / 右边距 7 / 状态栏下 4）。
 */
const CAPSULE_GAP = 16 // 内容右缘与胶囊左缘的最小间距(px)
const HEAD_GAP = 10 // 分割线与胶囊下沿的最小间距(px)

const STD_W = 87
const STD_H = 32
const STD_RIGHT = 7
const STD_TOP_OFFSET = 4

function measure() {
  let winW = 375
  let rawSb = 0
  try {
    // getWindowInfo 是新版 API（getSystemInfoSync 在部分基础库已不推荐）
    const info = (uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()) || {}
    if (info.windowWidth) winW = info.windowWidth
    if (info.statusBarHeight && info.statusBarHeight >= 20) rawSb = Math.round(info.statusBarHeight)
  } catch (e) { /* 取不到就用兜底值 */ }
  const hasSb = rawSb > 0

  let capTop = 0
  let capH = STD_H
  let padRight = 16

  // #ifdef MP-WEIXIN
  // 微信端：读不到状态栏时按 44 兜底（覆盖绝大多数刘海/灵动岛机型 —— 宁多留、不遮挡）
  const sbWx = hasSb ? rawSb : 44
  capTop = sbWx + STD_TOP_OFFSET
  padRight = STD_W + STD_RIGHT + CAPSULE_GAP
  try {
    const r = uni.getMenuButtonBoundingClientRect()
    // 真机偶发返回全 0 或离谱值：校验通过才采用
    const ok =
      r &&
      r.width > 0 &&
      r.height >= 24 &&
      r.left > 0 &&
      r.left < winW &&
      r.top >= sbWx - 8 &&
      r.top <= sbWx + 24
    if (ok) {
      capTop = r.top
      capH = r.height
      padRight = Math.round(winW - r.left) + CAPSULE_GAP
    }
  } catch (e) { /* 拿不到胶囊位置：用上面的保守值 */ }
  // #endif

  // #ifndef MP-WEIXIN
  // 非微信端没有胶囊，只留状态栏 + 一条正常高度的标题栏
  capTop = (hasSb ? rawSb : 20) + 6
  // #endif

  return {
    navPadTop: Math.round(capTop),
    navRowH: Math.round(capH),
    navPadRight: Math.round(padRight),
    navPadBottom: HEAD_GAP
  }
}

const measured = measure()

export default {
  name: 'exam-topbar',
  data() {
    return measured
  },
  computed: {
    wrapStyle() {
      return `padding-top:${this.navPadTop}px;padding-right:${this.navPadRight}px;padding-bottom:${this.navPadBottom}px;`
    },
    rowStyle() {
      return `min-height:${this.navRowH}px;`
    }
  }
}
</script>

<style lang="scss" scoped>
/* 视觉与原全局 .topbar 一致（组件样式隔离，需在组件内声明） */
.tb-wrap {
  /* 兜底：任何情况下插槽内容都不越出导航栏，避免压到胶囊 */
  width: 100%;
  overflow: hidden;
  padding-left: 35rpx;
  border-bottom: 4rpx solid $ink;
}
/* 内容行：高度 = 胶囊高度，内部组整体垂直居中于胶囊中线 */
.tb-row {
  display: flex;
  align-items: center;
  width: 100%;
}
.tb-inner {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  width: 100%;
}
</style>
