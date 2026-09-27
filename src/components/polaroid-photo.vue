<template>
  <view class="polaroid" :style="{ width, transform: tilt ? `rotate(${tilt}deg)` : '' }">
    <view v-if="tape" class="tape" />
    <view class="ph" :style="phStyle">
      <image
        v-if="image"
        :src="image"
        mode="aspectFill"
        style="height: 100%"
        @error="$emit('imgError')"
      />
      <text v-else>{{ emoji }}</text>
    </view>
    <view v-if="caption" class="cap">{{ caption }}</view>
  </view>
</template>

<script>
/**
 * 拍立得照片卡
 * image 优先；无图时显示 emoji 占位（演示数据/加载失败兜底）
 */
export default {
  name: 'polaroid-photo',
  props: {
    image: { type: String, default: '' },
    emoji: { type: String, default: '📷' },
    /** 渐变底色两端的颜色（emoji 占位时） */
    c1: { type: String, default: '#CFE3DD' },
    c2: { type: String, default: '#EFE3C2' },
    caption: { type: String, default: '' },
    width: { type: String, default: '330rpx' },
    /** 照片区高度 */
    phHeight: { type: String, default: '288rpx' },
    tilt: { type: Number, default: 0 },
    tape: { type: Boolean, default: true }
  },
  emits: ['imgError'],
  computed: {
    phStyle() {
      return {
        ...(this.image ? {} : { '--pc1': this.c1, '--pc2': this.c2 }),
        height: this.phHeight || '288rpx'
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.polaroid {
  background: #fff;
  padding: 19rpx 19rpx 23rpx;
  border: 2rpx solid rgba(35, 50, 77, .25);
  box-shadow: 8rpx 10rpx 23rpx rgba(35, 50, 77, .22);
  position: relative;
}
.ph {
  width: 100%;
  height: 288rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 123rpx;
  overflow: hidden;
  background: linear-gradient(135deg, var(--pc1, #CFE3DD), var(--pc2, #EFE3C2));
  image { width: 100%; height: 100%; display: block; }
}
.cap {
  font-family: $kai;
  font-size: 25rpx;
  text-align: center;
  margin-top: 17rpx;
  color: $ink;
  letter-spacing: .05em;
  line-height: 1.5;
}
.tape {
  position: absolute;
  top: -19rpx;
  left: 50%;
  transform: translateX(-50%) rotate(-3deg);
  width: 142rpx;
  height: 38rpx;
  background: rgba(245, 217, 78, .75);
  box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, .12);
  z-index: 2;
}
</style>
