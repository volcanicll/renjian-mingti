<template>
  <view>
    <exam-topbar>
      <view class="brand mb">我的</view>
      <view class="meta">学号 NO.{{ store.profile.examNo }}</view>
    </exam-topbar>

    <view class="page-body me-body">
      <!-- 资料卡 -->
      <view class="sheet-card profile-card">
        <view class="avatar-box">
          <image v-if="isUrl(store.profile.avatar)" class="avatar-img" :src="store.profile.avatar" mode="aspectFill" />
          <text v-else class="avatar-emoji">{{ store.profile.avatar }}</text>
        </view>
        <view class="p-info">
          <view class="p-name">{{ store.profile.nickname }}</view>
          <view class="p-line">
            战绩：最绝 {{ store.profile.stats.best }} · 最敷衍 {{ store.profile.stats.lazy }} · 出题权 {{ store.profile.stats.power }}
          </view>
        </view>
        <text class="p-edit" @tap="openEdit">编辑</text>
      </view>

      <!-- 战绩统计 -->
      <view class="sheet-card mastery-stat">
        <view class="m-item">
          <view class="m-num red">{{ store.profile.stats.best }}</view>
          <view class="m-label">最 绝 奖</view>
        </view>
        <view class="m-item">
          <view class="m-num">{{ store.profile.stats.lazy }}</view>
          <view class="m-label">最 敷 衍 奖</view>
        </view>
        <view class="m-item">
          <view class="m-num">{{ store.profile.stats.power }}</view>
          <view class="m-label">出 题 权</view>
        </view>
      </view>

      <!-- 考场须知 -->
      <view class="sec-label">考场须知 <text class="sub">RULES</text></view>
      <view class="sheet-card rules-box">
        <view class="row-item" @tap="toast('出题权：赢一局得一次，明天的题由你出')">
          <text>我的出题权</text>
          <text class="arr">{{ store.profile.stats.power }} 张 ›</text>
        </view>
        <view class="row-item" @tap="goRules">
          <text>考试说明</text>
          <text class="arr">›</text>
        </view>
        <view class="row-item" @tap="reportEntry">
          <text>举报一张答卷</text>
          <text class="arr">›</text>
        </view>
      </view>

      <view class="version-line">人间命题 v1.0 · 满分 0 分</view>
    </view>

    <!-- 编辑资料弹层 -->
    <exam-sheet :show="editShow" @close="editShow = false">
      <view class="e-title">改一下门面上的字</view>
      <input
        v-model="editName"
        class="e-input"
        type="nickname"
        placeholder="你的称呼"
        placeholder-class="e-ph"
        maxlength="12"
        cursor-spacing="24"
        confirm-type="done"
      />
      <button class="btn e-avatar-btn" open-type="chooseAvatar" @chooseavatar="onAvatar">用微信头像</button>
      <view v-if="isDemo" class="e-emoji-row">
        <text
          v-for="em in emojiList"
          :key="em"
          class="e-emoji"
          :class="{ sel: editAvatar === em }"
          @tap="editAvatar = em"
        >{{ em }}</text>
      </view>
      <button class="btn btn-primary e-save" @tap="saveProfile">保存</button>
    </exam-sheet>

    <exam-tabbar active="me" />
    <exam-toast />
    <exam-privacy />
  </view>
</template>

<script>
import api, { isDemo } from '@/api'
import { toast } from '@/composables/useToast'
import { store, bootstrap } from '@/store'
import { goNav } from '@/utils/nav'

export default {
  data() {
    return {
      store,
      isDemo,
      editShow: false,
      editName: '',
      editAvatar: '',
      emojiList: ['😎', '🐔', '🐱', '🦊', '🐰', '🐻', '🦉', '🐙']
    }
  },
  onShow() {
    if (!store.booted) {
      bootstrap().catch(() => {})
    }
  },
  methods: {
    toast,
    isUrl(v) { return /^https?:|^cloud:|wxfile:|blob:/.test(v || '') },
    goRules() {
      goNav('/pages/rules/index')
    },
    reportEntry() {
      // 举报必须真的落库：UGC 类目审核要求有效的内容审核通道，
      // 只弹个框把用户填的内容丢掉，等于没有举报入口。
      // 这里提交到云函数 reports 集合，管理员在云开发控制台处理。
      uni.showModal({
        title: '举报一张答卷',
        content: '简单说明情况，老师会处理的。',
        editable: true,
        placeholderText: '哪张答卷、什么问题',
        success: async (r) => {
          if (!r.confirm) return
          const reason = (r.content || '').trim()
          if (reason.length < 2) {
            toast('简单说明一下情况，老师才知道怎么处理')
            return
          }
          try {
            await api.reportEntry({ reason })
            toast('已收到，老师会处理的')
          } catch (e) {
            toast(e.message || '提交失败，再试一次')
          }
        }
      })
    },
    openEdit() {
      this.editName = this.store.profile.nickname
      this.editAvatar = this.isUrl(this.store.profile.avatar) ? '' : this.store.profile.avatar
      this.editShow = true
    },
    onAvatar(e) {
      const url = e.detail && e.detail.avatarUrl
      if (url) this.editAvatar = url
    },
    async saveProfile() {
      const patch = {}
      if (this.editName.trim()) patch.nickname = this.editName.trim()
      if (this.editAvatar) patch.avatar = this.editAvatar
      if (!Object.keys(patch).length) {
        toast('什么都没改哦')
        return
      }
      try {
        const p = await api.updateProfile(patch)
        Object.assign(this.store.profile, p || patch)
        this.editShow = false
        toast('改好了')
      } catch (e) {
        toast(e.message || '没改成，再试试')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.mb { font-size: 35rpx; }
.me-body { padding-bottom: 200rpx; }

.profile-card {
  display: flex;
  align-items: center;
  gap: 23rpx;
  padding: 31rpx;
}
.avatar-box {
  width: 115rpx;
  height: 115rpx;
  border-radius: 50%;
  background: #fff;
  border: 3rpx solid $ink;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex: none;
}
.avatar-img { width: 100%; height: 100%; }
.avatar-emoji { font-size: 58rpx; }

.p-info { flex: 1; min-width: 0; }
.p-name {
  font-family: $kai;
  font-weight: 700;
  font-size: 33rpx;
  margin-bottom: 8rpx;
}
.p-line { font-size: 22rpx; color: $pencil; line-height: 1.6; }
.p-edit {
  font-family: $kai;
  color: $red;
  font-size: 25rpx;
  padding: 8rpx;
}

.mastery-stat {
  margin-top: 31rpx;
  display: flex;
  justify-content: space-around;
  text-align: center;
  padding: 35rpx 15rpx;
}
.m-num {
  font-family: $mono;
  font-size: 50rpx;
  font-weight: 700;
}
.m-label {
  font-family: $kai;
  font-size: 23rpx;
  color: $ink-soft;
  letter-spacing: .2em;
  margin-top: 4rpx;
}

.rules-box { padding: 4rpx 27rpx; }

.version-line {
  text-align: center;
  font-family: $mono;
  font-size: 19rpx;
  color: $pencil;
  margin-top: 46rpx;
}

/* 编辑弹层 */
.e-title {
  font-family: $kai;
  font-weight: 700;
  font-size: 33rpx;
  letter-spacing: .15em;
  text-align: center;
  margin-bottom: 27rpx;
}
.e-input {
  width: 100%;
  box-sizing: border-box;
  padding: 21rpx 23rpx;
  border: 3rpx solid $ink;
  border-radius: 15rpx;
  background: #fff;
  font-size: 29rpx;
  height: 92rpx;
  line-height: 46rpx;
}
.e-avatar-btn { margin-top: 19rpx; font-weight: 500; }
.e-emoji-row {
  display: flex;
  justify-content: space-between;
  margin-top: 23rpx;
}
.e-emoji {
  font-size: 46rpx;
  padding: 8rpx;
  border-radius: 12rpx;
  border: 3rpx solid transparent;
}
.e-emoji.sel {
  border-color: $red;
  background: #fff;
}
.e-save { margin-top: 27rpx; }
</style>

<!-- 非 scoped：placeholder-class 是原生 input 内部伪节点，scoped 下拿不到 data-v -->
<style lang="scss">
.e-ph { color: $pencil; font-size: 29rpx; }
</style>
