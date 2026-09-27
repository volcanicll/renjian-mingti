/**
 * 用户隐私保护指引 · 授权管理
 *
 * 背景：2023-09-15 起，微信强制要求「处理用户个人信息」的小程序：
 *   1. 在 mp.weixin.qq.com 提交《小程序用户隐私保护指引》并通过审核
 *   2. 在 app.json 里配置 __usePrivacyCheck__: true（本项目写在 src/manifest.json）
 *   3. 调用隐私接口前必须让用户明确同意，否则接口直接 fail
 *
 * 本项目涉及的隐私接口（三者都必须在隐私指引里勾选）：
 *   - uni.chooseMedia               → 相册（读取）、摄像头
 *   - uni.saveImageToPhotosAlbum    → 相册（写入）
 *   - input type="nickname" / button open-type="chooseAvatar"
 *                                   → 用户信息（头像、昵称）
 *
 * 设计：全局单例。微信拦截到隐私接口调用时，会回调 onNeedPrivacyAuthorization
 * 并给出 resolve；我们把 resolve 存下来，任意页面上挂着的 <exam-privacy />
 * 就会弹出来接住它，由用户点击驱动。
 */
import { reactive } from 'vue'

export const privacy = reactive({
  /** 是否需要弹授权（true 时 <exam-privacy /> 显示） */
  needAuth: false,
  /** 微信给的原始 resolve */
  _raw: null,
  /** 本次会话是否已同意（同意后微信在一段时间内不再拦截） */
  authorized: false
})

/**
 * 在 App.onLaunch 里调用一次，注册全局监听。
 * 未开启 __usePrivacyCheck__ 或基础库过旧时静默跳过。
 */
export function initPrivacyAuth() {
  // #ifdef MP-WEIXIN
  if (!uni.onNeedPrivacyAuthorization) return
  uni.onNeedPrivacyAuthorization((resolve) => {
    privacy._raw = resolve
    privacy.needAuth = true
  })
  // #endif
}

/** 同意：必须带 event:'agree'，否则微信不认 */
export function agreePrivacy() {
  const r = privacy._raw
  privacy.needAuth = false
  privacy.authorized = true
  privacy._raw = null
  if (r) r({ event: 'agree', buttonId: 'agree-btn' })
}

/** 暂不同意：后续隐私接口仍会被拦截，UI 层给提示 */
export function disagreePrivacy() {
  const r = privacy._raw
  privacy.needAuth = false
  privacy._raw = null
  if (r) r({ event: 'disagree' })
}

export default privacy
