<template>
  <view>
    <exam-topbar>
      <view class="brand rb">阅卷结果</view>
      <view class="meta" v-if="res">第 {{ res.round.no }} 题</view>
    </exam-topbar>

    <view class="page-body" v-if="res">
      <!-- 🍬 最敷衍奖 -->
      <view class="sheet-card award-block">
        <stamp-badge text="敷衍" :small="true" color="#C9A93A" />
        <text class="award-label lazy-bg">🍬 最敷衍奖</text>
        <template v-if="res.awards.lazy">
          <view class="award-flex">
            <polaroid-photo
              :image="res.awards.lazy.image"
              :emoji="awardsEmoji('lazy')"
              :caption="res.awards.lazy.caption"
              width="246rpx"
              ph-height="200rpx"
            />
            <view class="award-info">
              <view class="award-owner">{{ res.awards.lazy.ownerName }}</view>
              <view class="award-cap">「{{ res.awards.lazy.caption }}」</view>
              <view class="award-desc">奖励：下一局被@一次的权利。</view>
            </view>
          </view>
        </template>
        <view v-else class="award-empty">本奖项空缺——本局无人批注，荒诞自行当选。</view>
      </view>

      <!-- 🏆 最绝奖 -->
      <view class="sheet-card award-block">
        <stamp-badge text="最绝" />
        <text class="award-label best-bg">🏆 最绝奖</text>
        <template v-if="res.awards.best">
          <view class="award-flex">
            <polaroid-photo
              :image="res.awards.best.image"
              :emoji="awardsEmoji('best')"
              :caption="res.awards.best.caption"
              width="246rpx"
              ph-height="200rpx"
            />
            <view class="award-info">
              <view class="award-owner">{{ res.awards.best.ownerName }}</view>
              <view class="award-cap">「{{ res.awards.best.caption }}」</view>
              <view class="award-desc">获得明日出题权，全群等TA发难。</view>
            </view>
          </view>
        </template>
        <view v-else class="award-empty">本奖项空缺——本局无人批注，荒诞自行当选。</view>
      </view>

      <!-- 📝 金句奖 -->
      <view class="sheet-card award-block">
        <stamp-badge text="金句" :small="true" color="#4B5563" />
        <text class="award-label quote-bg">📝 金句奖</text>
        <template v-if="res.awards.quote">
          <view class="award-flex">
            <polaroid-photo
              :image="res.awards.quote.image"
              :emoji="awardsEmoji('quote')"
              :caption="res.awards.quote.caption"
              width="246rpx"
              ph-height="200rpx"
            />
            <view class="award-info">
              <view class="award-owner">{{ res.awards.quote.ownerName }}</view>
              <view class="award-cap">「{{ res.awards.quote.caption }}」</view>
              <view class="award-desc">奖励：这句话将被抄进年鉴扉页。</view>
            </view>
          </view>
        </template>
        <view v-else class="award-empty">本奖项空缺——本局无人配文，大家都在用照片说话。</view>
      </view>

      <!-- 卧底揭晓 -->
      <view v-if="res.undercover" class="uc-reveal">
        <view class="ur-title">卧 底 揭 晓</view>
        <view class="ur-body">
          那张「{{ res.undercover.caption }}」不是本届作品 —— 它来自往届 {{ res.undercover.from }}。
        </view>
        <view class="ur-hit">
          {{ res.guessScore.undercoverHit ? '🕵️ 你抓到了它，眼力可以。' : '🕵️ 它从你眼皮底下混过去了。' }}
        </view>
      </view>

      <!-- AI 红笔点评 -->
      <view class="seal-line">AI 红 笔 点 评</view>
      <view class="sheet-card" @tap="$refs.ai && $refs.ai.finishAll()">
        <ai-comments ref="ai" :comments="res.comments" />
        <view class="ai-skip-hint">— 轻触卡片，跳过逐字点评 —</view>
      </view>

      <!-- 我的阅卷成绩 -->
      <view class="my-stat">
        <view class="ms-item">
          <view class="ms-num">{{ res.guessScore.correct }}/{{ res.guessScore.total }}</view>
          <view class="ms-label">猜 中 率</view>
        </view>
        <view class="ms-item">
          <view class="ms-num">{{ res.myStats.combo || 0 }}</view>
          <view class="ms-label">连 续 作 答</view>
        </view>
        <view class="ms-item">
          <view class="ms-num">{{ res.myStats.power }}</view>
          <view class="ms-label">手 握 出 题 权</view>
        </view>
      </view>

      <!-- 出题权：自用或赠人 -->
      <template v-if="res.iWonPower">
        <view class="power-line">🏆 出题权已入袋——明天的题，你来出。</view>
        <view v-if="!giftName" class="gift-box">
          <view class="gb-title">也可以把出题权送给本局一位同学</view>
          <view class="gb-row">
            <view
              v-for="p in giftCandidates"
              :key="p.openid"
              class="gb-avatar"
              @tap="askGift(p)"
            >
              <text class="gba-face">{{ p.avatar }}</text>
              <text class="gba-name">{{ p.nickname }}</text>
            </view>
          </view>
          <view class="gb-foot">送出去的是明天的权力，收回的是一份人情。</view>
        </view>
        <view v-else class="gift-done">🎁 出题权已送给 {{ giftName }}，明天等 TA 发难。</view>
      </template>
      <view v-else-if="res.gift" class="gift-done">🎁 出题权已赠出，明日出题人见下方预告。</view>

      <!-- 明日预告 -->
      <view v-if="res.nextTeaser" class="teaser-box">
        <view class="tb-title">明 日 预 告</view>
        <view class="tb-line">出题人 · <text class="tb-hl">{{ res.nextTeaser.ownerName }}</text></view>
        <view class="tb-hint">{{ res.nextTeaser.hint }}</view>
        <view class="tb-foot">题目明天才完整公布 —— 先留个悬念</view>
      </view>

      <!-- 战报海报 -->
      <view class="sec-label">本局战报 <text class="sub">BATTLE REPORT</text></view>
      <view class="poster">
        <view class="p-brand">人间<text class="em">命题</text> · 第 {{ res.round.no }} 题</view>
        <view class="p-line" />
        <view class="p-quote">
          <view>「{{ res.round.promptText }}」</view>
          <view v-if="res.awards.best">最绝奖：{{ res.awards.best.ownerName }} —— {{ res.awards.best.caption }}</view>
          <view v-if="firstComment">"{{ firstComment }}"</view>
        </view>
        <view class="p-foot">
          <text class="p-date">{{ posterDate }} · {{ answerCount }}人作答 · 满分 0 分</text>
          <image v-if="qrUrl" class="qr-img" :src="qrUrl" mode="aspectFill" />
          <view v-else class="qr-fake" />
        </view>
      </view>
      <button class="btn p-save" :disabled="saving" @tap="savePosterImg">生成战报图片 · 存相册</button>

      <view class="end-zone">
        <button
          v-if="res.iWonPower"
          class="btn btn-primary"
          @tap="usePower"
        >用出题权 · 再来一局</button>
        <button v-else class="btn btn-primary" @tap="goHome">回 首 页</button>
      </view>
    </view>

    <view v-else class="loading-hint">正在阅卷…</view>

    <!-- 海报离屏画布 -->
    <canvas id="poster" type="2d" class="poster-canvas" />
    <exam-toast />
    <exam-privacy />
  </view>
</template>

<script>
import api from '@/api'
import { toast } from '@/composables/useToast'
import { store } from '@/store'
import { fmtPosterDate } from '@/utils/format'
import { drawPoster, savePoster } from '@/utils/poster'

export default {
  data() {
    return {
      roundId: '',
      res: null,
      qrUrl: '',
      saving: false,
      gifting: false,
      giftName: ''
    }
  },
  computed: {
    giftCandidates() {
      const ps = (this.res && this.res.players) || []
      const my = store.profile.openid
      return ps.filter((p) => !my || p.openid !== my)
    },
    firstComment() {
      const c = this.res && this.res.comments && this.res.comments[0]
      return c ? c.text : ''
    },
    posterDate() { return fmtPosterDate(Date.now()) },
    answerCount() {
      return this.res ? Math.max(this.res.comments.length, 1) : 0
    }
  },
  onLoad(query) {
    this.roundId = query.roundId || ''
    this.load()
  },
  methods: {
    toast,
    awardsEmoji(tag) {
      const a = this.res && this.res.awards[tag]
      if (!a) return '📷'
      return a.emoji || '📷'
    },
    async load() {
      uni.showLoading({ title: '正在阅卷…', mask: true })
      try {
        const r = await api.settle(this.roundId)
        this.res = r
        uni.hideLoading()
        // 预取海报小程序码（可空）
        api.getPosterQr(this.roundId)
          .then((q) => { this.qrUrl = (q && q.url) || '' })
          .catch(() => {})
        api.requestSubscribe(['YOUR_TURN', 'GOT_VOTED'])
      } catch (e) {
        uni.hideLoading()
        toast(e.message || '还没到揭晓时间')
        setTimeout(() => uni.navigateBack(), 1400)
      }
    },
    askGift(p) {
      if (this.gifting) return
      uni.showModal({
        title: `把出题权送给 ${p.nickname}？`,
        content: '送出去之后，明天的题就由 TA 来出，你只剩鼓掌的份。',
        confirmText: '送了',
        cancelText: '再想想',
        success: (r) => { if (r.confirm) this.doGift(p) }
      })
    },
    async doGift(p) {
      if (this.gifting) return
      this.gifting = true
      uni.showLoading({ title: '转赠中…', mask: true })
      try {
        const r = await api.giftPower(this.roundId, p.openid)
        uni.hideLoading()
        this.giftName = (r && r.toName) || p.nickname
        if (this.res) {
          this.res.iWonPower = false
          this.res.gift = { to: p.openid }
          if (this.res.myStats && typeof r.power === 'number') this.res.myStats.power = r.power
          if (this.res.nextTeaser) {
            this.res.nextTeaser = { ...this.res.nextTeaser, ownerName: this.giftName, mine: false }
          }
        }
        toast(`出题权已送给 ${this.giftName}`)
      } catch (e) {
        uni.hideLoading()
        toast(e.message || '转赠失败')
      } finally {
        this.gifting = false
      }
    },
    async savePosterImg() {
      if (this.saving) return
      this.saving = true
      uni.showLoading({ title: '绘制战报…', mask: true })
      try {
        const best = this.res.awards.best
        const canvas = await drawPoster(this, '#poster', {
          brandNo: this.res.round.no,
          promptText: this.res.round.promptText,
          bestLine: best ? `最绝奖：${best.ownerName} —— ${best.caption}` : '最绝奖：虚位以待',
          commentLine: this.firstComment || '满分 0 分，人人有奖。',
          dateLine: `${this.posterDate} · ${this.answerCount}人作答 · 满分 0 分`,
          qrUrl: this.qrUrl,
          qrSeed: this.roundId
        })
        await savePoster(canvas)
        uni.hideLoading()
        toast('已存入相册，发群里拉人')
      } catch (e) {
        uni.hideLoading()
        toast('保存失败：' + (e.errMsg || e.message || '再试一次'))
      } finally {
        this.saving = false
      }
    },
    usePower() {
      uni.reLaunch({ url: '/pages/home/index?open=create' })
    },
    goHome() {
      uni.reLaunch({ url: '/pages/home/index' })
    }  },
  onShareAppMessage() {
    const best = this.res && this.res.awards.best
    return {
      title: best
        ? `「${this.res.round.promptText}」最绝奖诞生了：${best.caption}`
        : '人间命题 · 一局战报出炉了',
      path: '/pages/home/index'
    }
  }
}
</script>

<style lang="scss" scoped>
.rb { font-size: 35rpx; }

.award-block {
  position: relative;
  padding: 31rpx 31rpx 27rpx 58rpx;
  margin-bottom: 31rpx;
  overflow: visible;
}
.award-label {
  display: inline-block;
  font-family: $kai;
  font-size: 23rpx;
  letter-spacing: .3em;
  text-indent: .3em;
  color: #fff;
  padding: 6rpx 19rpx;
  border-radius: 6rpx;
  margin-bottom: 19rpx;
}
.lazy-bg { background: #C9A93A; }
.best-bg { background: $red; }
.quote-bg { background: $ink; }

/* 卧底揭晓 */
.uc-reveal {
  background: #FFF6E5;
  border: 3rpx dashed #C9A93A;
  border-radius: 15rpx;
  padding: 23rpx 27rpx;
  margin-bottom: 31rpx;
}
.ur-title {
  font-family: $kai;
  font-size: 23rpx;
  letter-spacing: .3em;
  text-indent: .3em;
  color: #7A5C14;
  margin-bottom: 12rpx;
}
.ur-body { font-size: 25rpx; line-height: 1.8; color: $ink-soft; }
.ur-hit {
  font-family: $kai;
  font-size: 23rpx;
  color: #7A5C14;
  margin-top: 12rpx;
}

/* 赠出题权 */
.gift-box {
  background: #fff;
  border: 3rpx solid $ink;
  border-radius: 15rpx;
  padding: 23rpx 27rpx;
  margin-top: 19rpx;
}
.gb-title {
  font-family: $kai;
  font-size: 25rpx;
  letter-spacing: .1em;
  margin-bottom: 19rpx;
}
.gb-row { display: flex; flex-wrap: wrap; gap: 15rpx; }
.gb-avatar {
  width: calc((100% - 45rpx) / 4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  border: 3rpx dashed rgba(139, 139, 131, .6);
  border-radius: 15rpx;
  padding: 15rpx 4rpx;
  &:active { background: $paper; }
}
.gba-face { font-size: 42rpx; }
.gba-name { font-size: 21rpx; color: $ink-soft; }
.gb-foot {
  font-size: 21rpx;
  color: $pencil;
  margin-top: 15rpx;
  line-height: 1.6;
}
.gift-done {
  font-family: $kai;
  font-size: 25rpx;
  color: $red;
  text-align: center;
  margin-top: 19rpx;
  letter-spacing: .1em;
}

/* 明日预告 */
.teaser-box {
  background: #fff;
  border: 3rpx solid $ink;
  border-radius: 15rpx;
  padding: 23rpx 27rpx;
  margin-top: 31rpx;
  box-shadow: 8rpx 8rpx 0 rgba(35, 50, 77, .12);
}
.tb-title {
  font-family: $kai;
  font-size: 23rpx;
  letter-spacing: .3em;
  text-indent: .3em;
  color: $pencil;
  margin-bottom: 12rpx;
}
.tb-line { font-size: 26rpx; }
.tb-hl { color: $red; font-weight: 600; }
.tb-hint {
  font-family: $kai;
  font-size: 34rpx;
  letter-spacing: .12em;
  margin: 15rpx 0 8rpx;
  color: $ink;
}
.tb-foot { font-size: 21rpx; color: $pencil; }

.award-flex {
  display: flex;
  gap: 27rpx;
  align-items: center;
}
.award-info { flex: 1; min-width: 0; }
.award-owner {
  font-family: $kai;
  font-size: 29rpx;
  font-weight: 700;
  margin-bottom: 12rpx;
}
.award-cap {
  font-size: 23rpx;
  color: $pencil;
  margin-bottom: 10rpx;
}
.award-desc {
  font-size: 23rpx;
  color: $ink-soft;
  line-height: 1.7;
}
.award-empty {
  font-family: $kai;
  color: $pencil;
  font-size: 25rpx;
  line-height: 1.8;
  padding: 15rpx 0 23rpx;
}

.my-stat {
  display: flex;
  justify-content: center;
  gap: 46rpx;
  padding: 38rpx 0 8rpx;
}
.ms-item { text-align: center; }
.ms-num {
  font-family: $mono;
  font-size: 50rpx;
  font-weight: 700;
}
.ms-label {
  font-family: $kai;
  font-size: 23rpx;
  color: $ink-soft;
  letter-spacing: .2em;
  margin-top: 4rpx;
}
.power-line {
  text-align: center;
  font-family: $kai;
  color: $red;
  font-size: 27rpx;
  margin-top: 19rpx;
}

/* 海报卡 */
.poster {
  background: #fff;
  border: 3rpx solid $ink;
  border-radius: 15rpx;
  padding: 31rpx;
  box-shadow: 8rpx 8rpx 0 rgba(35, 50, 77, .15);
}
.p-brand {
  font-family: $kai;
  font-weight: 700;
  font-size: 33rpx;
  letter-spacing: .25em;
  .em { color: $red; }
}
.p-line {
  border-top: 3rpx dashed rgba(139, 139, 131, .5);
  margin: 19rpx 0;
}
.p-quote {
  font-family: $kai;
  font-size: 26rpx;
  line-height: 1.8;
  color: $ink-soft;
}
.p-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 23rpx;
}
.p-date {
  font-family: $mono;
  font-size: 19rpx;
  color: $pencil;
}
.qr-img {
  width: 88rpx;
  height: 88rpx;
  border: 5rpx solid $ink;
  border-radius: 8rpx;
  background: #fff;
}
.qr-fake {
  width: 88rpx;
  height: 88rpx;
  background:
    repeating-conic-gradient($ink 25%, #fff 0 50%, $ink 0 75%, #fff 0);
  background-size: 16rpx 16rpx;
  border: 5rpx solid $ink;
  border-radius: 8rpx;
}
.p-save { margin-top: 27rpx; }

.end-zone { margin-top: 31rpx; padding-bottom: 60rpx; }

.loading-hint {
  text-align: center;
  font-family: $kai;
  color: $pencil;
  padding-top: 123rpx;
  letter-spacing: .3em;
}

.poster-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 590rpx;
  height: 860rpx;
}
</style>
