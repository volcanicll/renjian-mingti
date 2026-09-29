<template>
  <view>
    <exam-topbar>
      <view class="brand">人间<text class="em">命题</text></view>
      <view class="meta">准考证 NO.{{ store.profile.examNo }}</view>
    </exam-topbar>

    <view class="page-body pb-extra">
      <!-- 加载失败：可重试 -->
      <view v-if="loadErr" class="sheet-card err-card">
        <view class="err-line">📕 网络开小差了，卷子没取回来</view>
        <button class="btn err-retry" @tap="refresh">再 试 一 次</button>
      </view>

      <!-- 口袋：存下今天想玩的题 -->
      <view class="pocket-strip" v-if="savedPrompts.length" @tap="pocketOpen = !pocketOpen">
        <text class="pk-icon">🖐</text>
        <view class="pk-mid">
          <view class="pk-label">口 袋 里 有 {{ savedPrompts.length }} 道 题</view>
          <view v-if="!pocketOpen" class="pk-sub">点开看，想玩哪道点哪道</view>
        </view>
        <text class="pk-arrow">{{ pocketOpen ? '收起 ▴' : '展开 ▾' }}</text>
      </view>
      <template v-if="pocketOpen">
        <view
          v-for="q in savedPrompts"
          :key="q.promptId"
          class="sheet-card pocket-item"
          @tap.stop="playPocket(q)"
        >
          <text class="pk-q-icon">🎟️</text>
          <view class="pk-q-mid">
            <view class="pk-q-text">{{ q.text }}</view>
            <view class="pk-q-sub">NO.{{ q.no }} · 点了就开局</view>
          </view>
          <text class="pk-q-x" @tap.stop="removePocket(q)">✕</text>
        </view>
      </template>

      <!-- 连击：连续作答天数 -->
      <view class="combo-strip" v-if="combo > 0">
        <text class="cs-num">{{ combo }}</text>
        <view class="cs-mid">
          <view class="cs-label">连 续 作 答 天 数</view>
          <view class="cs-sub">48 小时内再答一题就续上，断了从 1 重来</view>
        </view>
        <text class="cs-fire">🔥</text>
      </view>

      <!-- 今日必考 -->
      <view class="sheet-card holes today-card">
        <view class="exam-head">
          <text class="no">第 {{ today.no }} 题 · 每日一题</text>
          <text class="exam-badge">今日必考</text>
        </view>
        <view class="prompt-title">{{ today.text }}</view>
        <view class="prompt-note">用一张现场拍的照片回答，答对没有奖，答得离谱有。</view>
        <view class="seal-line">密 封 线 内 请 不 要 答 题</view>
        <view class="home-actions">
          <button class="btn btn-primary act" @tap="openCreate">开始一局</button>
          <button class="btn act" @tap="saveToday">先存着</button>
        </view>
      </view>

      <!-- 进行中的局 -->
      <view class="sec-label">
        进行中的局 <text class="sub">{{ myRounds.length }} GAMES</text>
      </view>
      <template v-if="myRounds.length">
        <view
          v-for="r in myRounds"
          :key="r.roundId"
          class="sheet-card round-item"
          @tap="goRound(r)"
        >
          <text class="emoji">{{ r.emoji }}</text>
          <view class="info">
            <view class="rname">{{ r.ownerName }}发起 ·「{{ r.promptText }}」</view>
            <view class="rsub">
              已交卷 {{ r.submittedCount }}/{{ r.playerCount }} ·
              {{ r.status === 'shooting' ? '剩余 ' + fmtLeft(r.deadlineTs) : '待揭晓' }}
            </view>
          </view>
          <text class="go">{{ r.status === 'shooting' ? '进入 ›' : '揭晓 ›' }}</text>
        </view>
      </template>
      <view v-else-if="!loaded" class="empty-line">正在翻你的考卷…</view>
      <view v-else class="empty-line" @tap="openCreate">
        还没有局。点这里开一局，扔一个题进群里，比如「拍下你此刻的表情」。<text class="empty-go">›</text>
      </view>

      <!-- 昨日战报 -->
      <template v-if="report">
        <view class="sec-label">
          昨日战报 <text class="sub">YESTERDAY</text>
        </view>
        <view class="sheet-card report-card">
          <view class="report-prompt">命题：「{{ report.promptText }}」</view>
          <view class="report-lines">
            <!-- best / lazy 各自可能为空：某一奖项无人投票时服务端会返回 null，
                 不能直接取 .ownerName，否则首页整页渲染报错 -->
            <view v-if="report.best">🏆 最绝奖 · {{ report.best.ownerName }}的<text class="tag-hl">「{{ report.best.caption }}」</text></view>
            <view v-if="report.lazy">🍬 最敷衍奖 · {{ report.lazy.ownerName }}的「{{ report.lazy.caption }}」</view>
            <view v-if="!report.best && !report.lazy">上一局没人投票，奖项空缺。</view>
          </view>
        </view>
      </template>

      <!-- 明日预告：悬念召回 -->
      <template v-if="nextTeaser">
        <view class="sec-label">明日预告 <text class="sub">TOMORROW</text></view>
        <view class="sheet-card teaser-card" @tap="subscribeTomorrow">
          <view class="ts-line">明日出题人 · <text class="ts-hl">{{ nextTeaser.ownerName }}</text></view>
          <view class="ts-hint">下题提示：{{ nextTeaser.hint }}</view>
          <view class="ts-foot">{{ nextTeaser.mine ? '轮到你了 —— 该想题了' : '预约提醒，明天别缺席' }} ›</view>
        </view>
      </template>
    </view>

    <!-- 开局弹层 -->
    <exam-sheet :show="createShow" @close="createShow = false">
      <view class="cr-title">开新的一局</view>
      <view class="cr-sub">选出题方式，发到群里就开学。</view>
      <view class="opt-row">
        <view
          v-for="o in opts"
          :key="o.key"
          class="opt"
          :class="{ sel: source === o.key }"
          @tap="pickSource(o.key)"
        >
          {{ o.label }}
          <text class="opt-small">{{ o.small }}</text>
        </view>
      </view>
      <input
        v-if="source === 'custom'"
        v-model="customText"
        class="cr-input"
        placeholder="输入你的命题，例：拍下'等一下'"
        placeholder-class="cr-ph"
        maxlength="30"
        cursor-spacing="24"
        confirm-type="done"
      />
      <view v-if="source === 'custom'" class="cr-count">{{ customText.length }}/30</view>
      <view v-if="source === 'ai'" class="ai-box" @tap="genAiPrompt">
        <template v-if="aiLoading">
          <text class="ai-text">AI 正在想一个损的…</text>
        </template>
        <template v-else-if="aiText">
          <view class="ai-quote">{{ aiText }}</view>
          <text class="ai-again">换一题 ↻</text>
        </template>
      </view>
      <view class="mode-title">这一局开多久</view>
      <view class="mode-row">
        <view
          v-for="m in modes"
          :key="m.key"
          class="mode"
          :class="{ sel: mode === m.key }"
          @tap="mode = m.key"
        >
          {{ m.label }}
          <text class="mode-small">{{ m.small }}</text>
        </view>
      </view>

      <button class="btn btn-primary cr-go" :disabled="creating" @tap="startRound">发 卷</button>
      <view class="cr-foot">
        {{ mode === 'flash' ? '闪电局 2 小时 · 人齐即开卷 · 拍不出来可交白卷' : '长夜局 24 小时 · 慢工出荒诞' }}
        <block v-if="mode === 'flash'"> · 人多热闹，人少会混一张卧底作品</block>
      </view>
    </exam-sheet>

    <exam-tabbar active="home" />
    <exam-toast />
    <exam-privacy />
  </view>
</template>

<script>
import api from '@/api'
import { toast } from '@/composables/useToast'
import { store, bootstrap } from '@/store'
import { fmtLeft } from '@/utils/format'
import { goNav } from '@/utils/nav'

export default {
  data() {
    // tab 切回首页时页面会重新挂载，data 会回到初始值 —— 先用 store 里的缓存填充，
    // 保证第一帧就是上次的内容，而不是「还没有局」这种假空状态。
    const boot = store.boot
    return {
      store,
      today: (boot && boot.today) || { promptId: 0, no: 0, text: '……' },
      myRounds: (boot && boot.myRounds) || [],
      report: (boot && boot.yesterdayReport) || null,
      loaded: !!boot,
      loadErr: false,
      createShow: false,
      source: 'official',
      mode: 'flash',
      customText: '',
      aiText: '',
      aiLoading: false,
      creating: false,
      nextTeaser: (boot && boot.nextTeaser) || null,
      savedPrompts: (boot && boot.savedPrompts) || [],
      pocketOpen: false,
      opts: [
        { key: 'official', label: '官方今日题', small: '今日命题' },
        { key: 'ai', label: 'AI 代出', small: '帮你想个损的' },
        { key: 'custom', label: '自己出', small: '当一回老师' }
      ],
      modes: [
        { key: 'flash', label: '⚡ 闪电局', small: '2 小时 · 一群人现挂' },
        { key: 'overnight', label: '🌙 长夜局', small: '24 小时 · 白天才出片' }
      ]
    }
  },
  computed: {
    combo() {
      const s = this.store.profile && this.store.profile.stats
      return (s && s.combo) || 0
    }
  },
  onShow() {
    this.refresh()
  },
  onPullDownRefresh() {
    this.refresh().finally(() => uni.stopPullDownRefresh())
  },
  onLoad(query) {
    // 结算页「用出题权 · 再来一局」会带 open=create 跳回首页
    if (query && query.open === 'create') this.createShow = true
  },
  methods: {
    toast,
    fmtLeft,
    async refresh() {
      try {
        // force=true：回到首页要能看到别人新建的局。
        // 但页面第一帧已经用 store.boot 渲染过了，所以这次请求不会造成白屏。
        const d = await bootstrap(true)
        this.today = d.today
        this.myRounds = d.myRounds || []
        this.savedPrompts = d.savedPrompts || []
        this.report = d.yesterdayReport
        this.nextTeaser = d.nextTeaser || null
        this.loaded = true
        this.loadErr = false
      } catch (e) {
        // 首次加载失败给重试入口；已有缓存时静默，下次 onShow 重试
        if (!this.loaded) this.loadErr = true
      }
    },
    async saveToday() {
      try {
        const list = await api.savePrompt({
          promptId: this.today.promptId,
          no: this.today.no,
          text: this.today.text
        })
        this.savedPrompts = list
        toast('已抄进口袋，想玩的时候再开')
      } catch (e) {
        toast(e.message || '没存上，再试一次')
      }
    },
    async removePocket(q) {
      this.savedPrompts = await api.unsavePrompt(q.promptId)
      if (!this.savedPrompts.length) this.pocketOpen = false
    },
    playPocket(q) {
      this.source = 'custom'
      this.customText = q.text
      this.mode = 'flash'
      this.createShow = true
    },
    goRound(r) {
      const url =
        r.status === 'shooting'
          ? '/pages/round/index?roundId=' + r.roundId
          : r.status === 'revealing'
            ? '/pages/wall/index?roundId=' + r.roundId
            : '/pages/result/index?roundId=' + r.roundId
      goNav(url)
    },
    openCreate() {
      this.source = 'official'
      this.mode = 'flash'
      this.customText = ''
      this.aiText = ''
      this.createShow = true
    },
    subscribeTomorrow() {
      api.requestSubscribe(['YOUR_TURN'])
      toast(this.nextTeaser && this.nextTeaser.mine ? '记住了 —— 明天你来出题' : '约好了，明天开考会叫你')
    },
    pickSource(key) {
      this.source = key
      if (key === 'ai' && !this.aiText && !this.aiLoading) this.genAiPrompt()
    },
    genAiPrompt() {
      if (this.aiLoading) return
      this.aiLoading = true
      api.generateAiPrompt()
        .then((r) => { this.aiText = r.text })
        .catch((e) => toast(e.message || 'AI 出题失败'))
        .finally(() => { this.aiLoading = false })
    },
    async startRound() {
      if (this.creating) return
      if (this.source === 'custom' && !this.customText.trim()) {
        toast('题不能是空白卷啊')
        return
      }
      if (this.source === 'ai' && !this.aiText) {
        toast('等 AI 把题想出来')
        return
      }
      this.creating = true
      uni.showLoading({ title: '发卷中…', mask: true })
      try {
        const round = await api.createRound({
          source: this.source,
          text: this.source === 'ai' ? this.aiText : this.customText,
          mode: this.mode
        })
        uni.hideLoading()
        this.createShow = false
        toast('卷子已发到群里')
        setTimeout(() => {
          uni.reLaunch({ url: '/pages/round/index?roundId=' + round.roundId })
        }, 400)
      } catch (e) {
        uni.hideLoading()
        toast(e.message || '发卷失败')
      } finally {
        this.creating = false
      }
    }
  },
  onShareAppMessage() {
    return {
      title: `「${this.today.text}」——来，用一张照片回答`,
      path: '/pages/home/index'
    }
  }
}
</script>

<style lang="scss" scoped>
.pb-extra { padding-bottom: 140rpx; }  /* tabbar 约 110rpx，多留一点呼吸感 */

.today-card { padding: 31rpx 31rpx 27rpx 61rpx; }

/* 口袋 */
.pocket-strip {
  display: flex;
  align-items: center;
  gap: 19rpx;
  background: $hi;
  border: 3rpx solid $ink;
  border-radius: 15rpx;
  padding: 19rpx 27rpx;
  margin-bottom: 19rpx;
  box-shadow: 6rpx 6rpx 0 rgba(214, 72, 47, .18);
}
.pk-icon { font-size: 38rpx; }
.pk-mid { flex: 1; min-width: 0; }
.pk-label {
  font-family: $kai;
  font-size: 23rpx;
  letter-spacing: .2em;
  font-weight: 700;
}
.pk-sub {
  font-size: 20rpx;
  color: rgba(35,50,77,.66);
  margin-top: 6rpx;
  line-height: 1.5;
}
.pk-arrow {
  font-family: $mono;
  font-size: 20rpx;
  color: rgba(35,50,77,.55);
}
.pocket-item {
  display: flex;
  align-items: center;
  gap: 23rpx;
  padding: 21rpx 23rpx 21rpx 34rpx;
  margin-bottom: 19rpx;
}
.pk-q-icon { font-size: 38rpx; }
.pk-q-mid { flex: 1; min-width: 0; }
.pk-q-text {
  font-weight: 600;
  font-size: 26rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pk-q-sub {
  font-size: 20rpx;
  color: $pencil;
  margin-top: 6rpx;
  font-family: $mono;
}
.pk-q-x {
  font-family: $mono;
  font-size: 27rpx;
  color: $pencil;
  padding: 8rpx 12rpx;
  &:active { opacity: .5; }
}

/* 连击条 */
.combo-strip {
  display: flex;
  align-items: center;
  gap: 19rpx;
  background: #fff;
  border: 3rpx solid $ink;
  border-radius: 15rpx;
  padding: 19rpx 27rpx;
  margin-bottom: 19rpx;
  box-shadow: 6rpx 6rpx 0 rgba(214, 72, 47, .18);
}
.cs-num {
  font-family: $mono;
  font-size: 58rpx;
  font-weight: 700;
  color: $red;
  line-height: 1;
}
.cs-mid { flex: 1; min-width: 0; }
.cs-label {
  font-family: $kai;
  font-size: 23rpx;
  letter-spacing: .2em;
}
.cs-sub {
  font-size: 20rpx;
  color: $pencil;
  margin-top: 6rpx;
  line-height: 1.5;
}
.cs-fire { font-size: 38rpx; }

/* 明日预告 */
.teaser-card { padding: 25rpx 27rpx 25rpx 54rpx; }
.ts-line { font-size: 26rpx; }
.ts-hl { color: $red; font-weight: 600; }
.ts-hint {
  font-family: $kai;
  font-size: 30rpx;
  letter-spacing: .1em;
  margin: 12rpx 0 8rpx;
  color: $ink-soft;
}
.ts-foot {
  font-size: 21rpx;
  color: $pencil;
}
.home-actions {
  padding: 27rpx 8rpx 8rpx;
  display: flex;
  gap: 19rpx;
  .act { flex: 1; margin: 0; }
}

.round-item {
  display: flex;
  align-items: center;
  gap: 23rpx;
  padding: 25rpx 27rpx 25rpx 50rpx;
  margin-bottom: 19rpx;
}
.emoji { font-size: 46rpx; }
.info { flex: 1; min-width: 0; }
.rname {
  font-weight: 600;
  font-size: 28rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rsub {
  font-size: 22rpx;
  color: $pencil;
  margin-top: 6rpx;
  font-family: $mono;
}
.go { color: $red; font-family: $kai; font-size: 25rpx; letter-spacing: .1em; }

.empty-line {
  padding: 15rpx 8rpx;
  font-family: $kai;
  color: $pencil;
  font-size: 25rpx;
  letter-spacing: .1em;
  .empty-go { color: $red; font-weight: 700; }
  &:active { opacity: .6; }
}

/* 加载失败重试卡 */
.err-card {
  padding: 35rpx 27rpx;
  text-align: center;
}
.err-line {
  font-family: $kai;
  font-size: 26rpx;
  color: $ink-soft;
  margin-bottom: 23rpx;
  letter-spacing: .1em;
}
.err-retry { width: 60%; margin: 0 auto; }

.report-card { padding: 25rpx 27rpx 25rpx 54rpx; }
.report-prompt {
  font-size: 23rpx;
  color: $pencil;
  margin-bottom: 12rpx;
}
.report-lines {
  font-size: 26rpx;
  line-height: 1.7;
}

/* 开局弹层 */
.cr-title {
  font-family: $kai;
  font-weight: 700;
  font-size: 37rpx;
  letter-spacing: .15em;
  margin-bottom: 8rpx;
}
.cr-sub { font-size: 23rpx; color: $pencil; margin-bottom: 8rpx; }
.opt-row { display: flex; gap: 19rpx; margin: 23rpx 0 8rpx; }
.opt {
  flex: 1;
  border: 3rpx solid $ink;
  border-radius: 15rpx;
  background: #fff;
  padding: 23rpx 15rpx;
  text-align: center;
  font-size: 25rpx;
  font-weight: 600;
  transition: transform .1s, box-shadow .1s, background .15s, color .15s;
  &:active { transform: scale(.96); }
}
.opt-small {
  display: block;
  font-weight: 400;
  font-size: 20rpx;
  color: $pencil;
  margin-top: 8rpx;
  font-family: $mono;
}
/* 选中：深蓝底 + 红投影，与主按钮同一套语言，边界不再糊在一起 */
.opt.sel {
  background: $ink;
  color: $paper;
  box-shadow: 5rpx 5rpx 0 rgba(214, 72, 47, .75);
}
.opt.sel .opt-small { color: rgba(250, 247, 239, .78); }

.cr-input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 19rpx;
  padding: 21rpx 23rpx;
  border: 3rpx solid $ink;
  border-radius: 15rpx;
  background: #fff;
  font-size: 27rpx;
  /* 原生 input 没有默认行高，显式给出，避免不同机型高度不一致 */
  height: 88rpx;
  line-height: 44rpx;
}
.cr-count {
  text-align: right;
  font-family: $mono;
  font-size: 19rpx;
  color: $pencil;
  margin-top: 8rpx;
  padding-right: 4rpx;
}

.ai-box { margin-top: 19rpx; min-height: 60rpx; }
.ai-text {
  font-family: $kai;
  color: $pencil;
  font-size: 25rpx;
}
.ai-quote {
  font-family: $kai;
  color: $ink-soft;
  font-size: 27rpx;
  line-height: 1.8;
  border-left: 6rpx solid $red;
  padding-left: 19rpx;
}
.ai-again {
  display: inline-block;
  font-family: $kai;
  color: $red;
  font-size: 23rpx;
  margin-top: 12rpx;
}

.mode-title {
  font-family: $kai;
  font-size: 23rpx;
  letter-spacing: .15em;
  color: $ink-soft;
  margin-top: 27rpx;
}
.mode-row { display: flex; gap: 19rpx; margin: 15rpx 0 8rpx; }
.mode {
  flex: 1;
  border: 3rpx dashed $ink;
  border-radius: 15rpx;
  background: #fff;
  padding: 19rpx 15rpx;
  text-align: center;
  font-size: 25rpx;
  font-weight: 600;
  transition: transform .1s, background .15s, border-style .15s;
  &:active { transform: scale(.96); }
}
.mode-small {
  display: block;
  font-weight: 400;
  font-size: 20rpx;
  color: $pencil;
  margin-top: 6rpx;
  font-family: $mono;
}
.mode.sel {
  border-style: solid;
  background: $hi;
  box-shadow: 5rpx 5rpx 0 rgba(201, 169, 58, .55);
}
/* 荧光黄底上灰字发虚，压深一档 */
.mode.sel .mode-small { color: rgba(35, 50, 77, .78); }

.cr-go { margin-top: 27rpx; }
.cr-foot {
  font-size: 21rpx;
  color: $pencil;
  text-align: center;
  margin-top: 19rpx;
}
</style>

<!-- 非 scoped：placeholder-class 是原生 input 内部的伪节点，
     拿不到 scoped 的 data-v 属性，必须写在全局样式里才生效 -->
<style lang="scss">
.cr-ph { color: $pencil; font-size: 27rpx; }
</style>
