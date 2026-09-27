<template>
  <view v-if="render" class="ov" :class="{ enter }" @tap="onMask">
    <view class="sheet" @tap.stop>
      <view class="grab" />
      <slot />
    </view>
  </view>
</template>

<script>
/**
 * 底部弹层
 * 注意：input/textarea 是小程序「原生组件」，不认祖先的 opacity / z-index，
 * 会永远盖在最上层。所以弹层关闭后必须真正卸载节点（v-if），
 * 不能靠 opacity:0 隐藏，否则输入框会悬浮在页面上遮挡内容。
 * 动画同样避开 transform：原生组件跟随布局位（bottom），不跟随 transform。
 */
export default {
  name: 'exam-sheet',
  props: {
    show: { type: Boolean, default: false },
    /** 点击遮罩是否关闭 */
    maskClose: { type: Boolean, default: true }
  },
  emits: ['close'],
  data() {
    return {
      render: this.show,
      enter: false,
      timer: null,
      exitTimer: null
    }
  },
  mounted() {
    if (this.show) this.open()
  },
  watch: {
    show(v) {
      v ? this.open() : this.close()
    }
  },
  unmounted() {
    clearTimeout(this.timer)
    clearTimeout(this.exitTimer)
  },
  methods: {
    onMask() {
      if (this.maskClose) this.$emit('close')
    },
    open() {
      clearTimeout(this.exitTimer)
      this.render = true
      // 下一帧再切 enter，保证从初始位开始过渡
      this.timer = setTimeout(() => { this.enter = true }, 20)
    },
    close() {
      clearTimeout(this.timer)
      this.enter = false
      // 等退场动画播完再卸载，否则会看到弹层瞬间消失
      this.exitTimer = setTimeout(() => { this.render = false }, 320)
    }
  }
}
</script>

<style lang="scss" scoped>
.ov {
  position: fixed;
  left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(20, 28, 44, .45);
  z-index: 900;
  opacity: 0;
  pointer-events: none;
  transition: opacity .25s ease;
}
.ov.enter {
  opacity: 1;
  pointer-events: auto;
}
.sheet {
  position: absolute;
  left: 0; right: 0;
  bottom: -100%;
  background: $paper;
  max-height: 88vh;
  overflow-y: auto;
  border-radius: 38rpx 38rpx 0 0;
  border-top: 4rpx solid $ink;
  padding: 35rpx 35rpx calc(35rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  transition: bottom .3s cubic-bezier(.22, 1, .36, 1);
}
.ov.enter .sheet {
  bottom: 0;
}
.grab {
  width: 81rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background: $pencil;
  opacity: .5;
  margin: 0 auto 27rpx;
}
</style>
