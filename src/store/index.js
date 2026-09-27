/**
 * 轻量全局状态（Vue3 reactive，不引 Pinia，减少依赖面）
 */
import { reactive } from 'vue'
import api from '@/api'

export const store = reactive({
  profile: {
    openid: '',
    nickname: '同学',
    avatar: '😎',
    examNo: '1024',
    stats: { best: 0, lazy: 0, power: 0, combo: 0 }
  },
  booted: false
})

export async function bootstrap() {
  if (store.booted) return
  try {
    const data = await api.getBootstrap()
    if (data.profile) Object.assign(store.profile, data.profile)
    store.booted = true
  } catch (e) {
    // 首页会自行处理错误与重试
    throw e
  }
}

export async function refreshProfile() {
  const data = await api.getBootstrap()
  if (data.profile) Object.assign(store.profile, data.profile)
}

export default store
