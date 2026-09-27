<template>
  <view class="tb">
    <view
      v-for="t in tabs"
      :key="t.key"
      class="tb-item"
      :class="{ on: active === t.key }"
      @tap="go(t.url, t.key)"
    >{{ t.label }}</view>
  </view>
</template>

<script>
import { goRelaunch } from '@/utils/nav'

export default {
  name: 'exam-tabbar',
  props: {
    active: { type: String, default: 'home' }
  },
  data() {
    return {
      tabs: [
        { key: 'home', label: '首页', url: '/pages/home/index' },
        { key: 'album', label: '年鉴', url: '/pages/album/index' },
        { key: 'me', label: '我的', url: '/pages/me/index' }
      ]
    }
  },
  methods: {
    go(url, key) {
      if (key === this.active) return
      goRelaunch(url)
    }
  }
}
</script>

<style lang="scss" scoped>
.tb {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 500;
  display: flex;
  background: $paper;
  border-top: 3rpx solid $ink;
  padding: 12rpx 20rpx calc(16rpx + env(safe-area-inset-bottom));
}
.tb-item {
  flex: 1;
  text-align: center;
  font-family: $kai;
  font-size: 25rpx;
  letter-spacing: .3em;
  text-indent: .3em;
  color: $pencil;
  padding: 13rpx 0;
  position: relative;
  transition: transform .12s, opacity .12s;
  &:active { transform: scale(.9); opacity: .7; }
}
.tb-item.on {
  color: $ink;
  font-weight: 700;
  &::after {
    content: "";
    position: absolute;
    left: 32%;
    right: 32%;
    bottom: 2rpx;
    height: 6rpx;
    background: $red;
    transform: rotate(-1.6deg);
  }
}
</style>
