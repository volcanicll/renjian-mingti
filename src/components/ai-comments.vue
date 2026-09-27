<template>
  <view class="ai-list">
    <view v-for="(c, i) in shown" :key="c.entryId" class="ai-item">
      <text class="who">{{ c.ownerName }} 答</text>
      <text class="note">{{ c.text.slice(0, c._n) }}</text>
    </view>
  </view>
</template>

<script>
/**
 * AI 红笔点评列表 —— 逐条打字机效果（结算页高潮）
 * props.comments: [{ entryId, ownerName, caption, text }]
 */
const CHAR_MS = 26

export default {
  name: 'ai-comments',
  props: {
    comments: { type: Array, default: () => [] },
    /** 关闭打字机直接显示（降级/重进） */
    instant: { type: Boolean, default: false }
  },
  emits: ['allDone'],
  data() {
    return { shown: [], timer: null }
  },
  watch: {
    comments: {
      immediate: true,
      handler(list) {
        this.start()
      }
    }
  },
  unmounted() {
    clearInterval(this.timer)
  },
  methods: {
    start() {
      clearInterval(this.timer)
      this.shown = this.comments.map((c) => ({ ...c, _n: this.instant ? c.text.length : 0 }))
      if (this.instant || !this.shown.length) {
        if (this.shown.length) this.$emit('allDone')
        return
      }
      let idx = 0
      const step = () => {
        if (idx >= this.shown.length) {
          clearInterval(this.timer)
          this.$emit('allDone')
          return
        }
        const cur = this.shown[idx]
        cur._n += 1
        if (cur._n >= cur.text.length) idx += 1
      }
      this.timer = setInterval(step, CHAR_MS)
    },
    /** 点击跳过动画，全部显示 */
    finishAll() {
      clearInterval(this.timer)
      this.shown = this.comments.map((c) => ({ ...c, _n: c.text.length }))
      this.$emit('allDone')
    }
  }
}
</script>

<style lang="scss" scoped>
.ai-list { padding: 8rpx 27rpx; }
.ai-item {
  display: flex;
  gap: 19rpx;
  padding: 17rpx 8rpx;
  border-bottom: 2rpx dashed rgba(139, 139, 131, .4);
  align-items: baseline;
  &:last-child { border-bottom: none; }
}
.who {
  flex: none;
  font-family: $mono;
  font-size: 20rpx;
  color: $pencil;
}
.note {
  font-family: $kai;
  color: $red;
  font-size: 27rpx;
  line-height: 1.7;
  text-decoration: underline wavy rgba(214, 72, 47, .35);
  text-underline-offset: 10rpx;
}
</style>
