/**
 * wx-server-sdk 的内存替身 —— 只实现云函数实际用到的那一小块 API。
 *
 * 用途：scripts/cloud-smoke.js 通过 esbuild 的 --alias 把 cloudfunctions/main
 * 里的 `require('wx-server-sdk')` 指到这里，从而在没有云环境的情况下
 * 真正跑通「云模式」的业务逻辑与鉴权分支。
 *
 * 这不是完整实现：只支持等值 / neq / in / lt 查询、点号路径、inc 更新、
 * 以及 players 数组内的元素匹配。够用来回归本项目的云函数。
 */

let seq = 0
const nextId = (prefix) => `${prefix}_${(++seq).toString(36)}`

/* ---------------- 查询条件标记 ---------------- */
const CMD = Symbol('cmd')
const command = {
  inc: (n) => ({ [CMD]: 'inc', n }),
  push: (arr) => ({ [CMD]: 'push', arr }),
  neq: (v) => ({ [CMD]: 'neq', v }),
  in: (arr) => ({ [CMD]: 'in', arr }),
  lt: (v) => ({ [CMD]: 'lt', v }),
  gt: (v) => ({ [CMD]: 'gt', v })
}

const isCmd = (v) => v && typeof v === 'object' && v[CMD]

/**
 * 读取必须返回深拷贝：真实云数据库的结果是走网络序列化回来的，
 * 调用方拿到的是独立副本。若这里只做浅拷贝，`doc.get().data.stats`
 * 就和库里的对象共享引用，之后任何写操作都会「倒灌」到已经读出去的结果上，
 * 让所有「读一次 → 改一次 → 再读」的断言全部失真（settledAt 幂等就被这样掩盖过）。
 */
const clone = (d) => (d === undefined ? d : JSON.parse(JSON.stringify(d)))

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj)
}

function setPath(obj, path, value) {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {}
    cur = cur[parts[i]]
  }
  cur[parts[parts.length - 1]] = value
  return obj
}

/** 单值比较：支持命令标记或等值。 */
function cmp(value, expected) {
  if (isCmd(expected)) {
    switch (expected[CMD]) {
      case 'neq': return value !== expected.v
      case 'in': return expected.arr.includes(value)
      case 'lt': return typeof value === 'number' && value < expected.v
      case 'gt': return typeof value === 'number' && value > expected.v
      default: return false
    }
  }
  return value === expected
}

/**
 * 单字段匹配。
 * `players.openid` 这类路径要按「数组内任一元素命中」处理（同微信云数据库语义）：
 * 首段是数组时，必须在元素上继续取路径，不能直接 getPath(doc, 'players.openid')。
 */
function matchField(doc, key, expected) {
  const parts = key.split('.')
  if (parts.length > 1) {
    const container = doc[parts[0]]
    if (Array.isArray(container)) {
      const rest = parts.slice(1).join('.')
      return container.some((el) => cmp(rest ? getPath(el, rest) : el, expected))
    }
  }
  return cmp(getPath(doc, key), expected)
}

function match(doc, cond) {
  return Object.keys(cond).every((k) => matchField(doc, k, cond[k]))
}

/** 把更新指令应用到文档上（支持点号路径、inc 与 push）。 */
function applyUpdate(doc, data) {
  Object.keys(data).forEach((k) => {
    const v = data[k]
    if (isCmd(v) && v[CMD] === 'inc') {
      setPath(doc, k, (getPath(doc, k) || 0) + v.n)
    } else if (isCmd(v) && v[CMD] === 'push') {
      const cur = getPath(doc, k)
      const arr = Array.isArray(cur) ? cur.slice() : []
      setPath(doc, k, arr.concat(Array.isArray(v.arr) ? v.arr : [v.arr]))
      // 记录下来，让测试能断言「用的是原子 push 而不是整体写回」
      ctx.pushes.push(k)
    } else {
      setPath(doc, k, v)
    }
  })
  return doc
}

/* ---------------- 内存数据库 ---------------- */
const store = new Map() // name -> doc[]

function coll(name) {
  if (!store.has(name)) store.set(name, [])
  return store.get(name)
}

function makeQuery(name, cond, opts = {}) {
  const state = { cond, limit: opts.limit || Infinity, order: opts.order || null, field: opts.field || null }

  const resolve = () => {
    let rows = coll(name).filter((d) => match(d, state.cond))
    if (state.order) {
      const { key, dir } = state.order
      rows = rows.slice().sort((a, b) => {
        const av = getPath(a, key)
        const bv = getPath(b, key)
        if (av === bv) return 0
        if (av === undefined || av === null) return 1
        if (bv === undefined || bv === null) return -1
        return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1)
      })
    }
    if (state.field) {
      // 真实云数据库会按 field() 裁剪返回字段，_id 始终返回。
      // 不实现的话「代码依赖某个被裁掉的字段」这类bug就测不出来。
      const keys = Object.keys(state.field).filter((k) => state.field[k])
      rows = rows.map((d) => {
        const o = { _id: d._id }
        keys.forEach((k) => { o[k] = getPath(d, k) })
        return o
      })
    }
    return rows.slice(0, state.limit)
  }

  const query = {
    where: (c) => makeQuery(name, { ...state.cond, ...c }, state),
    limit: (n) => makeQuery(name, state.cond, { ...state, limit: n }),
    orderBy: (key, dir) => makeQuery(name, state.cond, { ...state, order: { key, dir } }),
    field: (f) => makeQuery(name, state.cond, { ...state, field: f }),
    get: async () => ({ data: resolve().map(clone) }),
    count: async () => ({ total: resolve().length }),
    update: async ({ data }) => {
      const rows = resolve()
      rows.forEach((d) => applyUpdate(d, data))
      return { stats: { updated: rows.length } }
    },
    remove: async () => {
      const rows = resolve()
      const arr = coll(name)
      rows.forEach((d) => {
        const i = arr.indexOf(d)
        if (i >= 0) arr.splice(i, 1)
      })
      return { stats: { removed: rows.length } }
    }
  }
  return query
}

function makeDoc(name, id) {
  return {
    get: async () => {
      const d = coll(name).find((x) => x._id === id)
      if (!d) {
        const err = new Error('document does not exist')
        err.errCode = -1
        throw err
      }
      return { data: clone(d) }
    },
    update: async ({ data }) => {
      const d = coll(name).find((x) => x._id === id)
      if (!d) return { stats: { updated: 0 } }
      applyUpdate(d, data)
      return { stats: { updated: 1 } }
    },
    set: async ({ data }) => {
      const arr = coll(name)
      const i = arr.findIndex((x) => x._id === id)
      if (i >= 0) arr[i] = { ...data, _id: id }
      else arr.push({ ...data, _id: id })
      return { stats: { updated: 1 } }
    },
    remove: async () => {
      const arr = coll(name)
      const i = arr.findIndex((x) => x._id === id)
      if (i >= 0) arr.splice(i, 1)
      return { stats: { removed: i >= 0 ? 1 : 0 } }
    }
  }
}

function makeCollection(name) {
  return {
    where: (cond) => makeQuery(name, cond),
    doc: (id) => makeDoc(name, id),
    add: async ({ data }) => {
      const _id = data._id || nextId(name)
      coll(name).push({ ...data, _id })
      return { _id }
    },
    count: async () => ({ total: coll(name).length }),
    get: async () => ({ data: coll(name).map(clone) }),
    limit: (n) => makeQuery(name, {}).limit(n),
    orderBy: (key, dir) => makeQuery(name, {}).orderBy(key, dir)
  }
}

/* ---------------- 上下文状态 ---------------- */
const ctx = {
  openid: '',
  msgSecSuggestion: 'pass',
  sentMessages: [],
  tempUrlCalls: 0,
  wxacodeCalls: 0,
  pushes: []
}

const cloud = {
  DYNAMIC_CURRENT_ENV: 'DYNAMIC_CURRENT_ENV',
  init: () => {},
  database: () => ({ collection: makeCollection, command }),
  getWXContext: () => ({ OPENID: ctx.openid }),
  getTempFileURL: async ({ fileList }) => {
    ctx.tempUrlCalls += 1
    return {
      fileList: fileList.map((fileID) => ({ fileID, tempFileURL: 'https://cdn.test/' + encodeURIComponent(fileID) }))
    }
  },
  downloadFile: async () => ({ fileContent: Buffer.from('fake-image-bytes') }),
  uploadFile: async ({ cloudPath }) => ({ fileID: 'cloud://test/' + cloudPath }),
  openapi: {
    security: {
      msgSecCheck: async () => ({ errCode: 0, result: { suggest: ctx.msgSecSuggestion } })
    },
    subscribeMessage: {
      send: async (payload) => { ctx.sentMessages.push(payload); return { errCode: 0 } }
    },
    wxacode: {
      getUnlimited: async () => { ctx.wxacodeCalls += 1; return { buffer: Buffer.from('fake-png') } }
    }
  },

  /* ---- 测试辅助（仅本替身暴露） ---- */
  __ctx: ctx,
  __setOpenid: (v) => { ctx.openid = v },
  __reset: () => {
    store.clear()
    seq = 0
    ctx.openid = ''
    ctx.msgSecSuggestion = 'pass'
    ctx.sentMessages = []
    ctx.tempUrlCalls = 0
    ctx.wxacodeCalls = 0
    ctx.pushes = []
  },
  __insert: (name, doc) => {
    const _id = doc._id || nextId(name)
    coll(name).push({ ...doc, _id })
    return _id
  },
  __all: (name) => coll(name).map(clone),
  __patch: (name, id, data) => {
    const d = coll(name).find((x) => x._id === id)
    if (!d) throw new Error(`__patch: ${name}/${id} not found`)
    Object.assign(d, data)
    return clone(d)
  },
  __raw: (name, id) => {
    const d = coll(name).find((x) => x._id === id)
    return d ? clone(d) : null
  }
}

module.exports = cloud
