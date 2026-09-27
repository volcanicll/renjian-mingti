<script>
import config from '@/config'

export default {
  onLaunch() {
    // #ifdef MP-WEIXIN
    if (config.USE_CLOUD && uni.cloud) {
      uni.cloud.init({ env: config.CLOUD_ENV || undefined, traceUser: true })
    }
    // #endif
  }
}
</script>

<style lang="scss">
@import '@/styles/exam.scss';
</style>
