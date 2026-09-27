<template>
  <view v-if="privacy.needAuth" class="pv-mask">
    <view class="pv-card sheet-card">
      <view class="pv-seal">考 场 保 密 须 知</view>

      <view class="pv-body">
        <view class="pv-line">在你正式动笔之前，本考场需要先请示三件事：</view>
        <view class="pv-item">
          <text class="pv-num">①</text>
          <text>调用<text class="tag-hl">摄像头与相册</text>：用于拍摄答卷、保存战报海报。</text>
        </view>
        <view class="pv-item">
          <text class="pv-num">②</text>
          <text>读取<text class="tag-hl">微信头像与昵称</text>：仅用于显示你的准考证，不外传。</text>
        </view>
        <view class="pv-item">
          <text class="pv-num">③</text>
          <text>获取<text class="tag-hl">你的 openid</text>：用于区分同考场的不同同学。</text>
        </view>
        <view class="pv-note">以上信息仅限本小程序使用，不会提供给第三方。</view>
      </view>

      <!-- 微信规定：同意必须由 <button open-type="agreePrivacyAuthorization"> 触发 -->
      <button
        class="btn btn-primary pv-agree"
        open-type="agreePrivacyAuthorization"
        @agreeprivacyauthorization="onAgree"
      >
        允 许 并 继 续
      </button>
      <button class="btn pv-reject" @tap="onDisagree">暂 不 同 意</button>

      <!-- 查看全文：需用官方按钮跳转隐私保护指引正文 -->
      <button class="pv-doc" open-type="openPrivacyContract">阅读完整《隐私保护指引》 ›</button>
    </view>
  </view>
</template>

<script>
/**
 * 隐私保护指引授权弹层
 *
 * 用法：在**每个页面**的模板根节点里挂一份（见各 pages/*\/index.vue）。
 * 触发链路：
 *   1. 页面调用 uni.chooseMedia 等隐私接口
 *   2. 微信拦截 → App.vue 的 onNeedPrivacyAuthorization 拿到 resolve
 *   3. resolve 存进 utils/privacy.js → 本组件的 privacy.needAuth 变 true → 弹层出现
 *   4. 用户点「允许并继续」（open-type=agreePrivacyAuthorization）→ agreePrivacy() 调 resolve
 *   5. 微信放行，原接口继续执行
 *
 * 注意：本弹层不含 input/textarea 原生组件，用 v-if 卸载即可，不会有残留。
 */
import { privacy, agreePrivacy, disagreePrivacy } from '@/utils/privacy'
import { toast } from '@/composables/useToast'

export default {
  name: 'exam-privacy',
  computed: {
    privacy() { return privacy }
  },
  methods: {
    onAgree() {
      agreePrivacy()
    },
    onDisagree() {
      disagreePrivacy()
      toast('未授权摄像头与相册，暂不能拍照交卷')
    }
  }
}
</script>

<style lang="scss" scoped>
.pv-mask {
  position: fixed;
  left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(20, 28, 44, .5);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 46rpx;
  box-sizing: border-box;
}
.pv-card {
  width: 100%;
  max-width: 604rpx;
  padding: 38rpx 35rpx 31rpx;
  border-width: 4rpx;
  box-shadow: 10rpx 10rpx 0 rgba(35, 50, 77, .18);
}
.pv-seal {
  font-family: $song;
  font-size: 23rpx;
  letter-spacing: .32em;
  text-indent: .32em;
  color: $pencil;
  text-align: center;
  padding-bottom: 17rpx;
  margin-bottom: 19rpx;
  border-bottom: 3rpx dashed $pencil;
}
.pv-body { margin-bottom: 27rpx; }
.pv-line {
  font-family: $kai;
  font-size: 27rpx;
  line-height: 1.7;
  margin-bottom: 15rpx;
}
.pv-item {
  display: flex;
  gap: 10rpx;
  font-size: 25rpx;
  line-height: 1.85;
  color: $ink-soft;
  text-align: justify;
}
.pv-num {
  flex: 0 0 auto;
  color: $red;
  font-family: $mono;
  font-weight: 700;
}
.pv-note {
  margin-top: 15rpx;
  font-size: 23rpx;
  color: $pencil;
  font-family: $mono;
}
.pv-agree { margin-bottom: 15rpx; }
.pv-reject {
  color: $pencil;
  font-size: 25rpx;
  padding: 19rpx 31rpx;
}
.pv-doc {
  display: block;
  margin-top: 23rpx;
  padding: 0;
  background: transparent;
  border: 0;
  line-height: 1.6;
  font-family: $mono;
  font-size: 23rpx;
  color: $pencil;
  text-decoration: underline;
  &::after { border: 0; }
}
</style>
