<template>
  <view class="stamp" :class="{ small }" :style="color ? { borderColor: color, color } : {}">{{ text }}</view>
</template>

<script>
export default {
  name: 'stamp-badge',
  props: {
    text: { type: String, default: '最绝' },
    small: { type: Boolean, default: false },
    /** 覆盖章色（默认批改朱红），如最敷衍奖用金色 #C9A93A */
    color: { type: String, default: '' }
  }
}
</script>

<style lang="scss" scoped>
.stamp {
  position: absolute;
  top: 15rpx;
  right: 19rpx;
  width: 142rpx;
  height: 142rpx;
  border-radius: 50%;
  border: 6rpx double $red;
  color: $red;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: $kai;
  font-weight: 700;
  font-size: 40rpx;
  letter-spacing: .1em;
  text-indent: .1em;
  transform: rotate(-14deg);
  opacity: .88;
  background: rgba(250, 247, 239, .35);
  animation: stampIn .45s cubic-bezier(.2, 1.6, .4, 1) both;
  z-index: 3;
}
.stamp.small {
  width: 115rpx;
  height: 115rpx;
  font-size: 31rpx;
  top: auto;
  bottom: 19rpx;
}
@keyframes stampIn {
  0%   { transform: scale(2.4) rotate(-40deg); opacity: 0; }
  70%  { transform: scale(.92) rotate(-11deg); opacity: .95; }
  100% { transform: scale(1) rotate(-14deg); opacity: .88; }
}
</style>
