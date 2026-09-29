<template>
  <view>
    <exam-topbar>
      <text class="back-btn" @tap="goBack">‹ 退出</text>
      <view class="meta">{{ round.ownerName }}的局 · {{ statusText }}</view>
    </exam-topbar>

    <view class="page-body" v-if="round.roundId">
      <template v-if="isShooting">
        <countdown-timer :deadline-ts="round.deadlineTs" @done="onDeadline" />
      </template>
      <view v-else class="cd-over">{{ isRevealing ? '已 开 卷' : '已 截 止' }}</view>

      <view class="sheet-card holes q-card">
        <view class="exam-head">
          <text class="no">第 {{ round.no }} 题</text>
          <text class="exam-badge mode-badge">{{ modeText }}</text>
          <text class="exam-badge">本局考题</text>
        </view>
        <view class="prompt-title q-title">{{ round.promptText }}</view>
      </view>

      <avatar-strip :players="round.players" />

      <!-- 未交卷：快门 -->
      <view v-if="canShoot" class="shutter-zone">
        <view class="shutter" @tap="shoot">📷</view>
        <view class="shutter-hint">按下快门，{{ round.shootLimitSec || 60 }} 秒就好</view>
        <text class="blank-btn" @tap="submitBlank">拍不出来 · 交白卷 🕳️</text>
      </view>

      <!-- 已交卷：我的作品 -->
      <view v-else-if="round.myEntry" class="my-photo-wrap">
        <polaroid-photo
          :image="round.myEntry.image"
          :emoji="round.myEntry.emoji || '📷'"
          :c1="round.myEntry.c1"
          :c2="round.myEntry.c2"
          :caption="round.myEntry.caption"
        />
        <view class="submitted-line">
          {{ round.myEntry.isBlank ? '白卷已交 · AI 会替你圆场' : '已交卷 · 等待揭晓' }}
        </view>
      </view>

      <!-- 局主：人齐开卷 -->
      <view class="act-zone">
        <button
          v-if="round.isMine && isShooting && allIn"
          class="btn btn-red act-btn"
          @tap="reveal(true)"
        >人齐了 · 开卷揭晓</button>

        <button
          v-if="isDemo && isShooting"
          class="btn act-btn"
          @tap="reveal(false)"
        >时间快进 · 直接揭晓（演示）</button>

        <button
          v-if="!isShooting && round.isPlayer"
          class="btn btn-primary act-btn"
          @tap="goWall"
        >进入揭晓墙</button>

        <!-- 受邀但没赶上这局：别再给一个必然被服务端拒绝的按钮 -->
        <view v-if="!isShooting && !round.isPlayer" class="outsider-hint">
          这局已经结束了。等下一局，或者让出题人再发一次卡片。
        </view>
      </view>
    </view>

    <!-- 配文弹层 -->
    <exam-sheet :show="capShow" :mask-close="false">
      <view class="cp-title">就这张了？</view>
      <view class="cp-photo">
        <polaroid-photo :image="pendingPath" width="403rpx" ph-height="365rpx" />
      </view>
      <input
        v-model="caption"
        class="cp-input"
        placeholder="给作品配一句话（可空）"
        placeholder-class="cp-ph"
        :focus="capFocus"
        maxlength="30"
        cursor-spacing="24"
        confirm-type="done"
      />
      <view class="cp-row">
        <button class="btn cp-retake" @tap="retake">重 拍</button>
        <button class="btn btn-primary cp-go" @tap="confirmSubmit">就这张，交卷</button>
      </view>
      <view class="cp-cancel" @tap="closeCap">先不交了，回去再想想</view>
    </exam-sheet>

    <exam-toast />
    <exam-privacy />
  </view>
</template>

<script>
import api, { isDemo } from '@/api'
import { toast } from '@/composables/useToast'
import { haptic } from '@/utils/haptic'
import { goNav, goBack as navGoBack } from '@/utils/nav'

export default {
  data() {
    return {
      roundId: '',
      round: { players: [], ownerName: '' },
      capShow: false,
      capFocus: false,
      pendingPath: '',
      caption: '',
      pollTimer: null,
      submitting: false,
      isDemo
    }
  },
  computed: {
    isShooting() { return this.round.status === 'shooting' },
    isRevealing() { return this.round.status === 'revealing' || this.round.status === 'closed' },
    canShoot() {
      // isPlayer 必须一起判：入局可能失败（截止时间到了但清扫还没跑），
      // 那种情况下给了快门，用户拍完上传才被服务端拒绝，白跑一趟。
      return this.isRoundMember && this.isShooting && this.round.myEntry === null && !!this.round.players.length
    },
    isRoundMember() { return this.round.isPlayer !== false },
    allIn() {
      return this.round.players.length > 0 && this.round.players.every((p) => p.submitted)
    },
    statusText() { return this.isShooting ? '进行中' : this.isRevealing ? '已开卷' : '' },
    modeText() { return this.round.mode === 'overnight' ? '🌙 长夜局 24h' : '⚡ 闪电局 2h' }
  },
  onLoad(query) {
    this.roundId = query.roundId || ''
  },
  onShow() {
    if (this.roundId) this.refresh()
  },
  onUnload() {
    clearInterval(this.pollTimer)
    clearTimeout(this.focusTimer)
  },
  onHide() {
    clearInterval(this.pollTimer)
    clearTimeout(this.focusTimer)
  },
  methods: {
    toast,
    async refresh() {
      try {
        let r = await api.getRound(this.roundId)
        // 受邀者第一次点开分享卡片时还不在 players 里，先入局再渲染。
        // 云模式下 players 只在建局时写入局主一人，没有这一步谁都没法交卷，
        // 「人齐自动开卷」也永远不会触发。
        if (r.isPlayer === false && r.status === 'shooting') {
          try {
            r = await api.joinRound(this.roundId)
          } catch (e) {
            // 入局失败（已截止 / 已开卷 / 并发）不阻断浏览，按只读状态展示
            console.warn('[round] joinRound failed:', e.message)
          }
        }
        this.round = r
        // 局内只要还在 shooting 就持续轮询：
        // 未交卷时看别人交了没，已交卷时也要看到头像条实时点亮
        clearInterval(this.pollTimer)
        if (r.status === 'shooting') {
          this.pollTimer = setInterval(() => this.refresh(), 8000)
        }
      } catch (e) {
        toast(e.message || '这局不见了')
        setTimeout(() => this.goBack(), 1200)
      }
    },
    /** 倒计时走完：刷新局状态，让页面自动进入「已截止」 */
    onDeadline() {
      toast('时间到 · 等老师开卷')
      this.refresh()
    },
    /** 重拍：关掉配文弹层，稍等退场动画后重新拉起相机 */
    retake() {
      haptic('light')
      this.capShow = false
      this.capFocus = false
      clearTimeout(this.focusTimer)
      setTimeout(() => this.shoot(), 360)
    },
    /** 关闭配文弹层：同时丢掉聚焦，避免键盘残留 */
    closeCap() {
      this.capShow = false
      this.capFocus = false
      clearTimeout(this.focusTimer)
    },
    shoot() {
      haptic('light')
      uni.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        sizeType: ['compressed'],
        camera: 'back',
        success: (res) => {
          const f = res.tempFiles && res.tempFiles[0]
          if (f && f.tempFilePath) {
            this.pendingPath = f.tempFilePath
            this.caption = ''
            this.capShow = true
            // 等弹层滑入动画结束再聚焦，避免键盘与动画抢焦点
            clearTimeout(this.focusTimer)
            this.focusTimer = setTimeout(() => { this.capFocus = true }, 360)
          }
        }
      })
    },
    async confirmSubmit() {
      if (this.submitting) return
      this.submitting = true
      uni.showLoading({ title: 'AI 正在阅卷…', mask: true })
      try {
        await api.submitEntry(this.roundId, this.pendingPath, this.caption)
        uni.hideLoading()
        this.closeCap()
        haptic('medium')
        toast('交卷成功 · 等' + this.round.ownerName + '揭晓')
        api.requestSubscribe(['ROUND_REVEALED'])
        this.refresh()
      } catch (e) {
        uni.hideLoading()
        toast(e.message || '交卷失败，再试一次')
      } finally {
        this.submitting = false
      }
    },
    async submitBlank() {
      if (this.submitting) return
      this.submitting = true
      uni.showLoading({ title: '交白卷…', mask: true })
      try {
        await api.submitEntry(this.roundId, '', '', { blank: true })
        uni.hideLoading()
        haptic('medium')
        toast('白卷已交 · 荒诞不会缺席')
        api.requestSubscribe(['ROUND_REVEALED'])
        this.refresh()
      } catch (e) {
        uni.hideLoading()
        toast(e.message || '交白卷失败，再试一次')
      } finally {
        this.submitting = false
      }
    },
    async reveal(force) {
      uni.showLoading({ title: '开卷中…', mask: true })
      try {
        await api.revealNow(this.roundId)
        uni.hideLoading()
        this.goWall()
      } catch (e) {
        uni.hideLoading()
        toast(e.message)
      }
    },
    goWall() {
      goNav('/pages/wall/index?roundId=' + this.roundId)
    },
    goBack() {
      clearInterval(this.pollTimer)
      navGoBack()
    }
  },
  onShareAppMessage() {
    return {
      title: `「${this.round.promptText}」——来，用一张照片回答`,
      path: '/pages/round/index?roundId=' + this.roundId
    }
  }
}
</script>

<style lang="scss" scoped>
.cd-over {
  font-family: $kai;
  text-align: center;
  padding: 27rpx 0 8rpx;
  letter-spacing: .3em;
  text-indent: .3em;
  color: $pencil;
  font-size: 29rpx;
}
.q-card { padding: 27rpx 31rpx 27rpx 58rpx; margin-top: 15rpx; }
.q-title {
  font-size: 42rpx;
  padding: 15rpx 0 12rpx;
}

.shutter-zone {
  text-align: center;
  padding: 35rpx 0 15rpx;
}
.shutter {
  width: 162rpx;
  height: 162rpx;
  border-radius: 50%;
  border: 6rpx solid $ink;
  background: #fff;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 58rpx;
  box-shadow: 8rpx 8rpx 0 rgba(214, 72, 47, .8);
  transition: transform .1s;
  &:active { transform: scale(.94) rotate(-4deg); }
}
.shutter-hint {
  font-family: $kai;
  font-size: 24rpx;
  color: $ink-soft;
  margin-top: 23rpx;
  letter-spacing: .15em;
}
.blank-btn {
  display: inline-block;
  margin-top: 27rpx;
  font-family: $kai;
  font-size: 23rpx;
  color: $pencil;
  border-bottom: 2rpx dashed rgba(139, 139, 131, .6);
  padding-bottom: 4rpx;
  letter-spacing: .1em;
}
.mode-badge { background: $hi; border-color: #C9A93A; }

.my-photo-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 19rpx 0 4rpx;
}
.submitted-line {
  font-family: $kai;
  font-size: 24rpx;
  color: $pencil;
  margin-top: 19rpx;
  letter-spacing: .2em;
}

.act-zone { margin-top: 35rpx; padding-bottom: 60rpx; }
.act-btn { margin-top: 19rpx; }
.outsider-hint {
  margin-top: 27rpx;
  text-align: center;
  font-family: $kai;
  font-size: 23rpx;
  line-height: 1.7;
  color: $pencil;
}

.cp-title {
  font-family: $kai;
  font-weight: 700;
  font-size: 33rpx;
  letter-spacing: .15em;
  text-align: center;
  margin-bottom: 23rpx;
}
.cp-photo { display: flex; justify-content: center; }
.cp-input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 27rpx;
  padding: 21rpx 23rpx;
  border: 3rpx solid $ink;
  border-radius: 15rpx;
  background: #fff;
  font-size: 27rpx;
  height: 88rpx;
  line-height: 44rpx;
}
.cp-row { display: flex; gap: 19rpx; margin-top: 27rpx; }
.cp-retake { flex: 1; margin: 0; }
.cp-go { flex: 1.6; margin: 0; }
.cp-cancel {
  text-align: center;
  font-family: $kai;
  font-size: 23rpx;
  color: $pencil;
  margin-top: 23rpx;
  padding: 8rpx;
  letter-spacing: .1em;
  border-bottom: 2rpx dashed rgba(139, 139, 131, .4);
  align-self: center;
  display: table;
  margin-left: auto;
  margin-right: auto;
}
</style>

<!-- 非 scoped：placeholder-class 是原生 input 内部伪节点，scoped 下拿不到 data-v -->
<style lang="scss">
.cp-ph { color: $pencil; font-size: 27rpx; }
</style>
