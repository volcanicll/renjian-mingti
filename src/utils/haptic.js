/** 轻量触感反馈（部分设备/环境可能不支持，静默降级） */
export function haptic(type = 'light') {
  try {
    uni.vibrateShort({ type })
  } catch (e) { /* 忽略 */ }
}
