<template>
  <view>
    <exam-topbar>
      <view class="brand ab">年鉴</view>
      <view class="meta">HALL OF FAME · 往届最佳</view>
    </exam-topbar>

    <view class="page-body ab-body">
      <view class="intro">各局最绝奖作品自动入册。人不多的时候，这里安静地替人类保管脑洞。</view>

      <view v-if="items.length" class="masonry">
        <view
          v-for="(a, i) in items"
          :key="a.entryId || i"
          class="alb-item"
          @tap="preview(a)"
        >
          <polaroid-photo
            :image="a.image"
            :emoji="a.emoji || '🏆'"
            :caption="a.caption"
            width="100%"
            ph-height="230rpx"
            :tilt="i % 2 ? 1.4 : -1.4"
          />
          <view class="alb-meta">{{ a.date }} · {{ a.promptText }}<text v-if="a.ownerName"> · {{ a.ownerName }}</text></view>
        </view>
      </view>
      <view v-else class="empty-hint">年鉴还空着。去赢一局最绝奖，把名字刻在这里。</view>
    </view>

    <exam-tabbar active="album" />
    <exam-toast />
  </view>
</template>

<script>
import api from '@/api'
import { toast } from '@/composables/useToast'

export default {
  data() {
    return { items: [] }
  },
  onShow() {
    this.load()
  },
  methods: {
    toast,
    /** 点击大图预览（有真实图片才拉起） */
    preview(a) {
      if (!a.image) return
      uni.previewImage({ urls: [a.image] })
    },
    async load() {
      try {
        this.items = (await api.getAlbum()) || []
      } catch (e) {
        toast(e.message || '年鉴打不开了')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.ab { font-size: 35rpx; }
.ab-body { padding-bottom: 200rpx; }

.intro {
  font-family: $kai;
  font-size: 25rpx;
  color: $ink-soft;
  line-height: 1.9;
  padding: 4rpx 8rpx 27rpx;
}

.masonry {
  column-count: 2;
  column-gap: 23rpx;
}
.alb-item {
  break-inside: avoid;
  margin-bottom: 27rpx;
  transition: transform .12s;
  &:active { transform: scale(.97); }
}
.alb-meta {
  font-family: $mono;
  font-size: 19rpx;
  color: $pencil;
  text-align: center;
  margin-top: 10rpx;
}

.empty-hint {
  text-align: center;
  font-family: $kai;
  color: $pencil;
  padding: 123rpx 31rpx;
  line-height: 2;
}
</style>
