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

  // 云函数名
  CF_MAIN: 'main',
  CF_TIMER: 'timer',

  // 订阅消息模板 ID（留空则静默跳过订阅请求）
  SUBSCRIBE_TEMPLATES: {
    ROUND_REVEALED: '', // 你参与的局已揭晓
    GOT_VOTED: '',     // 你的照片被投了最绝奖
    YOUR_TURN: ''      // 轮到你出题了
  },

  // 局默认时限（小时）
  DEFAULT_ROUND_HOURS: 24,

  // 每人每局可标注的答卷数上限（防刷）
  MAX_ANNOTATIONS: 12
}

export default config
