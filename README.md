# 考研阅读大观 · 英语一 PWA 离线阅读

把语雀公开知识库 [《考研阅读大观》](https://www.yuque.com/nanxiao_fighters/afkiny) 的**英语一**部分，做成可安装到安卓主屏幕、断网可读的静态 PWA。

- 范围：**英语一 2010–2025**，17 篇文档（1 个分区页 + 16 个年份页）；**英语二未收录**。
- 内容：目录、标题、资料清单、来源标注、yuque-dl 抓取的原文 Markdown。
- 附件：128 个 HTML 资料（做题 / 复盘）**需要登录语雀**才能查看正文，因此站点不包含其内容，只保留完整清单与原始链接。详见 [附件清单与登录限制](docs/ATTACHMENTS.md)。

| 首页（移动端） | 年份页（离线） |
| --- | --- |
| ![首页](artifacts/home-mobile.png) | ![年份页](artifacts/english-1-2010-offline.png) |

## 功能

| 功能 | 实现 |
| --- | --- |
| 目录导航 | VitePress 侧边栏 + 首页 16 个年份卡片 + 移动端抽屉 |
| 全文搜索 | Pagefind 1.6 本地索引（中文分词），自绘搜索弹窗，`Ctrl/⌘+K` 或 `/` 唤起 |
| 阅读进度 | 顶部进度条、按页记录百分比、首页「继续上次阅读」、页内续读提示 |
| 深色模式 | VitePress 主题 + 移动端工具条一键切换，偏好本地保存 |
| 字号调节 | A- / A+ 五档（90%–130%），仅作用于正文，localStorage 记忆 |
| 离线阅读 | Workbox 预缓存 131 个文件（HTML/JS/CSS/字体/图标/Pagefind 索引/wasm） |
| PWA 安装 | manifest（192/512/maskable）+ Service Worker + 独立窗口启动 |
| 无账号 / 无追踪 | 纯静态，无后端、无统计、无第三方脚本 |

## 快速开始

要求 **Node.js ≥ 18.18**、**pnpm ≥ 10**（开发时使用 Node 24 / pnpm 11）。

```bash
pnpm install

pnpm dev        # 本地开发 http://localhost:5173
pnpm build      # 内容 → VitePress → Pagefind → Service Worker → 自检
pnpm preview    # 预览构建产物 http://127.0.0.1:4173
pnpm verify     # 无头 Chrome 断网验收（需要本机 Chrome 或 Edge）
```

Windows PowerShell 指定部署子路径：

```powershell
$env:BASE_PATH="/<仓库名>/"; pnpm build
```

### 常用脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm fetch` | 用语雀公开接口重新抓取元数据 → `raw/manifest.json`（不登录） |
| `pnpm content` | 由 `raw/` 生成 `content/` Markdown 与 `raw/attachments.csv` |
| `pnpm build` | 全量构建 + 产物自检（推荐） |
| `pnpm dev` | VitePress 开发服务器 |
| `pnpm preview` | 本地静态预览（支持 `BASE_PATH`） |
| `pnpm verify` | 自动离线验收，输出 `artifacts/verify-offline.json` 与截图 |
| `pnpm icons` | 用 Pillow 重新生成 PWA 图标（需 Python + Pillow） |

## 目录结构

```text
yuque-pwa/
├─ content/                     # VitePress 内容源（由 raw/ 生成，可重新生成）
│  ├─ index.md                  # 首页（hero + 继续阅读 + 范围说明）
│  ├─ english-1/
│  │  ├─ index.md               # 分区总览 + 年份卡片
│  │  └─ 2010.md … 2025.md      # 16 个年份页（来源栏 / 资料表 / 原文折叠区）
│  ├─ guide.md / about.md / attachments.md / offline.md
│  └─ public/                   # 原样拷贝到站点根：manifest、图标、logo、favicon
├─ raw/                         # 抓取原料（可追溯，构建只读）
│  ├─ manifest.json             # 17 篇文档 + 128 个附件元数据 + 访问性抽查
│  ├─ attachments.csv           # 附件清单（Excel 可读）
│  ├─ README.md                 # 抓取方式与来源说明
│  └─ yuque-dl/                 # yuque-dl 下载的原文 Markdown（仅英语一）
├─ scripts/
│  ├─ fetch-yuque.mjs           # 公开接口抓元数据（不登录）
│  ├─ build-content.mjs         # raw → content 的确定性生成
│  ├─ build.mjs                 # 构建总入口（5 步 + 自检）
│  ├─ serve-dist.mjs            # 本地静态服务器（支持 BASE_PATH）
│  ├─ verify-offline.mjs        # Chrome CDP 断网验收（19 项）
│  └─ make-icons.py             # PWA 图标生成
├─ pwa/sw.js                    # 自定义 Service Worker（esbuild 打包）
├─ .vitepress/
│  ├─ config.mts                # 站点、侧边栏、head、标题模板
│  └─ theme/                    # 自定义 Layout、搜索、字号、进度、移动端工具条、样式
├─ docs/                        # 部署 / PWA / 验收 / 附件说明
├─ artifacts/                   # 验收截图与 JSON 报告
├─ .github/workflows/deploy.yml # GitHub Pages 自动部署
├─ vercel.json                  # Vercel 部署配置
└─ LICENSE                      # 代码 MIT；内容版权归原作者
```

## 构建产物说明

`pnpm build` 输出到 `.vitepress/dist/`（当前约 **2.4 MB**，131 个预缓存条目）：

| 产物 | 说明 |
| --- | --- |
| `index.html`、`english-1/*.html`、`guide.html`、`about.html`、`attachments.html`、`offline.html`、`404.html` | 23 个静态页面 |
| `assets/` | VitePress 客户端 JS/CSS 与 Inter 字体（woff2，含多语言子集） |
| `pagefind/` | 中文搜索索引：`pagefind.js`、worker、wasm、`pagefind-entry.json`、22 个分片 |
| `manifest.webmanifest`、`icons/`、`logo.svg`、`favicon.svg` | PWA 元数据与图标 |
| `sw.js` | Workbox 预缓存 Service Worker（约 35 KB，已内联预缓存清单） |
| `hashmap.json`、`vp-icons.css` | VitePress 运行时附属文件 |

产物自检会验证：manifest、图标、`sw.js`、Pagefind、关键页面、SW 清单包含 Pagefind 与离线页。

## PWA 配置

- **Manifest**：相对路径 `start_url`/`scope`/图标，同一份产物可部署在根路径或任意子路径。
- **预缓存**：构建时扫描 `dist` 全量文件（忽略 `sw.js`、map），Pagefind 的索引与 wasm 全部包含。
- **离线搜索关键点**：Pagefind 会给 `pagefind-entry.json` 附加 `?ts=`，SW 的 `ignoreURLParametersMatching` 必须忽略 `ts`。
- **导航回退**：未缓存页面返回独立兜底页（避免被 VitePress 路由渲染成 404）。
- **更新**：新 SW 等待 → 页面提示「站点有新版本」→ `SKIP_WAITING` → 自动刷新。
- **附件**：不预缓存；预留 `/attachments/` 运行时 `CacheFirst`，供日后合法本地镜像使用。

完整说明见 [docs/PWA.md](docs/PWA.md)。

## 部署

已提供两套免费方案：

- **GitHub Pages**：仓库 Settings → Pages → Source 选 **GitHub Actions**，推送到 `main` 即自动构建发布；工作流会自动计算子路径 `BASE_PATH`。
- **Vercel**：导入仓库即可，`vercel.json` 已配置构建命令与输出目录。

逐步操作、base 说明与常见问题见 [docs/DEPLOY.md](docs/DEPLOY.md)。

> 我没有你的 GitHub / Vercel 账号，无法代你完成首次授权与推送；工作流会在你 push 后自动部署。本机未安装 git，可用 Git 安装包、GitHub Desktop 或网页上传。

## 验收

自动化验收 **19/19 通过**，覆盖：manifest 可解析、Chrome 可安装、SW 激活与接管、131 项预缓存、断网打开首页/年份页/附件清单、中文与数字搜索、字号、深色、阅读进度、继续阅读、未缓存页回退。

- 验收方法：先 `pnpm build`，再 `pnpm verify`。脚本会**先停掉本地服务器**再断网，避免“其实还在访问 localhost”的假通过。
- 已在 `BASE_PATH=/` 与 `BASE_PATH=/kaoyan-pwa/` 两种部署路径下各跑一遍，均 19/19。
- 安卓手动清单见 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。

## 数据来源与边界

| 项目 | 说明 |
| --- | --- |
| 来源 | 语雀公开知识库《考研阅读大观》，`https://www.yuque.com/nanxiao_fighters/afkiny` |
| 抓取 | 匿名公开页面 + 公开 JSON 接口；正文 Markdown 由 yuque-dl 1.0.87 生成；**全程未登录** |
| 范围 | 仅“阅读英语一10-25”分区；英二目录未进入仓库 |
| 附件 | 128 个 HTML，约 393.4 MB，匿名访问 302 → `/login`，本项目不绕过 |
| 版权 | 原文/真题/解析版权归原作者及权利人；本站仅作个人离线阅读与检索 |
| 隐私 | 无账号、无后端、无统计；进度/字号/主题仅存 `localStorage` |

初始探测的完整记录（链接状态、34 篇目录、正文形态、附件登录墙、匿名导出尝试）见 [docs/SURVEY.md](docs/SURVEY.md)。

## 已知限制

- 站内没有 128 份附件的正文（需登录语雀），年份页提供的是资料清单与原始链接。
- 断网时外部链接（语雀附件、B 站视频）不可用。
- 阅读进度不跨设备同步，清除站点数据会丢失。
- 本机没有 git，首次推送到 GitHub 需要你安装 Git 或使用网页/GitHub Desktop。

## License

代码与构建脚本：[MIT](LICENSE)。`raw/` 与 `content/english-1/` 中的文档内容版权归原作者，不在 MIT 授权范围内。