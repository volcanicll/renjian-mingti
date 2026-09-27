/**
 * timer 兜底函数 —— 手动/外部触发时转发主云函数清扫过期局。
 * 主函数自带每 5 分钟的定时触发器；此函数仅作为控制台手动补跑的入口。
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  try {
    const res = await cloud.callFunction({
      name: 'main',
      data: { action: 'timer.sweep', payload: {} }
    })
    return res.result
  } catch (e) {
    console.error('[timer] sweep 失败:', e.message)
    return { ok: false, error: e.message }
  }
}
