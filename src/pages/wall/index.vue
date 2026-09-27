<template>
  <view>
    <exam-topbar>
      <view class="brand wb">揭晓墙</view>
      <view class="meta">匿名阅卷中 · 作者保密</view>
    </exam-topbar>

    <view class="page-body" v-if="loaded">
      <view class="w-progress">
        <text class="w-total">共 {{ total }} 份答卷</text>
        <text class="w-cnt">已审 {{ reviewed }}/{{ total }}</text>
      </view>
      <view class="w-bar">
        <view class="w-bar-in" :style="{ width: barPct + '%' }" />
      </view>

      <view v-if="hasUndercover" class="uc-banner">
        🕵️ 本局人少，混进了 1 张往届作品 —— 猜中它算你本事
      </view>

      <view v-if="entries.length" class="wall-grid">
        <view
          v-for="(e, i) in entries"
          :key="e.entryId"
          class="wall-card"
          :style="{ transform: 'rotate(' + tiltOf(i) + 'deg)' }"
          @tap="openDetail(i)"
        >
          <polaroid-photo
            :image="e.image"
            :emoji="e.emoji || '📷'"
            :c1="e.c1"
            :c2="e.c2"
            :caption="e.caption"
            width="100%"
            ph-height="207rpx"
            :tape="i % 3 !== 1"
          />
          <view v-if="e.myVote" class="voted-mark">已批注</view>
        </view>
      </view>
      <view v-else class="w-empty">答卷都跑题被拦下了。荒诞今天缺席。</view>

      <view class="w-actions">
        <button class="btn btn-primary" @tap="tryResult">完成阅卷 · 去看结果</button>
        <button class="btn w-skip" @tap="goResult(true)">直接去看结果</button>
      </view>
    </view>

    <!-- 答卷详情弹层 -->
    <exam-sheet :show="detailShow" @close="detailShow = false">
      <template v-if="cur">
        <view class="d-nav">
          <text class="d-nav-btn" :class="{ off: curIdx <= 0 }" @tap="stepDetail(-1)">‹ 上一张</text>
          <text class="d-nav-idx">第 {{ curIdx + 1 }} / {{ entries.length }} 张</text>
          <text class="d-nav-btn" :class="{ off: curIdx >= entries.length - 1 }" @tap="stepDetail(1)">下一张 ›</text>
        </view>
        <view class="d-photo">
          <polaroid-photo
            :image="cur.image"
            :emoji="cur.emoji || '📷'"
            :c1="cur.c1"
            :c2="cur.c2"
            :caption="cur.caption"
            width="403rpx"
            ph-height="365rpx"
          />
        </view>

        <template v-if="!cur.isMine">
          <view class="d-guess-title">猜 猜 这 是 谁 拍 的</view>
          <view class="guess-row">
            <view
              v-for="p in players"
              :key="p.openid"
              class="guess"
              :class="guessClass(p)"
              @tap="pickGuess(p)"
            >
              <text class="face">{{ p.avatar }}</text>
              <text>{{ p.nickname }}</text>
            </view>
          </view>
          <view v-if="cur.aiVerdict === 'suspect'" class="judge-ai">
            AI 判词：{{ cur.aiReason }}（存疑放行，交给你们裁决）
          </view>
          <view class="judge-line">{{ judgeLine }}</view>
        </template>
        <view v-else class="mine-hint">（这是你自己的答卷）</view>

        <view class="vote-row">
          <button
            class="vote-btn best"
            :class="{ sel: cur.myVote === 'best' }"
            @tap="castVote('best')"
          >🏆 最绝</button>
          <button
            class="vote-btn lazy"
            :class="{ sel: cur.myVote === 'lazy' }"
            @tap="castVote('lazy')"
          >🍬 最敷衍</button>
          <button
            class="vote-btn quote"
            :class="{ sel: cur.myVote === 'quote' }"
            @tap="castVote('quote')"
          >📝 金句</button>
        </view>
        <button class="btn d-close" @tap="detailShow = false">关闭，继续阅卷</button>
      </template>
    </exam-sheet>

    <exam-toast />
    <exam-privacy />
  </view>
</template>

<script>
import api from '@/api'
import { toast } from '@/composables/useToast'
import { haptic } from '@/utils/haptic'
import { goRedir } from '@/utils/nav'

export default {
  data() {
    return {
      roundId: '',
      loaded: false,
      total: 0,
      reviewed: 0,
      entries: [],
      players: [],
      hasUndercover: false,
      detailShow: false,
      curIdx: -1,
      // 本地猜人结果：entryId -> { openid, correct, actualName }
      guessLocal: {}
    }
  },
  computed: {
    cur() { return this.curIdx >= 0 ? this.entries[this.curIdx] : null },
    barPct() {
      if (!this.total) return 0
      return Math.min(100, Math.round((this.reviewed / this.total) * 100))
    },
    judgeLine() {
      if (!this.cur) return ''
      const g = this.guessLocal[this.cur.entryId]
      if (!g) return '点一位同学，看看你懂不懂他。'
      return g.correct ? `眼力可以——就是 ${g.actualName} 拍的。` : '不是这位，再看看别人。'
    }
  },
  onLoad(query) {
    this.roundId = query.roundId || ''
    this.load()
  },
  methods: {
    toast,
    tiltOf(i) { return (i % 2 ? 1 : -1) * (1 + (i % 3)) },
    async load() {
      try {
        const w = await api.getWall(this.roundId)
        this.total = w.total
        this.reviewed = w.reviewed
        this.hasUndercover = !!w.hasUndercover
        this.players = w.players || []
        this.entries = (w.entries || []).map((e) => ({
          ...e,
          myGuess: e.myGuess || null
        }))
        // 还原已猜过的状态
        this.entries.forEach((e) => {
          if (e.myGuess && e.myGuess.correct) {
            const owner = this.resolveName(e.myGuess)
            this.guessLocal[e.entryId] = { openid: e.myGuess.openid, correct: true, actualName: owner || '' }
          } else if (e.myGuess) {
            this.guessLocal[e.entryId] = { openid: e.myGuess.openid, correct: false }
          }
        })
        this.loaded = true
      } catch (err) {
        toast(err.message || '还开不了卷')
        setTimeout(() => uni.navigateBack(), 1200)
      }
    },
    resolveName(myGuess) {
      const p = this.players.find((x) => x.openid === myGuess.openid)
      return p ? p.nickname : '这位同学'
    },
    guessClass(p) {
      if (!this.cur) return ''
      const openid = p.openid
      const g = this.guessLocal[this.cur.entryId]
      if (!g) return p.undercover ? 'uc' : ''
      if (g.correct && g.openid === openid) return 'right'
      if (!g.correct && g.openid === openid) return 'wrong'
      return p.undercover ? 'uc' : ''
    },
    async pickGuess(p) {
      const e = this.cur
      if (!e) return
      const g = this.guessLocal[e.entryId]
      if (g && g.correct) return // 猜对即锁定
      try {
        const r = await api.guess(this.roundId, e.entryId, p.openid)
        if (r.correct) {
          haptic('medium')
          this.guessLocal[e.entryId] = { openid: p.openid, correct: true, actualName: r.actualName }
          toast(`猜对了，是 ${r.actualName}`)
        } else {
          this.guessLocal[e.entryId] = { openid: p.openid, correct: false }
        }
        this.refreshJudgeLine()
      } catch (err) {
        toast(err.message || '猜人失败')
      }
    },
    refreshJudgeLine() {
      // 触发视图更新（guessLocal 非响应式新增键的兜底）
      this.guessLocal = { ...this.guessLocal }
    },
    async castVote(tag) {
      const e = this.cur
      if (!e) return
      try {
        await api.vote(this.roundId, e.entryId, tag)
        const wasVoted = !!e.myVote
        e.myVote = tag
        if (!wasVoted) this.reviewed += 1
        haptic('medium')
        const label = tag === 'best' ? '🏆 最绝' : tag === 'lazy' ? '🍬 最敷衍' : '📝 金句'
        // 首次批注 → 自动跳到下一张未审的，连续阅卷不用反复开关弹层
        if (!wasVoted) {
          const next = this.nextUnreviewed()
          if (next >= 0) {
            this.curIdx = next
            toast(`已批注：${label} · 自动翻开下一张`)
          } else {
            this.detailShow = false
            toast('全部阅卷完成，去看结果 🎉')
          }
        } else {
          this.detailShow = false
          toast('批注已改：' + label)
        }
      } catch (err) {
        toast(err.message || '批注失败')
      }
    },
    /** 从当前位置往后（环形）找第一张未批注的答卷 */
    nextUnreviewed() {
      const n = this.entries.length
      if (!n) return -1
      for (let step = 1; step <= n; step++) {
        const i = (this.curIdx + step) % n
        if (!this.entries[i].myVote) return i
      }
      return -1
    },
    /** 弹层内手动翻上一张/下一张 */
    stepDetail(dir) {
      const i = this.curIdx + dir
      if (i < 0 || i >= this.entries.length) return
      haptic('light')
      this.curIdx = i
    },
    openDetail(i) {
      haptic('light')
      this.curIdx = i
      this.detailShow = true
    },
    tryResult() {
      if (this.total > 0 && this.reviewed < this.total) {
        toast(`还有 ${this.total - this.reviewed} 张答卷没审`)
        return
      }
      this.goResult()
    },
    goResult() {
      goRedir('/pages/result/index?roundId=' + this.roundId)
    }
  }
}
</script>

<style lang="scss" scoped>
.wb { font-size: 35rpx; }

.w-progress {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4rpx 8rpx 23rpx;
}
.w-total {
  font-family: $kai;
  font-size: 25rpx;
  letter-spacing: .2em;
}
.w-cnt {
  font-family: $mono;
  font-size: 23rpx;
  color: $red;
  font-weight: 700;
}

/* 阅卷进度条 */
.w-bar {
  height: 10rpx;
  background: rgba(139, 139, 131, .2);
  border-radius: 5rpx;
  overflow: hidden;
  margin: 0 8rpx 23rpx;
}
.w-bar-in {
  height: 100%;
  background: $red;
  border-radius: 5rpx;
  transition: width .4s ease;
}

.wall-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 31rpx 27rpx;
  padding-bottom: 35rpx;
}
.wall-card {
  position: relative;
  transition: transform .12s;
  &:active { transform: scale(.97) !important; }
}
.voted-mark {
  position: absolute;
  top: -8rpx;
  right: 6rpx;
  font-family: $kai;
  font-size: 20rpx;
  color: #fff;
  background: $red;
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
  letter-spacing: .1em;
  z-index: 3;
}
.w-empty {
  text-align: center;
  font-family: $kai;
  color: $pencil;
  padding: 62rpx 0;
}

.w-actions { padding-bottom: 60rpx; }
.w-skip { margin-top: 19rpx; }

/* 详情弹层 */
.d-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8rpx;
  margin-bottom: 12rpx;
}
.d-nav-btn {
  font-family: $kai;
  font-size: 24rpx;
  color: $red;
  padding: 8rpx 12rpx;
  &:active { opacity: .6; }
  &.off { color: $pencil; opacity: .4; pointer-events: none; }
}
.d-nav-idx {
  font-family: $mono;
  font-size: 20rpx;
  color: $pencil;
}
.d-photo { display: flex; justify-content: center; margin-top: 8rpx; }
.d-guess-title {
  font-family: $kai;
  font-size: 25rpx;
  letter-spacing: .25em;
  text-align: center;
  margin-top: 27rpx;
  color: $ink-soft;
}
.guess-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 15rpx;
  margin: 27rpx 0 12rpx;
}
.guess {
  width: calc((100% - 45rpx) / 4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 11rpx;
  background: #fff;
  border: 3rpx solid $ink;
  border-radius: 19rpx;
  padding: 19rpx 8rpx 15rpx;
  font-size: 23rpx;
  font-weight: 600;
}
.guess.uc {
  border-style: dashed;
  border-color: $red;
  color: $red;
}
.face { font-size: 50rpx; }
.guess.right {
  background: $ok-bg;
  border-color: $ok-green;
  color: #2C5A29;
}
.guess.wrong {
  animation: shake .3s;
  border-color: $red;
  color: $red;
  opacity: .6;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-10rpx); }
  75% { transform: translateX(10rpx); }
}
.judge-ai {
  font-size: 22rpx;
  color: $pencil;
  line-height: 1.7;
  margin-top: 15rpx;
}
.judge-line {
  font-size: 23rpx;
  color: $ink-soft;
  margin-top: 10rpx;
  line-height: 1.7;
  min-height: 38rpx;
}
.mine-hint {
  text-align: center;
  font-family: $kai;
  color: $pencil;
  font-size: 23rpx;
  margin: 23rpx 0 4rpx;
}

.vote-row { display: flex; gap: 19rpx; margin-top: 27rpx; }
.vote-btn {
  flex: 1;
  padding: 21rpx;
  border-radius: 17rpx;
  border: 3rpx solid $ink;
  background: #fff;
  font-family: $kai;
  font-size: 28rpx;
  letter-spacing: .15em;
  font-weight: 700;
  line-height: 1.4;
  &::after { border: none; }
}
.vote-btn.best.sel {
  background: $red;
  border-color: $red-deep;
  color: #fff;
}
.vote-btn.lazy.sel {
  background: $hi;
  border-color: #C9A93A;
  color: $ink;
}
.vote-btn.quote.sel {
  background: $ink;
  border-color: $ink;
  color: $paper;
}
.vote-row { display: flex; gap: 12rpx; margin-top: 27rpx; }
.vote-btn { font-size: 24rpx; padding: 19rpx 8rpx; }

.uc-banner {
  background: #FFF6E5;
  border: 3rpx dashed #C9A93A;
  border-radius: 15rpx;
  padding: 19rpx 23rpx;
  font-family: $kai;
  font-size: 23rpx;
  color: #7A5C14;
  line-height: 1.7;
  margin-bottom: 19rpx;
}
.d-close { margin-top: 27rpx; }
</style>
