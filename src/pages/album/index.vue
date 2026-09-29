<template>
  <view>
    <exam-topbar>
      <view class="brand ab">年鉴</view>
      <view class="meta">HALL OF FAME · 往届最佳</view>
    </exam-topbar>

    <view class="page-body ab-body">
      <view class="intro">各局最绝奖作品自动入册。人不多的时候，这里安静地替人类保管脑洞。</view>

      <!-- 没有任何缓存时先给占位：不能先显示「年鉴还空着」，那是假空状态 -->
      <view v-if="!loaded && !failed" class="alb-loading">年鉴翻页中…</view>

      <view v-else-if="failed" class="empty-hint">年鉴暂时打不开，稍后再试。</view>

      <view v-else-if="items.length" class="masonry">
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
    <exam-privacy />
  </view>
</template>

<script>
import { store, loadAlbum } from '@/store'
import { toast } from '@/composables/useToast'

export default {
  data() {
    // 用缓存做初始值：tab 切回来时第一帧就有内容，不再闪空白
    return { items: store.album || [], loaded: !!store.album, failed: false }
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
        // 已有缓存就先渲染缓存，后台再拉最新（force）
        this.items = await loadAlbum(!!this.loaded)
        this.loaded = true
        this.failed = false
      } catch (e) {
        // 有缓存时静默失败，别打断已经渲染出来的内容；
        // 没缓存时要落到「打不开」而不是永远停在「翻页中」
        this.failed = !this.loaded
        if (!this.loaded) toast(e.message || '年鉴打不开了')
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

/* 首次加载占位：宁可显示「翻页中」，也不要先闪一屏「年鉴还空着」 */
.alb-loading {
  text-align: center;
  font-family: $kai;
  color: $pencil;
  font-size: 23rpx;
  letter-spacing: .2em;
  padding: 123rpx 31rpx;
}
</style>
