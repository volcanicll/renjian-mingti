/**
 * 「人间命题」全局配置
 *
 * USE_CLOUD = false  → 演示模式：全部数据走本地 mock，无需 AppID / 云环境即可完整跑通玩法
 * USE_CLOUD = true   → 云开发模式：走微信云开发（云函数 + 云数据库 + 云存储）
 *
 * 上线前请填写：
 *   1. src/manifest.json → mp-weixin.appid
 *   2. CLOUD_ENV         → 微信开发者工具里开通云开发后的环境 ID
 *   3. SUBSCRIBE_TEMPLATES → 订阅消息模板 ID（mp.weixin.qq.com → 订阅消息）
 */
export const config = {
  USE_CLOUD: false,

  // 微信云开发环境 ID（USE_CLOUD=true 时必填）
  CLOUD_ENV: '',

  // 云函数名（timer 薄壳函数内部直连 main，因此不需要单独的 CF_TIMER）
  CF_MAIN: 'main',

  // 订阅消息模板 ID（留空则静默跳过订阅请求）
  SUBSCRIBE_TEMPLATES: {
    ROUND_REVEALED: '', // 你参与的局已揭晓
    GOT_VOTED: '',     // 你的照片被投了最绝奖
    YOUR_TURN: ''      // 轮到你出题了
  }

  // 说明：玩法时限与防刷上限都不在这里配置，避免前后端各写一份常量然后漂移。
  //   局时限   → src/api/mock.js 与 cloudfunctions/main/lib/game.js 的 MODE_HOURS
  //   阅卷窗口 → cloudfunctions/main/lib/game.js 的 VOTE_WINDOW
  //   批注上限 → cloudfunctions/main/lib/game.js 的 MAX_ANNOTATIONS（服务端强制）
  // 阅卷窗口与批注上限会随 wall.get 一起下发（settleAtTs / maxAnnotations），
  // 页面只做展示与按钮状态，不自己写死数字。
}

export default config
