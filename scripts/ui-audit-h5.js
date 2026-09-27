/**
 * UI 排版体检（H5 渲染版）
 * 用途：用真实 Chrome 渲染 uni-app H5 产物，逐页量化元素位置/尺寸，
 *      自动发现横向越界、零尺寸、元素缺失、弹层溢出等问题。
 *
 * 前置：
 *   1. npm i puppeteer-core（本机已有 Chrome 即可，无需下载 Chromium）
 *   2. npx uni build（产出 dist/build/h5）
 * 运行：
 *   NODE_PATH=<puppeteer-core 所在 node_modules> node scripts/ui-audit-h5.js
 *
 * 说明：H5 端 rpx 以 400px 为换算基准，故脚本用 400 宽视口，与小程序等比一致；
 *      原生组件（input）相关的真机问题需另用小程序自动化（miniprogram-automator）验证。
 */
const puppeteer = require('puppeteer-core')
const http = require('http')
const fs = require('fs')
const path = require('path')

// 内置静态服务，避免外部进程被回收
const ROOT = '/Users/varisun/workspace/projects/person/wechat-uni/dist/build/h5'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0].split('#')[0]
  const file = path.join(ROOT, url === '/' ? 'index.html' : url)
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
    res.end(data)
  })
})

const BASE = 'http://127.0.0.1:8899'
const VW = 400
const VH = 812
const CAPSULE_LEFT = 300

const ISSUES = []
const REPORT = {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function flag(page, tag, msg) {
  ISSUES.push(`[${page}] ${tag}: ${msg}`)
}

async function measure(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height)
    }
  }, sel)
}

async function scanOverflow(page, name) {
  const res = await page.evaluate(() => {
    // 用页面真实容器宽度做基准（uni-app H5 在桌面浏览器会把容器撑到 400px，属环境差异）
    const body = document.querySelector('uni-page-body') || document.body
    const vw = Math.round(body.getBoundingClientRect().width) || window.innerWidth
    const out = { over: [], zero: 0, baseWidth: vw }
    document.querySelectorAll('uni-view,uni-text,view,div,uni-button,button,uni-image').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return
      if (r.width > vw + 2 || r.x < -2 || r.x + r.width > vw + 2) {
        out.over.push({
          cls: (el.className || el.tagName || '').toString().slice(0, 40),
          x: Math.round(r.x),
          w: Math.round(r.width)
        })
      }
      if (r.width === 0 || r.height === 0) out.zero++
    })
    return out
  })
  REPORT[name].overflow = res.over.slice(0, 6)
  REPORT[name].overflowCount = res.over.length
  if (res.over.length) {
    flag(name, '横向越界', `${res.over.length} 个元素超出视口：${JSON.stringify(res.over.slice(0, 3))}`)
  }
  return res
}

async function auditPage(page, name, selectors) {
  REPORT[name] = { boxes: {} }
  for (const sel of selectors) {
    const b = await measure(page, sel)
    REPORT[name].boxes[sel] = b
    if (!b) {
      flag(name, '元素缺失', `${sel} 未渲染`)
      continue
    }
    if (b.w === 0 || b.h === 0) flag(name, '零尺寸', `${sel}`)
    if (b.x < -1 || b.x + b.w > VW + 1) flag(name, '越界', `${sel} x=${b.x} w=${b.w}`)
  }
  await scanOverflow(page, name)
}

;(async () => {
  await new Promise((r) => server.listen(8899, '127.0.0.1', r))
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120))
  })

  // ---------- 首页 ----------
  await page.goto(`${BASE}/#/pages/home/index`, { waitUntil: 'networkidle2' })
  await sleep(1800)
  await auditPage(page, 'home', ['.tb-wrap', '.brand', '.meta', '.today-card', '.page-body', '.sec-label', '.home-actions'])
  const meta = REPORT.home.boxes['.meta']
  const brand = REPORT.home.boxes['.brand']
  // H5 无右上胶囊，胶囊避让只在小程序端生效，此处仅记录不判错
  REPORT.home.metaRight = meta ? meta.x + meta.w : null
  REPORT.home.capsuleNote = 'H5 无胶囊，避让逻辑仅在 MP 端生效（padding-right 由胶囊实测值计算）'
  if (brand && brand.y < 20) flag('home', '顶部过近', `brand y=${brand.y}`)

  // ---------- 开局弹层：自己出 ----------
  await page.click('.btn-primary.act')
  await sleep(600)
  await auditPage(page, 'home-sheet', ['.sheet', '.cr-title', '.opt-row', '.opt', '.mode-row', '.cr-go', '.cr-foot'])
  const sheet = REPORT['home-sheet'].boxes['.sheet']
  if (sheet && sheet.y + sheet.h > VH + 1) flag('home-sheet', '弹层超屏', `sheet 底部 ${sheet.y + sheet.h} > ${VH}`)

  const opts = await page.$$('.opt')
  if (opts[2]) await opts[2].click()
  await sleep(500)
  const input = await measure(page, '.cr-input')
  REPORT['home-sheet'].boxes['.cr-input'] = input
  if (!input) flag('home-sheet', '输入框缺失', '选「自己出」后 .cr-input 未渲染')
  else {
    if (input.h < 30) flag('home-sheet', '输入框过矮', `h=${input.h}`)
    if (sheet && input.y + input.h > sheet.y + sheet.h) {
      flag('home-sheet', '输入框溢出弹层', `input 底 ${input.y + input.h} > sheet 底 ${sheet.y + sheet.h}`)
    }
  }
  const phColor = await page.evaluate(() => {
    const el = document.querySelector('.cr-input')
    return el ? getComputedStyle(el).fontSize : null
  })
  REPORT['home-sheet'].inputFontSize = phColor

  // 关闭弹层后输入框必须消失
  await page.evaluate(() => {
    const ov = document.querySelector('.ov')
    if (ov) ov.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await sleep(700)
  const stray = await page.evaluate(() => !!document.querySelector('.cr-input'))
  REPORT['home-sheet'].inputAfterClose = stray
  if (stray) flag('home-sheet', '输入框残留', '弹层关闭后 .cr-input 仍在 DOM')

  // ---------- 真实开局 → 局内页 ----------
  await page.click('.btn-primary.act')
  await sleep(600)
  await page.click('.cr-go')
  await sleep(2600)
  await auditPage(page, 'round', ['.cd', '.q-card', '.q-title', '.strip', '.strip-count', '.shutter', '.shutter-hint', '.blank-btn'])
  const cd = REPORT.round.boxes['.cd']
  if (cd && cd.y < 40) flag('round', '倒计时过顶', `y=${cd.y}`)

  // ---------- 从局内页 URL 取 roundId，直连揭晓墙 / 结算页 ----------
  const roundUrl = page.url()
  const roundId = (roundUrl.match(/roundId=([^&]+)/) || [])[1] || ''
  REPORT.round.roundId = roundId
  console.log('开局成功，roundId =', roundId)

  if (roundId) {
    // 先点「时间快进·直接揭晓（演示）」让局进入揭晓态，否则墙/结算页会因状态不对而空白
    const demoBtn = await page.$('.act-btn')
    if (demoBtn) {
      await demoBtn.click()
      await sleep(2600)
    }
    await page.goto(`${BASE}/#/pages/wall/index?roundId=${roundId}`, { waitUntil: 'networkidle2' })
    await sleep(1800)
    await auditPage(page, 'wall', ['.w-progress', '.w-bar', '.wall-grid', '.wall-card', '.w-actions'])
    const cards = await page.$$('.wall-card')
    if (cards[0]) {
      await cards[0].click()
      await sleep(800)
      await auditPage(page, 'wall-detail', ['.sheet', '.d-nav', '.d-nav-idx', '.vote-row', '.vote-btn', '.d-close'])
      const s = REPORT['wall-detail'].boxes['.sheet']
      const v = REPORT['wall-detail'].boxes['.vote-btn']
      if (s && v && v.y + v.h > s.y + s.h + 1) {
        flag('wall-detail', '投票区溢出弹层', `${v.y + v.h} > ${s.y + s.h}`)
      }
      await page.evaluate(() => {
        const el = document.querySelector('.d-close')
        if (el) el.click()
      })
      await sleep(600)
    } else {
      flag('wall', '无答卷卡片', 'wall-card 未渲染')
    }

    await page.goto(`${BASE}/#/pages/result/index?roundId=${roundId}`, { waitUntil: 'networkidle2' })
    await sleep(2600)
    REPORT.result = { url: page.url() }
    await auditPage(page, 'result', ['.award-block', '.my-stat', '.poster', '.end-zone', '.ai-list'])
  }

  // ---------- 其余页面 ----------
  for (const [name, path, sels] of [
    ['album', '/#/pages/album/index', ['.intro', '.masonry', '.alb-item', '.alb-meta']],
    ['me', '/#/pages/me/index', ['.profile-card', '.mastery-stat', '.rules-box', '.row-item', '.version-line']],
    ['rules', '/#/pages/rules/index', ['.r-card', '.r-title', '.r-text', '.seal-line']]
  ]) {
    await page.goto(BASE + path, { waitUntil: 'networkidle2' })
    await sleep(1600)
    await auditPage(page, name, sels)
  }

  console.log('================ 体检结果 ================')
  console.log(JSON.stringify(REPORT, null, 1))
  console.log('\n================ JS 错误 ================')
  console.log(errors.length ? errors.slice(0, 8).join('\n') : '无')
  console.log('\n================ 问题清单 ================')
  console.log(ISSUES.length ? ISSUES.map((i) => '❌ ' + i).join('\n') : '✅ 未发现排版问题')

  await browser.close()
  server.close()
})().catch((e) => {
  console.error('异常:', e.message)
  console.log(JSON.stringify(REPORT, null, 1))
  process.exit(1)
})
