<template>
  <view>
    <exam-topbar>
      <text class="back-btn" @tap="goBack">‹ 退出</text>
      <view class="brand rb">考场须知</view>
      <view class="meta">RULES</view>
    </exam-topbar>

    <view class="page-body rules-body">
      <view class="sheet-card r-card">
        <view class="r-title">第 1 条 · 考试流程</view>
        <view class="r-text">
          <view>① 每天一道荒诞命题：系统出、AI 出、或上一局赢家出。</view>
          <view>② 开一局扔进微信群，各位用十秒拍一张交卷。</view>
          <view>③ 揭晓墙匿名上墙：先猜谁拍的，再批注投票（🏆最绝 / 🍬最敷衍）。</view>
          <view>④ 结算发奖，最绝奖得主获得明日出题权。</view>
        </view>
      </view>

      <view class="sheet-card r-card">
        <view class="r-title">第 2 条 · 评分标准</view>
        <view class="r-text">本考试满分 0 分。跑题不扣分；敷衍另有专门奖项（🍬最敷衍奖），敷衍得恰到好处同样是才华。</view>
      </view>

      <view class="sheet-card r-card">
        <view class="r-title">第 3 条 · 两位 AI 监考</view>
        <view class="r-text">
          <view>AI 裁判：只拦明显跑题与违规内容，存疑一律放行，交给大家裁决。</view>
          <view>AI 点评员：给每张作品写一句红笔短评——毒舌但不伤人，只调侃理解命题的方式，不评价摄影技术。</view>
        </view>
      </view>

      <view class="sheet-card r-card">
        <view class="r-title">第 4 条 · 考场纪律</view>
        <view class="r-text">
          <view>请勿未经同意拍摄他人。</view>
          <view>看到不合适的答卷，可在揭晓墙详情里举报，老师会处理。</view>
          <view>上传作品授权在年鉴与战报中展示，署名权归作者本人。</view>
        </view>
      </view>

      <view class="seal-line">人 间 命 题 组 命 题 委 员 会</view>
    </view>

    <exam-toast />
    <exam-privacy />
  </view>
</template>

<script>
export default {
  methods: {
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) uni.navigateBack()
      else uni.reLaunch({ url: '/pages/home/index' })
    }
  }
}
</script>

<style lang="scss" scoped>
.rb { font-size: 35rpx; }
.rules-body { padding-bottom: 80rpx; }

.r-card {
  padding: 31rpx;
  margin-bottom: 27rpx;
}
.r-title {
  font-family: $kai;
  font-weight: 700;
  font-size: 29rpx;
  letter-spacing: .1em;
  margin-bottom: 15rpx;
}
.r-text {
  font-size: 25rpx;
  line-height: 1.9;
  color: $ink-soft;
}
</style>
