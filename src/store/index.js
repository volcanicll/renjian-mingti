/**
 * 轻量全局状态（Vue3 reactive，不引 Pinia，减少依赖面）
 *
 * 除了 profile，这里还兼任「页面数据缓存」。
 * 原因：底部 tab 切换会让目标页重新挂载（data 回到初始值），
 * 如果初始值是空的，就会先闪一屏空白 / 假空状态，再等接口回来才有内容。
 * 把最近一次成功的数据放在模块级单例里（页面重建不会清掉它），
 * 页面就能在挂载的第一帧直接渲染出上次的内容，然后后台静默刷新。
 */
import { reactive } from 'vue'
import api from '@/api'

export const store = reactive({
  profile: {
    openid: '',
    nickname: '同学',
    avatar: '😎',
    examNo: '1024',
    stats: { best: 0, lazy: 0, quote: 0, power: 0, combo: 0 }
  },
  booted: false,
  /** 首页启动数据缓存：{ today, myRounds, yesterdayReport, nextTeaser, savedPrompts } | null */
  boot: null,
  /** 年鉴缓存；null 表示还没成功加载过（用它区分「空」和「没加载」） */
  album: null
})

/**
 * 取启动数据。
 * @param {boolean} force 强制刷新（tab 回到首页时用，保证能看到新局）
 * 命中缓存且非强制时直接返回，不发请求。
 */
export async function bootstrap(force = false) {
  if (!force && store.booted && store.boot) return store.boot
  const data = await api.getBootstrap()
  if (data.profile) Object.assign(store.profile, data.profile)
  store.boot = data
  store.booted = true
  return data
}

/** 取年鉴；已缓存且非强制时直接返回 */
export async function loadAlbum(force = false) {
  if (!force && store.album) return store.album
  const items = (await api.getAlbum()) || []
  store.album = items
  return items
}

export default store
