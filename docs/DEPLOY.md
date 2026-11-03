# 部署说明

本目录已经是可构建的完整项目，但**部署需要你自己的托管账号**。我没有服务器/Git 账号，因此不会代你推送；下面是可以直接复制的步骤。

两种免费方案任选其一：

- **A. GitHub Pages**（推荐给“放自己仓库、自动构建”）
- **B. Vercel**（推荐给“只想点几下、不折腾 Actions”）

两种都支持 HTTPS，PWA 安装与离线都可正常使用。

---

## 0. 先本地构建一次（可选，确认环境）

要求：Node.js ≥ 18.18，pnpm ≥ 10（本项目锁文件由 pnpm 11 生成）。

```bash
pnpm install
pnpm build        # 生成 .vitepress/dist
pnpm preview      # 打开 http://127.0.0.1:4173/
pnpm verify       # 无头 Chrome 断网验收（需要本机有 Chrome/Edge）
```

`pnpm build` 会自动完成：内容生成 → VitePress → Pagefind → Service Worker → 产物自检。

---

## A. GitHub Pages

### A1. 准备仓库

1. 在 GitHub 新建仓库，例如 `kaoyan-reading-pwa`（Public 或 Private 均可；Pages 对 Private 仓库的可用性取决于账号套餐）。
2. 把本项目**全部文件**推到 `main` 分支（`node_modules`、`.vitepress/cache`、`.vitepress/dist`、`_tools` 已被 `.gitignore` 忽略）。

命令行方式：

```bash
cd yuque-pwa
git init
git add .
git commit -m "feat: kaoyan reading PWA (english I)"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

> 本机当前未安装 git。也可以：
> - 安装 Git 后执行上面的命令；或
> - 在 GitHub 网页端上传压缩包解压后的文件（注意保留 `.github/` 目录，否则 Actions 不会存在）；或
> - 使用 GitHub Desktop 拖入文件夹。

### A2. 开启 Pages（GitHub Actions）

1. 仓库 → **Settings → Pages**。
2. **Build and deployment → Source** 选择 **GitHub Actions**（不要选 “Deploy from a branch”）。
3. 推送到 `main` 后，`.github/workflows/deploy.yml` 自动运行：
   - 安装依赖 → `pnpm build`
   - 自动计算 `BASE_PATH`：`<用户名>.github.io` 仓库用 `/`，其他仓库用 `/<仓库名>/`
   - 上传 `.vitepress/dist` 并发布
4. 在 **Actions** 页看进度；完成后 Pages 页面会显示地址：
   `https://<用户名>.github.io/<仓库名>/`

### A3. 自定义域名（可选）

Settings → Pages → Custom domain。绑定后把 `BASE_PATH` 改成 `/`：

- 修改 `.github/workflows/deploy.yml` 中的 `Compute BASE_PATH`，直接 `echo "BASE_PATH=/" >> $GITHUB_ENV`；或
- 在仓库 **Settings → Secrets and variables → Actions → Variables** 增加 `BASE_PATH=/` 并在工作流里读取。

### A4. 手动发布（不用 Actions）

```bash
BASE_PATH=/<仓库名>/ pnpm build
# 把 .vitepress/dist 的内容推到 gh-pages 分支
```

然后 Settings → Pages → Source 选 **Deploy from a branch** → `gh-pages` / `root`。
（更推荐 Actions，能自动带 base、无需手动维护分支。）

---

## B. Vercel

1. 把仓库推到 GitHub（同上）。
2. 打开 <https://vercel.com/new>，选择 **Import Git Repository**。
3. 项目配置（通常会自动识别）：
   - Framework Preset：**Other**
   - Install Command：`pnpm install --frozen-lockfile`
   - Build Command：`pnpm build`
   - Output Directory：`.vitepress/dist`
   - Node.js Version：22.x
4. **Environment Variables**：不需要设置（Vercel 部署在根路径，`BASE_PATH` 默认 `/`）。
5. Deploy。完成后地址形如 `https://<project>.vercel.app/`。

`vercel.json` 已包含：构建/输出目录、`cleanUrls: false`、`sw.js` 不缓存、manifest MIME、Pagefind/静态资源长缓存。

### 用 Vercel CLI（可选）

```bash
npm i -g vercel
vercel          # 首次会要求登录并关联项目
vercel --prod
```

---

## 3. BASE_PATH 说明（最容易踩坑）

| 部署位置 | BASE_PATH |
| --- | --- |
| Vercel / 自定义域名 / `<用户名>.github.io` 根仓库 | `/` |
| GitHub Pages 项目站点 `https://user.github.io/repo/` | `/repo/` |

构建时通过环境变量传入：

```bash
BASE_PATH=/repo/ pnpm build        # macOS / Linux / Git Bash
$env:BASE_PATH="/repo/"; pnpm build  # Windows PowerShell
```

工作流已自动处理，无需手改配置。

---

## 4. 部署后自检

1. 打开站点，DevTools → Application：
   - Manifest 有名称与图标，无错误；
   - Service Workers 状态为 activated；
   - Cache Storage 里约 131 个条目。
2. 断网（DevTools Offline 或飞行模式）后刷新：首页与年份页应可打开。
3. 搜索「复盘」「2010」有结果。
4. 手机 Chrome 菜单出现「安装应用 / 添加到主屏幕」。
5. `https://<站点>/sw.js` 返回 `Content-Type: text/javascript`，且 `Cache-Control: no-cache`（Vercel 已配置；GitHub Pages 默认会缓存几分钟，属正常）。

---

## 5. 常见问题

**Q：部署后页面样式丢失 / 404？**
A：几乎都是 `BASE_PATH` 不对。项目站点必须是 `/<仓库名>/`，根站点是 `/`。重新构建即可。

**Q：刷新子页面 404？**
A：本项目使用 `/xxx.html` 链接，GitHub Pages 与 Vercel 都能直接命中；若你改成无扩展名链接，GitHub Pages 不支持 clean URL 重写。

**Q：断网后搜索没结果？**
A：确认部署的是最新构建（包含 `pagefind/` 与 `sw.js`），并在联网状态打开过一次让 SW 完成预缓存。SW 对 `pagefind-entry.json?ts=...` 做了参数忽略，旧版本可能没有。

**Q：更新后看到的还是旧内容？**
A：等待 SW 更新提示，点「立即更新」；或在 DevTools → Application → Service Workers 勾选 Update on reload。

**Q：附件打不开？**
A：附件在语雀，需要登录语雀账号；本站不代理、不转存。详见 [附件清单](./ATTACHMENTS.md)。

**Q：能自动部署吗？**
A：工作流会在你 push 后自动构建与发布；但我没有你的 GitHub/Vercel 账号，无法替你完成首次授权与推送。