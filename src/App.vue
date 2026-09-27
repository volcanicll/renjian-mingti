<script>
import config from '@/config'
import { initPrivacyAuth } from '@/utils/privacy'

export default {
  onLaunch() {
    // #ifdef MP-WEIXIN
    if (config.USE_CLOUD && uni.cloud) {
      uni.cloud.init({ env: config.CLOUD_ENV || undefined, traceUser: true })
    }
    // 隐私保护指引授权监听：开了 __usePrivacyCheck__ 后，
    // 所有隐私接口（chooseMedia / saveImageToPhotosAlbum / 头像昵称）都依赖这里
    initPrivacyAuth()
    // #endif
  }
}
</script>

<style lang="scss">
@import '@/styles/exam.scss';
</style>
