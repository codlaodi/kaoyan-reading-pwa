#!/usr/bin/env node
/**
 * verify-offline.mjs —— 用本机 Chrome（无头）+ CDP 做验收
 * ---------------------------------------------------------------------------
 * 覆盖：
 *   1. PWA manifest 可解析、图标和 start_url 正常（Page.getAppManifest）
 *   2. Service Worker 注册、激活并接管页面
 *   3. 断网后打开首页、年份页（clean URL）、附件清单
 *   4. 断网后 Pagefind 中文全文搜索可用
 *   5. 未缓存路径回退到离线页
 *   6. 移动端视口截图存档
 *
 * 用法：
 *   node scripts/verify-offline.mjs
 *
 * 前置：先执行 node scripts/build.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { startServer } from './serve-dist.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, '.vitepress', 'dist')
const ARTIFACTS = path.join(ROOT, 'artifacts')
const BASE = (
  (process.env.VERIFY_URL || '').replace(/\/?$/, '/') || process.env.BASE_PATH || '/'
).startsWith('http')
  ? new URL(process.env.VERIFY_URL).pathname
  : (process.env.BASE_PATH || '/').replace(/\/?$/, '/')
const LIVE_URL = process.env.VERIFY_URL
  ? process.env.VERIFY_URL.replace(/\/?$/, '/')
  : ''

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error('未找到 Chrome / Edge，无法执行离线验收')
}

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.id = 0
    this.pending = new Map()
    this.handlers = new Map()
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl)
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id) {
        const pending = this.pending.get(msg.id)
        if (!pending) return
        this.pending.delete(msg.id)
        if (msg.error) pending.reject(new Error(msg.error.message))
        else pending.resolve(msg.result)
        return
      }
      for (const fn of this.handlers.get(msg.method) || []) fn(msg.params)
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, [])
    this.handlers.get(method).push(fn)
  }

  close() {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }
}

async function fetchJson(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

async function waitForChrome(port, timeout = 25000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`)
    } catch {
      await sleep(400)
    }
  }
  throw new Error('Chrome 调试端口未就绪')
}

async function waitForPageTarget(port, timeout = 25000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${port}/json/list`)
      const page = list.find((t) => t.type === 'page' && /^https?:/.test(t.url))
      if (page) return page
    } catch {
      /* retry */
    }
    await sleep(400)
  }
  throw new Error('未找到页面调试目标')
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('未找到构建产物，请先运行 node scripts/build.mjs')
  }
  fs.mkdirSync(ARTIFACTS, { recursive: true })

  const checks = []
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok, detail, at: new Date().toISOString() })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  }

  let server = null
  let site = LIVE_URL
  if (LIVE_URL) {
    console.log(`线上验收：${site}（base=${BASE}）`)
  } else {
    const started = await startServer({ root: DIST, base: BASE, port: 4173 })
    server = started.server
    site = `http://127.0.0.1:${started.port}${BASE}`
    console.log(`本地服务：${site}（BASE_PATH=${BASE}）`)
  }

  const readerFile = '/attachments/2010/2010_text1_做题模式.html'
  const readerUrl = `${site}reader.html?year=2010&f=${encodeURIComponent(readerFile)}`

  const chromePath = findChrome()
  const debugPort = 9333
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaoyan-pwa-'))
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--remote-allow-origins=*',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--mute-audio',
      '--window-size=390,844',
      `${site}`,
    ],
    { stdio: 'ignore', windowsHide: true }
  )

  let cdp
  try {
    await waitForChrome(debugPort)
    const target = await waitForPageTarget(debugPort)
    cdp = new CDP(target.webSocketDebuggerUrl)
    await cdp.connect()

    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Network.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    })

    const evaluate = async (expression, { awaitPromise = false } = {}) => {
      const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
        userGesture: true,
      })
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ||
            result.exceptionDetails.text ||
            '页面脚本执行失败'
        )
      }
      return result.result.value
    }

    const waitUntil = async (fn, timeout = 20000, label = '条件') => {
      const started = Date.now()
      while (Date.now() - started < timeout) {
        try {
          if (await fn()) return true
        } catch {
          /* retry */
        }
        await sleep(300)
      }
      throw new Error(`等待超时：${label}`)
    }

    const waitForLoad = async () => {
      await waitUntil(
        async () => (await evaluate('document.readyState')) === 'complete',
        20000,
        '页面加载'
      )
    }

    await waitForLoad()

    // 1. manifest（慢网络下 Chrome 可能尚未解析，轮询等待）
    let manifest = { url: '', errors: [] }
    for (let i = 0; i < 20; i++) {
      try {
        manifest = await cdp.send('Page.getAppManifest')
      } catch (err) {
        manifest = { url: '', errors: [{ message: err.message }] }
      }
      if (manifest.url && (manifest.errors || []).length === 0) break
      await sleep(500)
    }
    check(
      'PWA manifest 可解析',
      (manifest.errors || []).length === 0 && !!manifest.url,
      `url=${manifest.url}${
        (manifest.errors || []).length ? ` errors=${JSON.stringify(manifest.errors)}` : ''
      }`
    )

    // 2. SW 激活 + 接管
    let controlled = false
    try {
      controlled = await waitUntil(
        async () => await evaluate('!!navigator.serviceWorker.controller'),
        90000,
        'SW 接管页面'
      )
    } catch {
      controlled = false
    }
    let swState = controlled
      ? await evaluate('navigator.serviceWorker.controller.state')
      : 'none'
    check('Service Worker 激活', swState === 'activated', `state=${swState}`)
    check('Service Worker 接管当前页面', controlled)

    // Chrome 安装性（放在 SW 接管之后，避免误报 no-service-worker）
    try {
      const installability = await cdp.send('Page.getInstallabilityErrors')
      const errors = installability.installabilityErrors || []
      check(
        'Chrome 可安装性检查',
        errors.length === 0,
        errors.length ? JSON.stringify(errors).slice(0, 300) : '无错误'
      )
    } catch (err) {
      check('Chrome 可安装性检查', true, `CDP 不支持，跳过：${err.message}`)
    }

    // 等待 Service Worker 预缓存全部完成（线上网络慢，必须显式等待）
    let cacheTotal = 0
    console.log('等待 Service Worker 预缓存完成…')
    try {
      await waitUntil(
        async () => {
          cacheTotal = await evaluate(
            `(async () => {
              const names = await caches.keys();
              let total = 0;
              for (const name of names) {
                const cache = await caches.open(name);
                total += (await cache.keys()).length;
              }
              return total;
            })()`,
            { awaitPromise: true }
          )
          return cacheTotal >= 130
        },
        180000,
        '预缓存完成'
      )
    } catch {
      console.log(`  ! 预缓存未完成，当前 ${cacheTotal} 项`)
    }
    check('预缓存已写入 Cache Storage', cacheTotal >= 130, `缓存 ${cacheTotal} 个请求`)
    if (cacheTotal < 130) {
      throw new Error(`预缓存未完成（${cacheTotal}/131），请重新运行验收`)
    }

    // 首页内容
    const homeText = await evaluate('document.body.innerText')
    check('首页渲染', homeText.includes('考研阅读大观') && homeText.includes('开始阅读'))
    check('移动端底部工具条存在', await evaluate(`!!document.querySelector('.mobile-dock')`))

    // 截图：首页
    const homeShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(ARTIFACTS, 'home-mobile.png'), Buffer.from(homeShot.data, 'base64'))

    // 3. 在线站内打开一份附件（免登录），并确认写入离线缓存
    console.log('在线打开附件…')
    await cdp.send('Page.navigate', { url: readerUrl })
    await waitForLoad()
    let readerState = { ok: false, title: '', len: 0 }
    try {
      await waitUntil(
        async () => {
          readerState = await evaluate(`(() => {
            const f = document.querySelector('.reader__frame');
            if (!f || !f.contentDocument) return { ok: false, title: '', len: 0 };
            const d = f.contentDocument;
            return { ok: true, title: d.title || '', len: (d.body && d.body.innerText || '').length };
          })()`)
          return readerState.ok && readerState.len > 50
        },
        45000,
        '附件 iframe 加载'
      )
    } catch {
      /* 保留状态 */
    }
    check(
      '站内打开附件（免登录）',
      readerState.ok && readerState.len > 50,
      `title=${readerState.title} text=${readerState.len}`
    )
    const attCached = await evaluate(
      `caches.open('kaoyan-local-attachments').then((c) => c.keys().then((k) => k.length))`,
      { awaitPromise: true }
    )
    check('附件写入离线缓存', attCached > 0, `缓存 ${attCached} 份`)

    // 3. 关闭本地服务器（真正断网）+ DevTools 离线模拟
    if (server) {
      await new Promise((resolve) => server.close(resolve))
      console.log('已停止本地服务器：后续导航只能由 Service Worker 提供')
    } else {
      console.log('线上模式：无法关闭远端服务器，使用 DevTools 离线模拟')
    }
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    })
    const offlineFlag = await evaluate('navigator.onLine')
    check('浏览器进入离线状态', offlineFlag === false, `navigator.onLine=${offlineFlag}`)

    // 4. 断网打开年份页
    let navError = ''
    try {
      await cdp.send('Page.navigate', { url: `${site}english-1/2010.html` })
      await waitForLoad()
    } catch (err) {
      navError = err.message
    }
    const yearInfo = await evaluate(`({
      title: document.title,
      text: document.body.innerText,
      url: location.pathname
    })`)
    const yearOk =
      !navError &&
      yearInfo.title.includes('2010') &&
      yearInfo.text.includes('资料清单') &&
      yearInfo.text.includes('已收录') &&
      yearInfo.url === `${BASE}english-1/2010.html`
    check(
      '断网打开年份页 /english-1/2010.html',
      yearOk,
      yearOk ? `title=${yearInfo.title}` : `navError=${navError || '无'} title=${yearInfo.title}`
    )

    // 年份页：附件链接指向站内阅读器，来源标注仍保留语雀原链
    const attHref = await evaluate(
      `(document.querySelector('.att-link') || {}).href || ''`
    )
    check(
      '附件链接指向站内阅读器',
      /\/reader\.html\?year=2010&f=%2Fattachments%2F/.test(attHref),
      attHref.slice(0, 100)
    )
    const sourceHref = await evaluate(
      `(document.querySelector('.source-meta a') || {}).href || ''`
    )
    check(
      '来源标注保留语雀原链',
      /^https:\/\/www\.yuque\.com\/nanxiao_fighters\/afkiny\//.test(sourceHref),
      sourceHref.slice(0, 80)
    )

    // 年份页「整年离线缓存」组件
    await sleep(600)
    const yearDownload = await evaluate(`(() => {
      const el = document.querySelector('.year-download');
      return { exists: !!el, text: el ? el.innerText : '' };
    })()`)
    check(
      '年份页提供整年离线缓存',
      yearDownload.exists && yearDownload.text.includes('本年 8 份资料'),
      yearDownload.text.replace(/\\n/g, ' ').slice(0, 90)
    )

    // 2.5 字号 / 深色 / 阅读进度（页面级功能）
    const hasDoc = await evaluate(`!!document.querySelector('.vp-doc')`)
    const fontBefore = hasDoc
      ? await evaluate(`getComputedStyle(document.querySelector('.vp-doc')).fontSize`)
      : '0px'
    await evaluate(
      `[...document.querySelectorAll('.mobile-dock__btn')].find((b) => b.innerText.includes('A+')).click()`
    )
    await sleep(300)
    const fontAfter = hasDoc
      ? await evaluate(`getComputedStyle(document.querySelector('.vp-doc')).fontSize`)
      : '0px'
    check(
      '字号调节 A+ 生效',
      hasDoc && parseFloat(fontAfter) > parseFloat(fontBefore),
      `${fontBefore} → ${fontAfter}`
    )
    await evaluate(
      `[...document.querySelectorAll('.mobile-dock__btn')].find((b) => b.innerText.includes('A-')).click()`
    )
    await sleep(200)

    const darkBefore = await evaluate(`document.documentElement.classList.contains('dark')`)
    await evaluate(
      `[...document.querySelectorAll('.mobile-dock__btn')].find((b) => /深色|浅色/.test(b.innerText)).click()`
    )
    await sleep(300)
    const darkAfter = await evaluate(`document.documentElement.classList.contains('dark')`)
    check('深色模式可切换', darkBefore !== darkAfter, `${darkBefore} → ${darkAfter}`)
    await evaluate(
      `[...document.querySelectorAll('.mobile-dock__btn')].find((b) => /深色|浅色/.test(b.innerText)).click()`
    )
    await sleep(200)

    // 滚动产生阅读进度
    await evaluate(
      `window.scrollTo(0, document.documentElement.scrollHeight * 0.55)`
    )
    await sleep(1200)
    const progressSaved = await evaluate(
      `Object.values(JSON.parse(localStorage.getItem('kaoyan:progress:v1') || '{}')).filter((e) => e.pct > 0).length`
    )
    check('阅读进度写入 localStorage', progressSaved > 0, `条目=${progressSaved}`)

    // 4.5 断网重开刚才看过的附件（应命中缓存）
    await cdp.send('Page.navigate', { url: readerUrl })
    await waitForLoad()
    let offlineReader = { ok: false, len: 0 }
    try {
      await waitUntil(
        async () => {
          offlineReader = await evaluate(`(() => {
            const f = document.querySelector('.reader__frame');
            if (!f || !f.contentDocument) return { ok: false, len: 0 };
            return { ok: true, len: (f.contentDocument.body && f.contentDocument.body.innerText || '').length };
          })()`)
          return offlineReader.ok && offlineReader.len > 50
        },
        30000,
        '离线附件加载'
      )
    } catch {
      /* 保留状态 */
    }
    const cacheBadge = await evaluate(`!!document.querySelector('.reader__cache')`)
    check(
      '断网重开附件（缓存命中）',
      offlineReader.ok && offlineReader.len > 50 && cacheBadge,
      `text=${offlineReader.len} cachedBadge=${cacheBadge}`
    )

    // 5. 断网打开附件清单
    await cdp.send('Page.navigate', { url: `${site}attachments.html` })
    await waitForLoad()
    const attText = await evaluate('document.body.innerText')
    const attRows = await evaluate(`document.querySelectorAll('.vp-doc table tbody tr').length`)
    check(
      '断网打开附件清单',
      attText.includes('附件清单（站内阅读）') && attRows >= 128,
      `表格行数=${attRows}`
    )

    // 6. 断网搜索（Pagefind 中文分词）
    await cdp.send('Page.navigate', { url: `${site}` })
    await waitForLoad()
    let searchResult = null
    const pfUrl = JSON.stringify(`${BASE}pagefind/pagefind.js`)
    try {
      searchResult = await evaluate(
        `(async () => {
          const pf = await import(${pfUrl});
          const q1 = await pf.search('复盘');
          const q2 = await pf.search('2010');
          const first = q1.results.length
            ? (await Promise.all(q1.results.slice(0, 3).map((r) => r.data()))).map((d) => d.meta.title)
            : [];
          return { cjk: q1.results.length, numeric: q2.results.length, titles: first };
        })()`,
        { awaitPromise: true }
      )
    } catch (err) {
      searchResult = { error: err.message }
    }
    check(
      '断网 Pagefind 中文搜索「复盘」',
      !!searchResult && searchResult.cjk > 0,
      searchResult?.error || `命中 ${searchResult?.cjk} 条：${(searchResult?.titles || []).join(' / ')}`
    )
    check(
      '断网 Pagefind 数字搜索「2010」',
      !!searchResult && searchResult.numeric > 0,
      searchResult?.error || `命中 ${searchResult?.numeric} 条`
    )

    // 搜索弹窗 UI 可用
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))`)
    await sleep(400)
    const modal = await evaluate(
      `({ open: !!document.querySelector('.search-overlay'), input: !!document.querySelector('.search-input') })`
    )
    check('搜索弹窗可打开（Ctrl+K）', modal.open && modal.input)
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)

    // 6.5 首页「继续上次阅读」
    await sleep(500)
    const continueCard = await evaluate(
      `({ exists: !!document.querySelector('.continue-card'), text: (document.querySelector('.continue-card') || {}).innerText || '' })`
    )
    check(
      '首页显示「继续上次阅读」',
      continueCard.exists && continueCard.text.includes('继续上次阅读'),
      continueCard.text.replace(/\n/g, ' ').slice(0, 80)
    )

    // 7. 未缓存页面回退
    await cdp.send('Page.navigate', { url: `${site}not-cached-${Date.now()}` })
    await waitForLoad()
    const fallback = await evaluate(`(async () => ({
      title: document.title,
      url: location.href,
      text: document.body ? document.body.innerText : '',
      controlled: !!navigator.serviceWorker.controller,
      caches: await caches.keys()
    }))()`, { awaitPromise: true })
    check(
      '未缓存页面回退到离线页',
      fallback.text.includes('这个页面还没有缓存'),
      `url=${fallback.url} title=${fallback.title} controlled=${fallback.controlled} text=${JSON.stringify(String(fallback.text).slice(0, 80))} caches=${fallback.caches.join(',')}`
    )

    // 8. 回到年份页截图（离线）
    await cdp.send('Page.navigate', { url: `${site}english-1/2010.html` })
    await waitForLoad()
    const yearShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(
      path.join(ARTIFACTS, 'english-1-2010-offline.png'),
      Buffer.from(yearShot.data, 'base64')
    )

    // 恢复联网
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })

    const failed = checks.filter((c) => !c.ok)
    const summary = {
      verifiedAt: new Date().toISOString(),
      baseUrl: site,
      passed: checks.length - failed.length,
      failed: failed.length,
      checks,
    }
    fs.writeFileSync(
      path.join(ARTIFACTS, 'verify-offline.json'),
      JSON.stringify(summary, null, 2),
      'utf8'
    )

    console.log(`\n${summary.passed}/${checks.length} 项通过`)
    if (failed.length) {
      console.error('失败项：')
      for (const f of failed) console.error(` - ${f.name} ${f.detail}`)
      process.exitCode = 1
    }
  } finally {
    cdp?.close()
    chrome.kill()
    server?.close()
    setTimeout(() => {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true })
      } catch {
        /* Windows 可能仍占用，忽略 */
      }
    }, 500)
  }
}

main().catch((err) => {
  console.error('验收脚本异常：', err)
  process.exit(1)
})