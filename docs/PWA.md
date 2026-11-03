# PWA 配置说明

本项目是「纯静态 + Service Worker」的 PWA：没有后端、没有账号体系，所有离线能力都在浏览器端完成。

## 1. 组成

| 组成 | 文件 | 说明 |
| --- | --- | --- |
| Web App Manifest | `content/public/manifest.webmanifest` | 名称、图标、主题色、启动地址、快捷方式 |
| 图标 | `content/public/icons/*.png` + `logo.svg` / `favicon.svg` | 192 / 512 / maskable 512 / Apple 180 / favicon 32 |
| Service Worker | `pwa/sw.js` → 构建为 `dist/sw.js` | Workbox 预缓存 + 导航回退 + 附件运行时缓存 |
| 注册与更新 | `.vitepress/theme/components/PwaUpdate.vue` | 注册 SW、检测新版本、提示刷新、离线状态提示 |
| 入口注入 | `.vitepress/config.mts` 的 `head` | `<link rel="manifest">`、`apple-touch-icon`、`theme-color` |

构建时 `scripts/build.mjs` 会：

1. VitePress 产出静态站；
2. Pagefind 生成中文索引；
3. `workbox-build.getManifest()` 扫描 `dist` 生成预缓存清单；
4. 用 esbuild 把 `pwa/sw.js` 与 Workbox 运行时代码打包成**经典脚本** `dist/sw.js`（不依赖 ES Module SW）。

## 2. Manifest

关键字段：

```json
{
  "id": "./",
  "name": "考研阅读大观 · 英语一",
  "short_name": "考研阅读",
  "start_url": "./?source=pwa",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f7f8fa",
  "theme_color": "#0f766e",
  "icons": [192 any, 512 any, 512 maskable],
  "shortcuts": [目录, 附件清单, 使用帮助]
}
```

- **全部使用相对路径**（`./`、`icons/...`），所以同一份产物既能部署在根路径（Vercel），也能部署在子路径（`https://user.github.io/repo/`），无需为 base 改 manifest。
- `start_url` 的 `?source=pwa` 便于日后统计来源（当前无统计脚本，不影响功能）。
- `scope: "./"` 限定在站点目录内，避免劫持同域其他应用。

## 3. Service Worker 策略

### 3.1 预缓存（Precache）

构建时扫描 `dist` 全部文件，忽略 `sw.js` 与 `*.map`。当前产物：**131 个文件 / 约 2.4 MB**，包括：

- 23 个 HTML 页面（首页、分区、16 个年份页、指南、关于、附件清单、离线页、404）
- `assets/` 下的 JS / CSS
- VitePress 自带的 Inter 字体（`woff2`，多子集）
- 图标、`logo.svg`、`favicon.svg`、`manifest.webmanifest`
- **Pagefind 全套索引**：`pagefind.js`、`pagefind-worker.js`、wasm、`pagefind-entry.json`、22 个页面分片（`.pf_fragment`）、索引文件

`precacheAndRoute` 配置：

```js
precacheAndRoute(self.__WB_MANIFEST, {
  cleanUrls: true,
  directoryIndex: 'index.html',
  ignoreURLParametersMatching: [/^ts$/, /^utm_/, /^fbclid$/],
})
```

- `cleanUrls`：兼容 `/foo` → `foo.html`，即使站点统一使用 `.html` 链接也不受影响。
- **`ignoreURLParametersMatching` 包含 `/^ts$/` 是离线搜索的关键**：Pagefind 加载 `pagefind-entry.json` 时会附加 `?ts=<时间戳>` 防缓存，如果 SW 不忽略该参数，离线时永远命中不了预缓存。
- `cleanupOutdatedCaches()` 清理旧版本缓存。

### 3.2 导航策略

- 已预缓存的页面：由 precache 路由直接返回，支持 `/english-1/2010.html`、`/english-1/`、`/`。
- 未缓存的页面：`NavigationRoute` 返回**内置的离线兜底页**（不是 VitePress 的 `offline.html`）。
  原因：把 `offline.html` 返回给任意未知 URL 时，VitePress 客户端路由会把它渲染成 404；兜底页是独立 HTML，链接按 `self.registration.scope` 生成，子路径部署也正确。
- 兜底页不写入缓存，随 SW 版本更新。

### 3.3 附件运行时缓存（预留）

语雀附件需要登录，**不会**被预缓存。SW 里保留了一条运行时规则：

```js
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    request.destination !== 'document' &&
    /\/attachments\//.test(url.pathname),
  new CacheFirst({ cacheName: 'kaoyan-local-attachments', /* 80 个 / 365 天 */ })
)
```

如果日后你把**合法获得**的附件副本放进站点 `/attachments/...`，用户打开过的文件会被缓存一年，可离线查看。当前仓库不包含任何附件正文。

### 3.4 更新机制

1. 部署新版本 → 浏览器下次访问时拉取新 `sw.js`。
2. 新 SW `installed` 且已有旧 SW 控制页面时，页面右下角出现「站点有新版本 / 立即更新」。
3. 点击后 `postMessage('SKIP_WAITING')`，SW 调用 `skipWaiting()`；`controllerchange` 触发一次自动刷新。
4. 首次安装时 `clients.claim()` 接管页面，但**不会**自动刷新（`PwaUpdate` 记录了 `hadController`）。

缓存名称带版本（Workbox 自动管理），旧文件在 `activate` 后由 `cleanupOutdatedCaches()` 清理。

## 4. 离线能力边界

| 内容 | 离线可用 | 说明 |
| --- | --- | --- |
| 首页 / 目录 / 16 个年份页 / 指南 / 关于 / 附件清单 | ✅ | 全部预缓存 |
| Pagefind 搜索（含中文分词） | ✅ | 索引、分片、wasm 全部预缓存 |
| 深色模式 / 字号 / 阅读进度 | ✅ | 纯前端 + localStorage |
| 语雀附件（128 个 HTML） | ❌ | 需登录，未收录 |
| 年份页中指向 B 站等外部链接 | ❌ | 离线时不可达 |
| 未访问过的未知页面 | ⚠️ | 显示离线兜底页 |

## 5. 为什么不需要账号

- 站点是静态文件，没有 API、没有数据库。
- 阅读进度、字号、主题只写入 `localStorage`（键名 `kaoyan:*`、`vitepress-theme-appearance`）。
- 搜索在本地完成，查询词不会发送到任何服务器。
- 无第三方统计、无 Cookie、无广告脚本。

## 6. 安装条件（Android）

Chrome / Edge 要求：

1. **HTTPS**（`localhost` 例外）；
2. 有 `manifest.webmanifest`，含 192 与 512 图标、`name`、`start_url`、`display: standalone`；
3. 注册了带 `fetch` 处理器的 Service Worker；
4. 不是无痕模式。

满足后：右上角 **⋮ → 添加到主屏幕 / 安装应用**。

> 本项目用 Chrome 156 的无头模式运行 `Page.getInstallabilityErrors`，返回**无错误**（见验收报告）。

## 7. 调试

- Chrome DevTools → Application → Manifest / Service Workers / Cache Storage。
- 勾选 **Offline** 后刷新，应能看到首页与年份页。
- 清缓存：Application → Storage → Clear site data（会同时清除阅读进度与字号偏好）。
- 本地验证：`pnpm build && pnpm preview`，再执行 `pnpm verify`（自动断网验收）。