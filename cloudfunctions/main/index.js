/**
 * 「人间命题」主云函数 —— action 路由入口
 *
 * 调用约定：wx.cloud.callFunction({ name:'main', data:{ action, payload } })
 * 返回：{ ok:true, data } | { ok:false, error:'中文错误', code? }
 *
 * 定时触发：config.json 里的 sweepTrigger（每 5 分钟）会以
 * event.Type === 'Timer' 进入，执行过期局清扫与自动结算。
 */
const cloud = require('wx-server-sdk')
const game = require('./lib/game')
const admin = require('./lib/admin')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const db = cloud.database()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''

  try {
    // ---------- 定时触发：清扫过期局 ----------
    // 必须同时要求「没有用户身份」：event 就是调用方传来的 data 对象，
    // 普通用户完全可以伪造 { Type:'Timer' } 把这条分支当成免鉴权入口。
    // 真实的定时触发器不带 OPENID，控制台调用同样不带。
    if ((event.Type === 'Timer' || event.triggerName === 'sweepTrigger') && !openid) {
      const swept = await game.sweepExpired(cloud, db)
      return { ok: true, data: swept }
    }

    const action = event.action || ''
    const payload = event.payload || {}

    // ---------- 无需登录的 action ----------
    switch (action) {
      case 'timer.sweep': {
        // 允许 timer 薄壳函数或控制台手动触发；拒绝带用户身份的调用
        if (openid) return { ok: false, error: '该操作仅限系统触发' }
        const swept = await game.sweepExpired(cloud, db)
        return { ok: true, data: swept }
      }
      case 'admin.seedPrompts': {
        // 控制台调用（无 OPENID）或 ADMIN_OPENIDS 中的管理员。
        // 注意不能写成 `openid && admins.length && ...`：ADMIN_OPENIDS 未配置时
        // 那是个空数组，中间项恒假会让整个守卫失效，任何登录用户都能触发建库。
        const admins = (process.env.ADMIN_OPENIDS || '').split(',').map((s) => s.trim()).filter(Boolean)
        if (openid && !admins.includes(openid)) {
          return { ok: false, error: '没有权限' }
        }
        const n = await admin.seedPrompts(db)
        return { ok: true, data: { seeded: n } }
      }
    }

    // ---------- 以下 action 均需用户身份 ----------
    if (!openid) return { ok: false, error: '请从小程序内访问', code: 'NO_AUTH' }

    let data
    switch (action) {
      case 'bootstrap':      data = await game.bootstrap(cloud, db, openid); break
      case 'profile.update': data = await game.profileUpdate(cloud, db, openid, payload); break
      case 'round.create':   data = await game.createRound(cloud, db, openid, payload); break
      case 'round.join':     data = await game.joinRound(cloud, db, openid, payload); break
      case 'round.get':      data = await game.getRound(cloud, db, openid, payload); break
      case 'round.reveal':   data = await game.revealRound(cloud, db, openid, payload); break
      case 'round.settle':   data = await game.settleAction(cloud, db, openid, payload); break
      case 'entry.submit':   data = await game.submitEntry(cloud, db, openid, payload); break
      case 'wall.get':       data = await game.getWall(cloud, db, openid, payload); break
      case 'guess.cast':     data = await game.castGuess(cloud, db, openid, payload); break
      case 'vote.cast':      data = await game.castVote(cloud, db, openid, payload); break
      case 'power.gift':     data = await game.giftPower(cloud, db, openid, payload); break
      case 'save.prompt':    data = await game.savePrompt(cloud, db, openid, payload); break
      case 'save.remove':    data = await game.unsavePrompt(cloud, db, openid, payload); break
      case 'report.create':  data = await game.reportCreate(cloud, db, openid, payload); break
      case 'album.get':      data = await game.getAlbum(cloud, db); break
      case 'qr.get':         data = await game.getQrCode(cloud, db, openid, payload); break
      case 'ai.prompt':      data = await game.aiPromptAction(cloud, db, openid, payload); break
      default:
        return { ok: false, error: `未知操作: ${action}` }
    }
    return { ok: true, data }
  } catch (err) {
    console.error(`[main] action=${event.action} err=`, err)
    return { ok: false, error: err.message || '服务开小差了，稍后再试' }
  }
}
