/**
 * 云开发适配器 —— 所有请求走 main 云函数统一分发
 * 云函数侧对应 cloudfunctions/main/index.js 的 action 路由
 */
import config from '@/config'

let inited = false

function ensureInit() {
  if (inited) return
  if (!uni.cloud) {
    throw new Error('wx.cloud 不可用：请确认基础库 ≥2.2.3 且已开通云开发')
  }
  uni.cloud.init({ env: config.CLOUD_ENV || undefined, traceUser: true })
  inited = true
}

async function call(action, payload = {}) {
  ensureInit()
  const res = await uni.cloud.callFunction({
    name: config.CF_MAIN,
    data: { action, payload }
  })
  const r = res.result
  if (!r) throw new Error('云函数无返回')
  if (r.ok === false) {
    const err = new Error(r.error || '服务开小差了')
    err.code = r.code
    throw err
  }
  return r.data
}

const cloudApi = {
  getBootstrap: () => call('bootstrap'),
  updateProfile: (patch) => call('profile.update', patch),
  createRound: ({ source, text, mode }) => call('round.create', { source, text, mode }),
  generateAiPrompt: (hint) => call('ai.prompt', { hint }),
  getRound: (roundId) => call('round.get', { roundId }),
  submitEntry: async (roundId, tempFilePath, caption, opts) => {
    ensureInit()
    const blank = !!(opts && opts.blank) || !tempFilePath
    if (blank) return call('entry.submit', { roundId, fileID: '', caption, blank: true })
    const cloudPath = `entries/${roundId}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`
    const up = await uni.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
    return call('entry.submit', { roundId, fileID: up.fileID, caption })
  },
  revealNow: (roundId) => call('round.reveal', { roundId }),
  joinRound: (roundId) => call('round.join', { roundId }),
  getWall: (roundId) => call('wall.get', { roundId }),
  guess: (roundId, entryId, guessedOpenid) =>
    call('guess.cast', { roundId, entryId, guessedOpenid }),
  vote: (roundId, entryId, tag) => call('vote.cast', { roundId, entryId, tag }),
  giftPower: (roundId, toOpenid) => call('power.gift', { roundId, toOpenid }),
  settle: (roundId) => call('round.settle', { roundId }),
  savePrompt: ({ promptId, no, text }) => call('save.prompt', { promptId, no, text }),
  unsavePrompt: (promptId) => call('save.remove', { promptId }),
  reportEntry: ({ roundId, entryId, reason }) =>
    call('report.create', { roundId, entryId, reason }),
  getAlbum: () => call('album.get'),
  getPosterQr: (roundId) => call('qr.get', { roundId })
}

export default cloudApi
