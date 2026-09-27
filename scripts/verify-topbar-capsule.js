/**
 * 导航栏 × 微信胶囊 几何校验（exam-topbar 回归自测）
 *
 * 运行：NODE_PATH=<puppeteer-core 所在 node_modules> node scripts/verify-topbar-capsule.js
 * 依赖：本机 Chrome（puppeteer-core，不下载 Chromium）
 *
 * 背景：微信胶囊是固定 87×32pt 的原生控件，位置由 statusBarHeight 决定、不随页面变。
 *      若导航栏高度只由内容撑开，内容一矮，底部分割线就会落进胶囊的纵向区间被盖住
 *      （实测：首页 83.6pt 侥幸躲过、结算/揭晓墙 81.3pt 贴住、局内 76.2pt 被吃掉）。
 *      所以 exam-topbar 现在锁死 内容行高 = 胶囊高 + 行底留 HEAD_GAP，
 *      本脚本对 4 种机型逐项断言这条约束成立。
 */
/**
 * 导航栏 × 微信胶囊 几何校验
 * 用真实 Chrome 渲染 exam-topbar 的结构与样式，在多种机型的胶囊坐标下断言：
 *   1. 导航栏底部分割线必须落在胶囊下沿之外（HEAD_GAP）
 *   2. 标题 / meta 的垂直中心要对上胶囊中心
 *   3. meta 右缘不得进入胶囊左缘的 CAPSULE_GAP 之内
 *   4. 标题与 meta 不得横向重叠
 */
const puppeteer = require('puppeteer-core')
const http = require('http')
const fs = require('fs')
const path = require('path')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CAPSULE_GAP = 16
const HEAD_GAP = 10
const STD_W = 87, STD_H = 32, STD_RIGHT = 7, STD_TOP_OFFSET = 4

// 机型：宽、高、状态栏高、胶囊 left（由 winW-7-87 推）
const DEVICES = [
  { name: 'iPhone SE  (375×667 statusBar20)', winW: 375, winH: 667, sb: 20 },
  { name: 'iPhone 12/13(390×844 statusBar47)', winW: 390, winH: 844, sb: 47 },
  { name: 'iPhone 14 Pro(393×852 sb54)', winW: 393, winH: 852, sb: 54 },
  { name: 'iPhone 15 PM (430×932 sb59)', winW: 430, winH: 932, sb: 59 }
]

// 复刻 exam-topbar 的 measure()
function measure(winW, sb) {
  const capTop = sb + STD_TOP_OFFSET
  const capH = STD_H
  const capLeft = winW - STD_RIGHT - STD_W
  return { capTop, capH, capLeft, padRight: Math.round(winW - capLeft) + CAPSULE_GAP, padTop: Math.round(capTop), padBottom: HEAD_GAP }
}

function html(d, m) {
  // 结构 / 样式与 exam-topbar.vue 完全一致（$ink = #23324D, 35rpx≈winW/750*35）
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${d.winW}px;height:${d.winH}px;font-family:-apple-system,sans-serif;
       background:#FAF7EF;background-image:linear-gradient(#DCE6DA 1px,transparent 1px),linear-gradient(90deg,#DCE6DA 1px,transparent 1px);
       background-size:25px 25px}
  .tb-wrap{width:100%;overflow:hidden;padding-left:${(35 * d.winW / 750).toFixed(3)}px;
           padding-top:${m.padTop}px;padding-right:${m.padRight}px;padding-bottom:${m.padBottom}px;
           border-bottom:${(4 * d.winW / 750).toFixed(3)}px solid #23324D}
  .tb-row{display:flex;align-items:center;width:100%;min-height:${m.capH}px}
  .tb-inner{display:flex;align-items:baseline;justify-content:space-between;width:100%}
  .brand,.meta{font-family:-apple-system,sans-serif}
  .brand{font-size:${(40 * d.winW / 750).toFixed(3)}px;font-weight:700;letter-spacing:.14em;
         flex:0 1 auto;min-width:0;white-space:nowrap;color:#23324D}
  .back-btn{font-size:${(28 * d.winW / 750).toFixed(3)}px;flex:0 0 auto;color:#23324D;white-space:nowrap}
  .meta{font-family:Menlo,monospace;font-size:${(21 * d.winW / 750).toFixed(3)}px;color:#8B8B83;
        flex:0 1 auto;min-width:0;max-width:100%;white-space:nowrap;overflow:hidden;
        text-overflow:ellipsis;text-align:right}
  /* 模拟微信胶囊（含 32pt 高、圆角、阴影） */
  .capsule{position:absolute;left:${m.capLeft}px;top:${m.capTop}px;width:${STD_W}px;height:${STD_H}px;
           background:#fff;border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
  </style></head><body>
    <div class="tb-wrap"><div class="tb-row"><div class="tb-inner">
      <div class="brand" id="title">人间命题</div>
      <div class="meta" id="meta">准考证 NO.1024</div>
    </div></div></div>
    <div class="capsule"></div>
  </body></html>`
}

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
  let fail = 0
  for (const d of DEVICES) {
    const m = measure(d.winW, d.sb)
    const page = await browser.newPage()
    await page.setViewport({ width: d.winW, height: d.winH, deviceScaleFactor: 3 })
    await page.setContent(html(d, m), { waitUntil: 'load' })
    const r = await page.evaluate(() => {
      const g = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, b: b.bottom, r: b.right } }
      const wrap = g('.tb-wrap'), row = g('.tb-row'), title = g('#title'), meta = g('#meta'), cap = g('.capsule')
      return { wrap, row, title, meta, cap, divTop: wrap.b + 0 } // border-box：wrap.b 即分割线上沿
    })
    console.log('='.repeat(74))
    console.log(d.name)
    console.log(`  胶囊           y=${r.cap.y.toFixed(1)}..${(r.cap.y + r.cap.h).toFixed(1)}  x=${r.cap.x.toFixed(1)}..${r.cap.r.toFixed(1)}`)
    console.log(`  内容行         y=${r.row.y.toFixed(1)}..${r.row.b.toFixed(1)}  高${r.row.h.toFixed(1)}`)
    console.log(`  分割线(上沿)   y=${r.divTop.toFixed(1)}`)
    console.log(`  标题           y=${r.title.y.toFixed(1)}..${r.title.b.toFixed(1)} 右缘x=${r.title.r.toFixed(1)}`)
    console.log(`  meta           y=${r.meta.y.toFixed(1)}..${r.meta.b.toFixed(1)} 右缘x=${r.meta.r.toFixed(1)}`)
    const capBottom = r.cap.y + r.cap.h
    const capCenter = r.cap.y + r.cap.h / 2
    const checks = [
      ['分割线在胶囊下沿之外 ≥8px', r.divTop - capBottom >= 8, `分割线${r.divTop.toFixed(1)} - 胶囊下沿${capBottom.toFixed(1)} = ${(r.divTop - capBottom).toFixed(1)}`],
      ['标题中心 ≈ 胶囊中心 ±4px', Math.abs((r.title.y + r.title.b) / 2 - capCenter) <= 4, `标题中心${((r.title.y + r.title.b) / 2).toFixed(1)} vs 胶囊中心${capCenter.toFixed(1)}`],
      ['meta中心 ≈ 胶囊中心 ±6px', Math.abs((r.meta.y + r.meta.b) / 2 - capCenter) <= 6, `meta中心${((r.meta.y + r.meta.b) / 2).toFixed(1)} vs ${capCenter.toFixed(1)}`],
      ['meta 右缘距胶囊左缘 ≥14px', r.cap.x - r.meta.r >= 14, `胶囊左${r.cap.x.toFixed(1)} - meta右${r.meta.r.toFixed(1)} = ${(r.cap.x - r.meta.r).toFixed(1)}`],
      ['标题与 meta 不重叠', r.meta.x >= r.title.r, `meta左${r.meta.x.toFixed(1)} vs 标题右${r.title.r.toFixed(1)}`],
      ['内容不低于状态栏', r.row.y >= d.sb - 1, `行顶${r.row.y.toFixed(1)} vs 状态栏${d.sb}`]
    ]
    for (const [label, ok, info] of checks) {
      if (!ok) fail++
      console.log(`   ${ok ? '✅' : '❌'} ${label}   (${info})`)
    }
    await page.close()
  }
  await browser.close()
  console.log('\n' + (fail === 0 ? '全部通过 ✅' : `有 ${fail} 项不通过 ❌`))
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('失败:', e.message); process.exit(1) })
