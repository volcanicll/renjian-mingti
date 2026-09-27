/**
 * 战报海报 Canvas 绘制（mp-weixin canvas type="2d"）
 * 用法：const { drawPoster, savePoster } = require('@/utils/poster')
 *   <canvas id="poster" type="2d" class="poster-canvas" />
 *   const canvas = await drawPoster(this, '#poster', data)
 *   await savePoster(canvas)
 */

function wrapText(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const ch of String(text)) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

/** 确定性伪小程序码（演示/降级用） */
function drawFakeQr(ctx, x, y, size, seedStr) {
  let h = 5381
  for (let i = 0; i < seedStr.length; i++) h = ((h << 5) + h + seedStr.charCodeAt(i)) >>> 0
  const cell = size / 11
  ctx.fillStyle = '#23324D'
  const corner = (cx, cy) => {
    ctx.fillRect(x + cx * cell, y + cy * cell, cell * 3, cell * 3)
    ctx.fillStyle = '#FAF7EF'
    ctx.fillRect(x + (cx + 1) * cell, y + (cy + 1) * cell, cell, cell)
    ctx.fillStyle = '#23324D'
  }
  corner(0, 0); corner(8, 0); corner(0, 8)
  for (let i = 0; i < 11; i++) {
    for (let j = 0; j < 11; j++) {
      const inCorner = (i < 4 && j < 4) || (i > 6 && j < 4) || (i < 4 && j > 6)
      if (inCorner) continue
      h = ((h << 5) + h + i * 31 + j) >>> 0
      if (h % 100 < 46) ctx.fillRect(x + i * cell, y + j * cell, cell, cell)
    }
  }
}

/**
 * 绘制战报海报
 * @param caller 组件实例（用于 selector query）
 * @param sel canvas 选择器
 * @param data { brandNo, promptText, bestLine, commentLine, dateLine, qrUrl, qrSeed }
 * @returns canvas node（供 savePoster 使用）
 */
export async function drawPoster(caller, sel, data) {
  return new Promise((resolve, reject) => {
    uni.createSelectorQuery().in(caller)
      .select(sel).fields({ node: true, size: true })
      .exec(async (res) => {
        try {
          const canvas = res[0].node
          const dpr = (uni.getSystemInfoSync().pixelRatio) || 2
          const W = res[0].width
          const H = res[0].height
          canvas.width = W * dpr
          canvas.height = H * dpr
          const ctx = canvas.getContext('2d')
          ctx.scale(dpr, dpr)

          const M = 18
          // 纸底 + 方格
          ctx.fillStyle = '#FAF7EF'
          ctx.fillRect(0, 0, W, H)
          ctx.strokeStyle = 'rgba(122,168,160,.22)'
          ctx.lineWidth = 1
          for (let g = M; g < W - M; g += 22) {
            ctx.beginPath(); ctx.moveTo(g, M); ctx.lineTo(g, H - M); ctx.stroke()
          }
          for (let g = M; g < H - M; g += 22) {
            ctx.beginPath(); ctx.moveTo(M, g); ctx.lineTo(W - M, g); ctx.stroke()
          }
          // 内框
          ctx.strokeStyle = '#23324D'
          ctx.lineWidth = 3
          ctx.strokeRect(M, M, W - M * 2, H - M * 2)

          const L = M + 16
          let y = M + 44
          // 品牌行
          ctx.fillStyle = '#23324D'
          ctx.font = 'bold 19px "Kaiti SC", serif'
          ctx.fillText('人间命题', L, y)
          ctx.fillStyle = '#D6482F'
          ctx.fillText(' · 第 ' + data.brandNo + ' 题', L + 78, y)
          // 虚线
          y += 14
          ctx.strokeStyle = 'rgba(139,139,131,.5)'
          ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - L, y); ctx.stroke()
          ctx.setLineDash([])
          // 命题与金句
          y += 26
          ctx.font = '15px "Kaiti SC", serif'
          ctx.fillStyle = '#4A5872'
          const quoteLines = [
            '「' + data.promptText + '」',
            data.bestLine,
            '"' + data.commentLine + '"'
          ].filter(Boolean)
          for (const q of quoteLines) {
            for (const ln of wrapText(ctx, q, W - L * 2 - (data.qrUrl ? 60 : 0))) {
              ctx.fillText(ln, L, y)
              y += 25
            }
            y += 4
          }
          // 底部：日期 + 码
          const footY = H - M - 40
          ctx.font = '10px monospace'
          ctx.fillStyle = '#8B8B83'
          ctx.fillText(data.dateLine, L, footY)
          const qs = 46
          if (data.qrUrl) {
            return drawImageSafe(ctx, data.qrUrl, W - M - 14 - qs, footY - qs + 10, qs, qs, () => {
              finish(W - M - 14 - qs, footY - qs + 10)
            })
          }
          finish(W - M - 14 - qs, footY - qs + 10)

          function finish(qx, qy) {
            drawFakeQr(ctx, qx, qy, qs, data.qrSeed || String(data.brandNo))
            resolve(canvas)
          }

          function drawImageSafe(c, src, dx, dy, dw, dh, fallback) {
            if (!src) return fallback()
            const img = canvas.createImage()
            img.onload = () => { c.drawImage(img, dx, dy, dw, dh); fallback() }
            img.onerror = fallback
            img.src = src
          }
        } catch (e) {
          reject(e)
        }
      })
  })
}

/** 导出并保存到相册 */
export function savePoster(canvasNode) {
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath({
      canvas: canvasNode,
      success: (r) => {
        uni.saveImageToPhotosAlbum({
          filePath: r.tempFilePath,
          success: () => resolve(r.tempFilePath),
          fail: (e) => {
            if (e && /auth/i.test(e.errMsg || '')) {
              uni.showModal({
                title: '需要相册权限',
                content: '请在设置中允许保存图片到相册',
                confirmText: '去设置',
                success: (m) => { if (m.confirm) uni.openSetting({}) }
              })
            }
            reject(e)
          }
        })
      },
      fail: reject
    })
  })
}
