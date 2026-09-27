/**
 * 全局 Toast 状态（考试风：楷体 + 钢笔蓝底）
 * 页面挂 <exam-toast />；js 里 import { toast } from '@/composables/useToast'
 */
import { reactive } from 'vue'

export const toastState = reactive({ show: false, msg: '' })
let timer = null

export function toast(msg, dur = 1800) {
  toastState.msg = msg
  toastState.show = true
  clearTimeout(timer)
  timer = setTimeout(() => { toastState.show = false }, dur)
}
