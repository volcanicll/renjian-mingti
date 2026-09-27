/**
 * lib/ai.js —— 「人间命题」AI 三角色：出题人 / 裁判 / 点评员
 *
 * 统一走 OpenAI 兼容 chat/completions 协议（默认智谱 GLM 开放平台），
 * 仅依赖内置 https 模块，无第三方包。
 *
 * 环境变量：
 *   AI_BASE_URL       默认 https://open.bigmodel.cn/api/paas/v4
 *   AI_API_KEY        未配置时三个导出函数直接 return null（主函数负责降级）
 *   AI_MODEL          文字模型，默认 glm-4-flash
 *   AI_VISION_MODEL   视觉模型，默认 glm-4v-flash
 *
 * 导出签名（跨文件契约，勿改）：
 *   async genPrompt({ hint, exclude })                → { text } | null
 *   async judge({ imageBase64, promptText })          → { verdict, confidence, reason } | null
 *   async comments({ promptText, items })             → string[] | null（与 items 等长按序对应）
 *
 * 约定：所有导出函数内部自行 try/catch，失败一律返回 null，绝不 throw。
 */

const https = require('https')

/* ---------------- 配置 ---------------- */

const CFG = {
  baseUrl: () => process.env.AI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: () => process.env.AI_API_KEY || '',
  model: () => process.env.AI_MODEL || 'glm-4-flash',
  visionModel: () => process.env.AI_VISION_MODEL || 'glm-4v-flash'
}

/** AI 是否可用（未配置密钥即视为关闭，全部降级） */
function aiEnabled() {
  return !!CFG.apiKey()
}

/* ---------------- HTTP 层 ---------------- */

/**
 * POST JSON 并解析 JSON 响应（Promise，25 秒超时 reject）
 * @param {string} host    主机名，可含端口（如 api.example.com:8443）
 * @param {string} path    请求路径
 * @param {object} headers 额外请求头
 * @param {*}      body    请求体（自动 JSON.stringify）
 */
function postJson(host, path, headers, body) {
  return new Promise((resolve, reject) => {
    // 拆出端口（兼容 host 里带 :port 的写法）
    let hostname = String(host)
    let port = 443
    const idx = hostname.lastIndexOf(':')
    if (idx > -1 && !hostname.startsWith('[') && /^\d+$/.test(hostname.slice(idx + 1))) {
      port = Number(hostname.slice(idx + 1))
      hostname = hostname.slice(0, idx)
    }

    const payload = Buffer.from(JSON.stringify(body || {}), 'utf8')
    const req = https.request(
      {
        hostname,
        port,
        path: path || '/',
        method: 'POST',
        headers: Object.assign(
          {
            'Content-Type': 'application/json',
            'Content-Length': payload.length
          },
          headers || {}
        ),
        timeout: 25000
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let data
          try {
            data = JSON.parse(raw)
          } catch (e) {
            return reject(new Error('AI 响应非 JSON: ' + raw.slice(0, 200)))
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const msg = (data && data.error && data.error.message) || raw.slice(0, 200)
            const err = new Error('HTTP ' + res.statusCode + ': ' + msg)
            err.status = res.statusCode
            return reject(err)
          }
          resolve(data)
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('AI 请求超时(25s)')))
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

/** 调一次 OpenAI 兼容 chat/completions，返回原始响应对象；HTTP 200 内含 error 也抛出 */
async function chat(payload) {
  let u
  try {
    u = new URL(CFG.baseUrl())
  } catch (e) {
    throw new Error('AI_BASE_URL 配置无效: ' + CFG.baseUrl())
  }
  const pathName = u.pathname.replace(/\/+$/, '') + '/chat/completions'
  const data = await postJson(u.host, pathName, { Authorization: 'Bearer ' + CFG.apiKey() }, payload)
  if (data && data.error) {
    throw new Error((data.error.message && String(data.error.message)) || 'AI 上游返回错误')
  }
  return data
}

/* ---------------- 解析工具 ---------------- */

/** 取 choices[0].message.content */
function extractContent(res) {
  const msg = res && res.choices && res.choices[0] && res.choices[0].message
  return msg && typeof msg.content === 'string' ? msg.content : ''
}

/** 剥掉 markdown 代码栅栏（部分模型无视 response_format 时会包 ```json） */
function stripFence(text) {
  let t = String(text || '').trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  return t.trim()
}

/** 宽松 JSON 解析：容忍栅栏与前后杂质，截取首个 {...} 或 [...] 片段再试 */
function tryParseJson(text) {
  const t = stripFence(text)
  try {
    return JSON.parse(t)
  } catch (e) {
    /* 继续尝试截取 */
  }
  const so = t.indexOf('{')
  const eo = t.lastIndexOf('}')
  if (so > -1 && eo > so) {
    try {
      return JSON.parse(t.slice(so, eo + 1))
    } catch (e) {
      /* 继续 */
    }
  }
  const sa = t.indexOf('[')
  const ea = t.lastIndexOf(']')
  if (sa > -1 && ea > sa) {
    try {
      return JSON.parse(t.slice(sa, ea + 1))
    } catch (e) {
      /* 放弃 */
    }
  }
  return null
}

/* ================= 导出一：出题人 genPrompt ================= */

/** 出题官 few-shot 示例（摘自产品题库 PROMPT_POOL，覆盖三类风格） */
const GEN_FEWSHOT = [
  '拍下你家最有资历的物品。',
  '拍一个正在努力工作的圆形物体。',
  "拍下'等一下'。",
  '拍下今天的风。',
  '拍下最没用的超能力现场。',
  '拍下一样东西在偷懒。',
  '拍下一样东西的遗照（它还活着）。',
  '拍下人类痕迹最重的一平方米自然。'
]

function buildGenSystemPrompt() {
  return [
    '你是微信小程序「人间命题」的出题官。这是一款荒诞命题摄影派对游戏：玩家收到一句命题后各拍一张照片，匿名上墙互猜作者是谁。',
    '',
    '参考示例（学习这种文风与脑洞）：',
    ...GEN_FEWSHOT.map((t, i) => i + 1 + '. ' + t),
    '',
    '出题规则：',
    '- 一句中文祈使句，20 字以内，以「拍下」开头，句号结尾',
    '- 荒诞、具体、可拍摄、有梗：让人会心一笑，且真的能举起手机拍到',
    '- 方向任选其一：具体物件型 / 抽象概念型 / 荒诞限定型',
    '- 禁止出现品牌名、真实人名、明星、危险物品及任何违规内容',
    '- 只输出题目这一句话，不要解释、不要引号、不要序号'
  ].join('\n')
}

/** 清洗模型输出：去首尾空白、包裹引号和加粗星号 */
function cleanPromptText(raw) {
  let t = String(raw || '').trim()
  t = t.replace(/^[「『'"“‘*\s]+/, '').replace(/[」』'"”’*\s]+$/, '')
  return t.trim()
}

/** 出题校验：6-30 字、单行 */
function isValidPromptText(t) {
  if (!t || t.length < 6 || t.length > 30) return false
  if (/[\n\r]/.test(t)) return false
  return true
}

/**
 * 出题人生成一道荒诞命题
 * @param {object}   opts
 * @param {string}  [opts.hint]    用户补充的方向（可参考）
 * @param {string[]} [opts.exclude] 已出过的题目，禁止重复
 * @returns {Promise<{text:string}|null>} 失败返回 null（主函数降级用官方题库）
 */
async function genPrompt({ hint, exclude } = {}) {
  if (!aiEnabled()) return null
  try {
    const excludeList = Array.isArray(exclude)
      ? exclude.filter((x) => typeof x === 'string' && x).slice(0, 50)
      : []

    // 组装用户消息：已出过的题（防重复）+ 用户补充方向
    const userParts = []
    if (excludeList.length) {
      userParts.push(
        '以下题目已经出过，严禁重复或同义换皮：\n' + excludeList.map((t) => '- ' + t).join('\n')
      )
    }
    if (hint) userParts.push('玩家补充的灵感方向（仅供参考）：' + String(hint).slice(0, 100))
    userParts.push('请出一道新题，只输出题目这一句话。')
    const userMsg = userParts.join('\n\n')

    // 结果不合格可重试一次，仍失败返回 null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await chat({
          model: CFG.model(),
          messages: [
            { role: 'system', content: buildGenSystemPrompt() },
            { role: 'user', content: userMsg }
          ],
          temperature: 1.2
        })
        let text = cleanPromptText(extractContent(res))
        if (isValidPromptText(text)) {
          // 统一产品文案格式：句号结尾（长度允许时才补）
          if (!/[。！？!?~]$/.test(text) && text.length < 30) text += '。'
          return { text }
        }
        console.error('[ai.genPrompt] 第' + (attempt + 1) + '次生成不合格:', text)
      } catch (err) {
        console.error('[ai.genPrompt] 第' + (attempt + 1) + '次调用失败:', err.message || err)
      }
    }
    return null
  } catch (err) {
    console.error('[ai.genPrompt] 异常:', err.message || err)
    return null
  }
}

/* ================= 导出二：裁判 judge ================= */

/**
 * 裁判判定一张照片是否跑题（vision 模型）
 * 分寸感：只淘汰明显跑题（off）与违规内容，拿不懂的一律 suspect 存疑放行，交给玩家投票裁决。
 * @returns {Promise<{verdict:'pass'|'suspect'|'off', confidence:number, reason:string}|null>}
 */
async function judge({ imageBase64, promptText } = {}) {
  if (!aiEnabled()) return null
  if (!imageBase64 || !promptText) return null
  try {
    // 客户端一般传纯 base64；容错处理已带 data URI 前缀的情况
    const b64 = String(imageBase64)
    const dataUrl = b64.startsWith('data:') ? b64 : 'data:image/jpeg;base64,' + b64

    const instruction = [
      '你是摄影派对游戏的裁判。本轮命题是：「' + promptText + '」。请判断这张照片是否跑题。',
      '',
      '判定标准：',
      '- off：照片内容与命题明显完全无关；',
      '- suspect：看不出与命题的关系、存疑；',
      '- pass：理解方式清奇，但能自圆其说。',
      '',
      '分寸感（最重要）：这是朋友间的娱乐局，不是考试。只淘汰明显跑题和违规内容，拿不准一律判 suspect（存疑放行，交给玩家投票裁决）。',
      '',
      '严格按以下 JSON 格式输出，不要输出任何其他内容：',
      '{"verdict":"pass|suspect|off","confidence":0到1的小数,"reason":"一句话中文判词，幽默、不贬低用户，30字内"}'
    ].join('\n')

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: instruction },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]

    // 至多试 3 次：第 1 次带 response_format(json_object)；若网关不支持该参数，
    // 后续去掉再试（解析时剥代码栅栏兜底）；JSON 解析失败也顺延重试
    for (let attempt = 0; attempt < 3; attempt++) {
      const body = {
        model: CFG.visionModel(),
        messages,
        temperature: 0.2
      }
      if (attempt === 0) body.response_format = { type: 'json_object' }

      try {
        const res = await chat(body)
        const parsed = tryParseJson(extractContent(res))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // 档位非法时归为 suspect：宁可错放，不错杀
          const verdictRaw = String(parsed.verdict || '').toLowerCase().trim()
          const verdict = ['pass', 'suspect', 'off'].indexOf(verdictRaw) > -1 ? verdictRaw : 'suspect'
          let confidence = Number(parsed.confidence)
          if (!(confidence >= 0 && confidence <= 1)) confidence = 0.5
          const reason = String(parsed.reason || '')
            .trim()
            .slice(0, 60)
          return { verdict, confidence, reason }
        }
        console.error(
          '[ai.judge] 第' + (attempt + 1) + '次解析失败，原文:',
          extractContent(res).slice(0, 200)
        )
      } catch (err) {
        console.error('[ai.judge] 第' + (attempt + 1) + '次调用失败:', err.message || err)
      }
    }
    return null
  } catch (err) {
    console.error('[ai.judge] 异常:', err.message || err)
    return null
  }
}

/* ================= 导出三：点评员 comments ================= */

/** 红笔点评 few-shot（摘自演示答卷池 NPC_ENTRY_POOL 的 note 字段） */
const COMMENT_FEWSHOT = [
  '摄影师坚称风来了。作为证据，他提供了一棵树和一段模糊的信仰。',
  '一只塑料袋的离家出走。你只能拍下它离开的背影，留不住的。',
  '工位上午睡被抓的第 108 种辩解。态度端正，证据无效。',
  '另一只在洗衣机深处。本局最佳悬疑片，结局永远缺席。',
  '猫没有同意过任何命题，但它配合了。这就是格局。'
]

/**
 * 点评员：给每份答卷写一句毒舌但善良的短评
 * @param {object}   opts
 * @param {string}   opts.promptText 本局命题
 * @param {string[]} opts.items      各答卷 caption（按序）
 * @returns {Promise<string[]|null>} 与 items 等长按序对应的短评数组；失败返回 null
 */
async function comments({ promptText, items } = {}) {
  if (!aiEnabled()) return null
  if (!Array.isArray(items) || items.length === 0) return null
  try {
    const list = items.map((c) => String(c || '').trim())
    const n = list.length

    const userMsg = [
      '本轮命题是：「' + promptText + '」',
      '',
      '以下是本局 ' + n + ' 份答卷的配文（按序编号）：',
      list.map((c, i) => i + 1 + '. ' + (c || '（没写配文）')).join('\n'),
      '',
      '请给每一份答卷写一句点评，输出一个 JSON 数组字符串（形如 ["点评一","点评二"]），',
      '数组长度必须等于 ' + n + '，顺序与上面编号一一对应。只输出 JSON 数组本身，不要解释。'
    ].join('\n')

    const system = [
      '你是「人间命题」的红色点评笔：毒舌但善良，犀利但不刻薄。',
      '',
      '风格示例：',
      ...COMMENT_FEWSHOT.map((t, i) => i + 1 + '. ' + t),
      '',
      '写作要求：',
      '- 每份答卷一句 30 字以内的中文短评',
      '- 幽默、具体，只调侃作者「理解命题的方式」，绝不羞辱作者本人',
      '- 不评价摄影技术（构图/光线/清晰度一概不提）',
      '- 宁可一本正经地胡说八道，不可阴阳怪气伤害人'
    ].join('\n')

    // 解析失败或条数对不上则重试一次，仍失败返回 null（主函数降级用本地点评池）
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await chat({
          model: CFG.model(),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMsg }
          ],
          temperature: 0.9
        })
        const arr = tryParseJson(extractContent(res))
        if (Array.isArray(arr) && arr.length === n) {
          const out = arr.map((s) => String(s || '').trim().slice(0, 80))
          if (out.every((s) => s)) return out
        }
        console.error(
          '[ai.comments] 第' + (attempt + 1) + '次解析不合格:',
          Array.isArray(arr) ? '条数=' + arr.length : stripFence(extractContent(res)).slice(0, 200)
        )
      } catch (err) {
        console.error('[ai.comments] 第' + (attempt + 1) + '次调用失败:', err.message || err)
      }
    }
    return null
  } catch (err) {
    console.error('[ai.comments] 异常:', err.message || err)
    return null
  }
}

/* ---------------- 导出 ---------------- */

module.exports = {
  genPrompt,
  judge,
  comments
}
