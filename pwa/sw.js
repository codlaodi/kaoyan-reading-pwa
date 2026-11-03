/* eslint-disable no-restricted-globals */
/**
 * 自定义 Service Worker（Workbox injectManifest）
 * ---------------------------------------------------------------------------
 * 预缓存：构建时由 workbox-build 注入预缓存清单（__WB_MANIFEST），包含
 *   所有 HTML 页面、JS/CSS、字体（woff2）、图标、PWA manifest，以及 Pagefind
 *   的索引分片与 wasm（离线搜索依赖）。
 *
 * 导航策略：
 *   - 已预缓存页面由 precache 路由直接命中（支持 cleanUrls / directoryIndex）；
 *   - 未缓存页面回退到 offline.html，避免离线时出现浏览器错误页。
 *
 * 附件：语雀附件需要登录，不预缓存；若日后把合法的本地副本放到
 *   /attachments/ 下，则采用 CacheFirst 运行时缓存（看过的可离线）。
 */
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

precacheAndRoute(self.__WB_MANIFEST, {
  cleanUrls: true,
  directoryIndex: 'index.html',
  // Pagefind 在加载 pagefind-entry.json 时会附加 ?ts=... 用于防缓存，
  // 必须忽略该参数，否则离线时无法命中预缓存。
  ignoreURLParametersMatching: [/^ts$/, /^utm_/, /^fbclid$/],
})
cleanupOutdatedCaches()

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/** 离线兜底页：不依赖 VitePress 客户端路由（否则会被渲染成 404），链接按部署 base 生成 */
function offlineResponse() {
  const scope = self.registration.scope
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>离线 · 考研阅读大观</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    background: #f7f8fa; color: #1f2937; }
  .card { width: min(420px, 100%); padding: 28px 24px; border-radius: 18px; background: #fff;
    box-shadow: 0 16px 48px rgba(15, 23, 42, .1); text-align: center; }
  h1 { margin: 0 0 10px; font-size: 22px; }
  p { margin: 0 0 20px; font-size: 14px; line-height: 1.8; color: #6b7280; }
  a { display: block; margin: 10px 0; padding: 11px 16px; border-radius: 10px; text-decoration: none;
    font-size: 14px; font-weight: 600; }
  .primary { background: #0f766e; color: #fff; }
  .ghost { border: 1px solid #e5e7eb; color: #0f766e; }
  .hint { margin-top: 16px; font-size: 12px; color: #9ca3af; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b1220; color: #e5e7eb; }
    .card { background: #111827; box-shadow: none; }
    p { color: #9ca3af; }
    .ghost { border-color: #374151; }
  }
</style>
</head>
<body>
  <main class="card">
    <h1>这个页面还没有缓存</h1>
    <p>当前处于离线状态，该页面不在离线缓存中。<br>回到已缓存的目录页即可继续阅读。</p>
    <a class="primary" href="${scope}">回到首页</a>
    <a class="ghost" href="${scope}english-1/index.html">英语一目录</a>
    <div class="hint">联网后打开本页一次，下次即可离线访问。</div>
  </main>
</body>
</html>`
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
/** 把请求路径转成相对 scope 的预缓存键候选项 */
function candidatesFor(url) {
  const scopePath = new URL(self.registration.scope).pathname
  let rel = url.pathname.startsWith(scopePath)
    ? url.pathname.slice(scopePath.length)
    : url.pathname.replace(/^\//, '')
  rel = rel.replace(/^\/+/, '')
  const out = []
  if (!rel || rel.endsWith('/')) {
    out.push(`${rel}index.html`)
  } else {
    out.push(rel, `${rel}.html`, `${rel}/index.html`)
  }
  return out
}

registerRoute(
  new NavigationRoute(
    async ({ request }) => {
      const url = new URL(request.url)
      for (const candidate of candidatesFor(url)) {
        const hit = await matchPrecache(candidate)
        if (hit) return hit
      }
      return offlineResponse()
    },
    // 附件（含 iframe 导航）不交给页面导航回退，交给下面的 CacheFirst
    { denylist: [/\/attachments\//] }
  )
)

/** 可选的本地附件镜像：/attachments/ 下看过的文件缓存一年 */
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    request.destination !== 'document' &&
    /\/attachments\//.test(url.pathname),
  new CacheFirst({
    cacheName: 'kaoyan-local-attachments',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 365,
        purgeOnQuotaError: true,
      }),
    ],
  })
)