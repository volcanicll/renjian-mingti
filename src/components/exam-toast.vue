<template>
  <view class="tst" :class="{ on: st.show }">{{ st.msg }}</view>
</template>

<script>
import { toastState } from '@/composables/useToast'

export default {
  name: 'exam-toast',
  computed: {
    st() { return toastState }
  }
}
</script>

<style lang="scss" scoped>
.tst {
  position: fixed;
  left: 50%;
  bottom: 184rpx;
  transform: translateX(-50%) translateY(40rpx);
  background: $ink;
  color: $paper;
  font-size: 25rpx;
  padding: 17rpx 35rpx;
  border-radius: 15rpx;
  opacity: 0;
  pointer-events: none;
  transition: all .25s;
  z-index: 9999;
  white-space: nowrap;
  max-width: 86vw;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: $kai;
  letter-spacing: .08em;
  box-shadow: 0 12rpx 31rpx rgba(0, 0, 0, .25);
}
.tst.on {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
