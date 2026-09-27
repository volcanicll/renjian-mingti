<template>
  <view class="cd" :class="{ danger }">
    <view class="time">{{ text }}</view>
    <view class="label">{{ danger ? '时 间 快 用 完 了' : label }}</view>
  </view>
</template>

<script>
import { fmtHMS } from '@/utils/format'

export default {
  name: 'countdown-timer',
  props: {
    deadlineTs: { type: Number, required: true },
    label: { type: String, default: '距 交 卷 截 止' }
  },
  emits: ['done'],
  data() {
    return { nowTs: Date.now(), timer: null }
  },
  computed: {
    leftSec() { return Math.max(0, (this.deadlineTs - this.nowTs) / 1000) },
    text() { return fmtHMS(this.leftSec) },
    done() { return this.leftSec <= 0 },
    /** 最后 5 分钟红色警示 */
    danger() { return this.leftSec > 0 && this.leftSec <= 300 }
  },
  watch: {
    done(v) { if (v) this.$emit('done') }
  },
  mounted() {
    this.timer = setInterval(() => { this.nowTs = Date.now() }, 1000)
  },
  unmounted() {
    clearInterval(this.timer)
  }
}
</script>

<style lang="scss" scoped>
.cd { text-align: center; padding: 12rpx 0 4rpx; }
.time {
  font-family: $mono;
  font-size: 73rpx;
  font-weight: 700;
  letter-spacing: .06em;
  transition: color .3s;
}
.label {
  display: block;
  font-family: $kai;
  font-size: 21rpx;
  color: $pencil;
  letter-spacing: .4em;
  text-indent: .4em;
  transition: color .3s;
}
/* 最后 5 分钟：红色 + 心跳感 */
.cd.danger .time {
  color: $red;
  animation: cdPulse 1s ease-in-out infinite;
}
.cd.danger .label { color: $red; opacity: .75; }
@keyframes cdPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
</style>
