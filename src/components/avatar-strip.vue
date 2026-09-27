<template>
  <view>
    <view class="strip">
      <view
        v-for="p in players"
        :key="p.openid"
        class="av"
        :class="{ done: p.submitted }"
      >{{ p.avatar }}</view>
    </view>
    <view class="strip-count">{{ doneCount }}/{{ players.length }} 人已交卷</view>
  </view>
</template>

<script>
/** 交卷头像条：未交虚线灰、已交实线亮；底部附实时进度 */
export default {
  name: 'avatar-strip',
  props: {
    players: { type: Array, default: () => [] } // [{openid,nickname,avatar,submitted}]
  },
  computed: {
    doneCount() {
      return this.players.filter((p) => p.submitted).length
    }
  }
}
</script>

<style lang="scss" scoped>
.strip {
  display: flex;
  gap: 15rpx;
  justify-content: center;
  padding: 27rpx 0 8rpx;
  flex-wrap: wrap;
}
.av {
  width: 77rpx;
  height: 77rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 38rpx;
  background: #fff;
  border: 3rpx dashed $pencil;
  opacity: .45;
  transition: all .3s;
}
.av.done {
  border: 3rpx solid $ink;
  opacity: 1;
  box-shadow: 4rpx 4rpx 0 rgba(35, 50, 77, .18);
  transform: scale(1.06);
}
.strip-count {
  text-align: center;
  font-family: $mono;
  font-size: 20rpx;
  color: $pencil;
  letter-spacing: .1em;
  padding-bottom: 4rpx;
}
</style>
