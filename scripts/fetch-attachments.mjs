#!/usr/bin/env node
/**
 * fetch-attachments.mjs
 * ---------------------------------------------------------------------------
 * 用一个**你本人在浏览器里登录后**的会话来下载语雀附件（不读取密码）。
 *
 * 前置：
 *   1. 已启动带 --remote-debugging-port=9223 的 Chrome，并登录语雀；
 *   2. raw/manifest.json 已生成（node scripts/fetch-yuque.mjs）。
 *
 * 用法：
 *   node scripts/fetch-attachments.mjs --limit 1     # 样本
 *   node scripts/fetch-attachments.mjs               # 全部 128 个
 *   node scripts/fetch-attachments.mjs --year 2010   # 只下一年
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RAW = path.join(ROOT, 'raw')
const OUT = path.join(RAW, 'attachments')
const MANIFEST = JSON.parse(fs.readFileSync(path.join(RAW, 'manifest.json'), 'utf8'))

const argv = process.argv.slice(2)
const argValue = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : null
}
const LIMIT = Number(argValue('--limit') || 0)
const ONLY_YEAR = Number(argValue('--year') || 0)
const PORT = Number(argValue('--port') || 9223)

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class CDP {
  constructor(url) {
    this.url = url
    this.id = 0
    this.pending = new Map()
  }
  async connect() {
    this.ws = new WebSocket(this.url)
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true })
      this.ws.addEventListener('error', rej, { once: true })
    })
    this.ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id) {
        const p = this.pending.get(m.id)
        if (p) {
          this.pending.delete(m.id)
          m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
        }
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
}

async function getYuqueCookies() {
  let list = []
  for (let i = 0; i < 30; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      if (list.some((t) => t.type === 'page' && /yuque\.com/.test(t.url))) break
    } catch {
      /* retry */
    }
    await sleep(500)
  }
  const page = list.find((t) => t.type === 'page' && /yuque\.com/.test(t.url))
  if (!page) throw new Error('未找到语雀页面，请确认登录窗口仍打开')

  const cdp = new CDP(page.webSocketDebuggerUrl)
  await cdp.connect()
  await cdp.send('Network.enable')
  const { cookies } = await cdp.send('Network.getAllCookies')
  cdp.ws.close()

  const yuque = cookies.filter((c) => /(^|\.)yuque\.com$/.test(c.domain))
  const session = yuque.find((c) => /session|ctoken/i.test(c.name))
  if (!session) {
    throw new Error('未检测到语雀登录会话（_yuque_session），请先在窗口里完成登录')
  }
  return {
    header: yuque.map((c) => `${c.name}=${c.value}`).join('; '),
    names: yuque.map((c) => c.name),
  }
}

function collectItems() {
  const items = []
  for (const doc of MANIFEST.docs) {
    if (!doc.year) continue
    for (const att of doc.attachments || []) {
      items.push({
        year: doc.year,
        docUrl: doc.url,
        title: doc.title,
        name: att.name,
        url: att.url,
        expectedSize: att.size || 0,
        text: att.text,
        mode: att.mode,
      })
    }
  }
  items.sort(
    (a, b) => a.year - b.year || (a.text || 0) - (b.text || 0) || a.mode.localeCompare(b.mode)
  )
  return ONLY_YEAR ? items.filter((i) => i.year === ONLY_YEAR) : items
}

function safeName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

async function fetchOne(item, cookieHeader) {
  const destDir = path.join(OUT, String(item.year))
  const dest = path.join(destDir, safeName(item.name))
  if (fs.existsSync(dest) && fs.statSync(dest).size > 10_000) {
    return { skipped: true, size: fs.statSync(dest).size, dest }
  }
  fs.mkdirSync(destDir, { recursive: true })

  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(item.url, {
        headers: {
          'user-agent': UA,
          cookie: cookieHeader,
          referer: item.docUrl,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
      })
      const buf = Buffer.from(await res.arrayBuffer())
      const head = buf.toString('utf8', 0, 3000)
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
      if (/pagetype"\s+content="new_session"|\/login\?goto=/.test(head)) {
        throw new Error('被重定向到登录页：会话无效或附件权限不足')
      }
      if (buf.length < 1024) throw new Error(`内容过小（${buf.length} B）`)
      fs.writeFileSync(dest, buf)
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
      return { size: buf.length, sha256, dest, contentType: res.headers.get('content-type') }
    } catch (err) {
      lastErr = err
      await sleep(800 * (attempt + 1))
    }
  }
  throw lastErr
}

async function main() {
  console.log('→ 读取浏览器会话…')
  const { header, names } = await getYuqueCookies()
  console.log(`  已获取 ${names.length} 个 yuque.com cookie（${names.join(', ')}）`)

  let items = collectItems()
  if (LIMIT) items = items.slice(0, LIMIT)
  console.log(`→ 准备下载 ${items.length} 个附件`)

  const results = []
  let done = 0
  let totalBytes = 0
  const failures = []

  const concurrency = 4
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      const item = items[index]
      const label = `${item.year}/${item.name}`
      try {
        const r = await fetchOne(item, header)
        totalBytes += r.size
        results.push({ ...item, ...r, ok: true })
        console.log(
          `  [${++done}/${items.length}] ${label} → ${(r.size / 1024 / 1024).toFixed(1)} MB${r.skipped ? '（已存在）' : ''}`
        )
      } catch (err) {
        failures.push({ ...item, error: err.message })
        console.log(`  [${++done}/${items.length}] ${label} → 失败：${err.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))

  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(
    path.join(OUT, 'download-manifest.json'),
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        totalRequested: items.length,
        totalBytes,
        ok: results.length,
        failed: failures.length,
        failures,
        files: results.map((r) => ({
          year: r.year,
          name: r.name,
          size: r.size,
          sha256: r.sha256,
          url: r.url,
          dest: path.relative(ROOT, r.dest).replace(/\\/g, '/'),
        })),
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(
    `\n✓ 完成：${results.length} 成功 / ${failures.length} 失败，共 ${(totalBytes / 1024 / 1024).toFixed(1)} MB`
  )
  if (failures.length) {
    console.log('失败列表见 raw/attachments/download-manifest.json')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('下载失败：', err.message)
  process.exit(1)
})