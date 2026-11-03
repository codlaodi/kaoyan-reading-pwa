#!/usr/bin/env node
/**
 * build-content.mjs
 * ---------------------------------------------------------------------------
 * 把 raw/ 中 yuque-dl 下载的原文 + raw/manifest.json 元数据，转换成 VitePress
 * 可消费的 Markdown 内容。
 *
 * 原则：
 *   - 只处理英语一，英二不进入内容目录；
 *   - 原文 Markdown 原样嵌入「原文正文」折叠区（仅去掉与页面标题重复的 H1，
 *     以及 yuque-dl 自动追加的页脚以外不改动任何字句）；
 *   - 附件正文缺失时只列清单和原始链接，不生成占位「假内容」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'raw');
const CONTENT = path.join(ROOT, 'content');
const manifest = JSON.parse(fs.readFileSync(path.join(RAW, 'manifest.json'), 'utf8'));

const years = manifest.docs
  .filter((d) => d.year)
  .map((d) => d.year)
  .sort((a, b) => a - b);
const yearDocs = new Map(manifest.docs.filter((d) => d.year).map((d) => [d.year, d]));

/* ------------------------------ 工具函数 ------------------------------ */

const fmtSize = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const escapeMd = (s = '') => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const badgeLogin = '<span class="badge badge--login">需登录</span>';
const badgePublic = '<span class="badge badge--ok">公开</span>';

/** 读取 yuque-dl 的原始 Markdown（按年份 → 文件） */
function readRawMarkdown() {
  const base = path.join(RAW, 'yuque-dl');
  const sectionDir = fs
    .readdirSync(base, { withFileTypes: true })
    .find((e) => e.isDirectory() && e.name.includes('英语一'));
  if (!sectionDir) throw new Error('raw/yuque-dl 中找不到英语一目录');
  const dir = path.join(base, sectionDir.name);
  const map = new Map();
  for (const file of fs.readdirSync(dir)) {
    const m = file.match(/^(\d{2})年_.*\.md$/);
    if (!m) continue;
    const year = 2000 + Number(m[1]);
    const text = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');
    map.set(year, { file, text });
  }
  return map;
}

/** 去掉 H1（与页面标题重复）与被我们提取到页脚的来源 blockquote，其余逐字保留 */
function stripForEmbed(md) {
  const lines = md.split('\n');
  let start = 0;
  while (start < lines.length && !lines[start].trim()) start++;
  if (/^#\s+/.test(lines[start] || '')) start++;

  let end = lines.length;
  while (end > start && !lines[end - 1].trim()) end--;
  // 末尾两行 blockquote：> 更新 / > 原文 —— 已在来源栏展示，避免重复
  const tail = lines.slice(Math.max(start, end - 3), end);
  if (tail.some((l) => /^>\s*原文[:：]/.test(l.trim()))) {
    while (end > start && (!lines[end - 1].trim() || /^>\s*(更新|原文)[:：]/.test(lines[end - 1].trim()))) {
      end--;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

/** 附件名 → 有序分组 */
function groupAttachments(doc) {
  const byText = new Map();
  for (const a of doc.attachments || []) {
    const key = a.text ?? 0;
    if (!byText.has(key)) byText.set(key, { text: key, 做题: null, 复盘: null });
    const slot = byText.get(key);
    if (a.mode === '做题') slot.做题 = a;
    else if (a.mode === '复盘') slot.复盘 = a;
  }
  return [...byText.values()].sort((a, b) => a.text - b.text);
}

const attachmentCell = (att) => {
  if (!att) return '—';
  const file = `/attachments/${att.year}/${att.name}`;
  const href = `../reader.html?year=${att.year}&amp;f=${encodeURIComponent(file)}`;
  return (
    `<a class="att-link" href="${href}" data-att-file="${file}" data-att-size="${att.size || 0}">` +
    `${escapeMd(att.label || att.name)}</a><br>` +
    `<span class="att-meta">${fmtSize(att.size)} · ${badgePublic}</span>`
  );
};

/* ------------------------------ 页面模板 ------------------------------ */

function yearPage(year, raw) {
  const doc = yearDocs.get(year);
  const rows = groupAttachments(doc);
  const publicText = stripForEmbed(raw?.text || '');
  const updated = doc.updatedAtLocal || '未知';
  const totalSize = (doc.attachments || []).reduce((s, a) => s + (a.size || 0), 0);

  const table = [
    '| 篇目 | 做题模式 | 复盘模式 |',
    '| --- | --- | --- |',
    ...rows.map(
      (r) =>
        `| **Text ${r.text}** | ${attachmentCell(r.做题)} | ${attachmentCell(r.复盘)} |`
    ),
  ].join('\n');

  return `---
title: ${year} 年 · 英语一
description: ${year} 年英语一 Text 1–4 做题模式与复盘模式资料清单（语雀公开知识库镜像）
outline: [2, 3]
---

<div class="source-meta">
  <div class="source-meta__title">来源标注</div>
  <div class="source-meta__grid">
    <span>原文</span><a href="${doc.url}" target="_blank" rel="noopener noreferrer">${doc.url}</a>
    <span>原文更新</span><time>${updated}</time>
    <span>抓取时间</span><time>${manifest.source.fetchedAt.slice(0, 10)}</time>
    <span>抓取工具</span><span>yuque-dl@1.0.87 + 语雀公开 API</span>
    <span>本年附件</span><span>${rows.length * 2} 个 · ${fmtSize(totalSize)}（已收录）</span>
  </div>
</div>

::: tip 站内阅读
本年 **${rows.length * 2} 份 HTML 原件已收录**，本站访问者**无需登录**即可打开。
文件较大（合计约 ${fmtSize(totalSize)}），首次打开需等待加载；读过的文件会自动缓存，断网后可再次打开。
也可以点下方「缓存本年资料」一次性保存到本机。
:::

## 资料清单（Text 1–4）

${table}

<YearDownload />

> 提示：做题模式用于限时训练，复盘模式用于精读与错题分析；两者一一对应。
> 点击文件名在站内阅读器打开原件，本站不对内容做任何改写。

## 原文正文

以下是 yuque-dl 抓取到的语雀原文 Markdown（仅去除与页面标题重复的一级标题、以及重复的来源页脚，其余逐字保留）：

<details class="raw-details">
<summary>展开原文（${doc.attachmentCount} 个附件链接）</summary>

${publicText || '_（该文档在语雀中没有正文文字，只有附件卡片。）_'}

</details>

<div class="page-footer-note">
  版权归原作者所有。本页仅用于个人离线阅读与检索，内容与链接均来自
  <a href="${manifest.source.url}" target="_blank" rel="noopener noreferrer">${manifest.source.name}</a>。
</div>
`;
}

function sectionPage() {
  const totalAttachments = manifest.attachments.total;
  const totalSize = manifest.docs
    .flatMap((d) => d.attachments || [])
    .reduce((s, a) => s + (a.size || 0), 0);

  const cards = years
    .map((y) => {
      const doc = yearDocs.get(y);
      return `<a class="year-card" href="./${y}.html">
  <span class="year-card__year">${y}</span>
  <span class="year-card__meta">Text 1–4 · ${doc.attachmentCount} 份资料</span>
</a>`;
    })
    .join('\n');

  return `---
title: 英语一 · 2010–2025
description: 考研英语一 2010–2025 年阅读真题的做题模式与复盘模式资料索引（语雀公开知识库离线版）
---

# 英语一 · 2010–2025

本区收录《考研阅读大观》中 **英语一** 的 16 个年份（2010–2025），共 ${years.length} 篇文档、
${totalAttachments} 份 HTML 资料（约 ${fmtSize(totalSize)}）。英语二内容未收录。

::: tip 使用方式
每年 4 篇阅读（Text 1–4），每篇分「做题模式」与「复盘模式」两份资料。
建议先做题、再看复盘。资料原件均已收录，**站内免登录打开**；首次打开按需加载，读过的会自动缓存，断网也能继续看。
:::

<div class="year-grid">
${cards}
</div>

## 本区统计

| 项目 | 数值 |
| --- | --- |
| 年份范围 | ${years[0]}–${years[years.length - 1]} |
| 文档数 | ${years.length} |
| 附件数 | ${totalAttachments}（全部已收录） |
| 附件总体积 | ${fmtSize(totalSize)} |
| 图片 | 0（原文正文无图片） |

具体附件见 [附件清单](/attachments.html)。
`;
}

function homePage() {
  return `---
layout: home
title: 英语一离线阅读
description: 语雀公开知识库《考研阅读大观》英语一 2010–2025 的 PWA 离线阅读版：目录、全文搜索、进度记忆、深色模式、字号调节。

hero:
  name: 考研阅读大观
  text: 英语一 · 2010–2025
  tagline: 语雀公开知识库的 PWA 离线阅读版 · 支持目录、全文搜索、阅读进度、深色模式
  actions:
    - theme: brand
      text: 开始阅读
      link: /english-1/index.html
    - theme: alt
      text: 安装到主屏幕
      link: /guide.html
    - theme: alt
      text: 附件说明
      link: /attachments.html

features:
  - icon: 📚
    title: 128 份资料站内读
    details: 2010–2025 英语一，每年 Text 1–4 的做题与复盘 HTML 原件，免登录直接打开。
  - icon: 🔍
    title: Pagefind 本地全文搜索
    details: 索引在构建时生成，随站点离线可用，中文分词检索。
  - icon: 📴
    title: 断网可读
    details: 页面、脚本、字体与搜索索引预缓存；资料原件读过即缓存，也可整年下载。
  - icon: 🌙
    title: 深色模式与字号
    details: 一键切换深色，A-/A+ 调节正文字号，偏好保存在本机。
  - icon: 🧭
    title: 阅读进度记忆
    details: 自动记住每篇读到哪里，首页可一键继续上次阅读。
  - icon: 🔒
    title: 访问免登录
    details: 访客不需要语雀账号；偏好只存在浏览器本地，无统计、无追踪。
---

<ContinueReading />

<div class="home-note">

**范围说明**：本站只收录《考研阅读大观》的**英语一**部分（2010–2025）。英语二未收录。

**资料说明**：128 份 HTML 原件（约 393 MB）已由维护者下载并托管，**访问者无需登录**。
首次打开某个文件时按需加载，读过即缓存；也可在年份页点「缓存本年资料」一次性保存（每年约 24 MB）。
详见 [附件清单](/attachments.html)。

</div>
`;
}

function guidePage() {
  return `---
title: 使用与安装
description: 在安卓手机上把本站添加到主屏幕、离线阅读、搜索与字号调节说明。
---

# 使用与安装

## 添加到主屏幕（安卓 · Chrome / Edge）

1. 用 **Chrome**（或 Edge、三星浏览器）打开本站地址（必须是 **HTTPS**，本地调试的 localhost 除外）。
2. 点右上角 **⋮** 菜单 → **添加到主屏幕** / **安装应用**。
3. 确认名称后点「添加」，桌面会出现图标；从图标打开即为全屏独立窗口。
4. 首次打开后**停留几秒**，让 Service Worker 完成预缓存（约几 MB）。

> 若菜单里没有「安装」，请确认：地址是 HTTPS、没有使用无痕模式、且已刷新过一次页面。

## 站内阅读资料

- 进入任一年份页 → 点「做题模式 / 复盘模式」文件名。
- 打开的是**资料原件**（独立 HTML），阅读器顶部有「← 返回」和「原始文件」。
- **不需要语雀账号**，本站已托管原件。
- 第一次打开需要联网（单个文件 0.8–8.3 MB）；打开后会自动进入缓存，断网再开同一份仍可读。
- 想提前离线：在年份页点「缓存本年资料（约 24 MB）」，等进度完成即可。

## 离线阅读

- 预缓存范围：所有页面、脚本、样式、字体、图标、Pagefind 搜索索引。
- 安装后首次访问会把站点外壳写入缓存；之后**断网**打开，目录、年份页、使用说明与搜索结果均可正常使用。
- 资料原件（128 个 HTML，共约 393 MB）**不在**初始预缓存内，避免安装时占用过大空间：
  读过的单份会自动缓存，也可在年份页整年下载。
- 想确认是否已缓存：断网后从桌面图标打开，能进入首页即成功。

## 全文搜索

- 点顶部（手机为底部工具条）的「搜索」，或按键盘 <kbd>Ctrl</kbd> + <kbd>K</kbd>。
- 输入中文关键词，如「2010」「Text 3」「复盘」「长难句」。
- 搜索完全在本地进行，不上传任何内容。

## 阅读进度与字号

- 滚动阅读时顶部进度条会显示当前进度；离开页面时自动记住位置。
- 下次回到首页，点「继续上次阅读」即可跳回；进入该页时右下角也会出现续读提示。
- 顶部「A- / A+」调节正文字号，手机底部工具条同样可以调；设置只保存在本机浏览器。
- 深色模式：右上角图标切换（跟随系统或手动）。

## 常见问题

**Q：打开资料要登录语雀吗？**
A：不需要。128 份 HTML 原件已经下载并托管在本站，访问者直接点开即可。

**Q：为什么第一次打开资料要等？**
A：单个文件 0.8–8.3 MB，首次需要下载；下载后会进缓存，之后离线也能打开。年份页可整年缓存。

**Q：需要注册或登录本站吗？**
A：不需要。本站是纯静态站点，没有后端、没有账号体系，也不会上传任何数据。

**Q：换手机后进度还在吗？**
A：不在。所有偏好与进度都保存在当前浏览器的 localStorage 中，不跨设备同步，也不会离开你的手机。
`;
}

function aboutPage() {
  return `---
title: 关于与来源
description: 数据来源、版权、隐私与技术实现说明。
---

# 关于与来源

## 数据来源

| 项目 | 说明 |
| --- | --- |
| 原始知识库 | [${manifest.source.name}](${manifest.source.url}) |
| 作者空间 | 语雀 · nanxiao_fighters |
| 收录范围 | **英语一** 2010–2025（${years.length} 篇文档 / ${manifest.attachments.total} 个 HTML 附件，约 393 MB） |
| 抓取时间 | ${manifest.source.fetchedAt.slice(0, 10)} |
| 抓取方式 | 元数据走匿名公开接口，正文 Markdown 由 [yuque-dl](https://github.com/gxr404/yuque-dl) 生成；128 份附件由维护者**本人在语雀登录后**下载 |
| 登录状态 | **站点访问者无需登录**；下载附件时使用维护者本人会话，密码只输入在浏览器中，未保存、未上传 |

## 版权与使用边界

- 原文、真题与解析的版权归原作者及权利人所有；本站仅做**个人离线阅读与检索**的技术整理。
- 128 份附件 HTML **未做任何改写**，按原文件名托管；页面同时保留语雀原始链接作为来源标注。
- 为避免被搜索引擎扩散，全站已设置 \`noindex\`；但任何拿到网址的人仍可访问，请勿公开传播。
- 若权利人认为不妥，删除 \`attachments/\` 下对应文件即可移除，无需改动其他内容。

## 内容完整性说明

- 年份文档正文只有附件卡片（无正文文字、无图片）。
- 128 个 HTML（每年 4 篇 × 做题/复盘）已全部收录，访问者**免登录**在站内阅读器打开。
- 附件共约 393 MB，为避免安装时占用过大空间，采用**按需缓存**：读过即缓存，年份页可整年下载。

## 隐私

- 无账号、无后端、无统计脚本、无第三方追踪。
- 阅读进度、字号、主题等偏好仅保存在浏览器 \`localStorage\`，可用「清除网站数据」删除。
- 搜索使用本地索引，查询词不会发送到任何服务器。

## 技术栈

- 静态站点：[VitePress](https://vitepress.dev/) 1.6
- 全文搜索：[Pagefind](https://pagefind.app/) 1.6（构建时索引，中文分词）
- 离线能力：Workbox 7 + 自定义 Service Worker（预缓存 + 导航回退）
- 部署：GitHub Pages / Vercel（纯静态，免费额度即可）
`;
}

function attachmentsPage() {
  const rows = [];
  for (const year of years) {
    const doc = yearDocs.get(year);
    for (const att of doc.attachments || []) {
      const file = `/attachments/${year}/${att.name}`;
      const href = `reader.html?year=${year}&amp;f=${encodeURIComponent(file)}`;
      rows.push(
        `| ${year} | Text ${att.text ?? '—'} | ${att.mode} | ${fmtSize(att.size)} | ` +
          `<a href="${href}" data-att-file="${file}">站内打开</a> | ` +
          `<a href="${att.url}" target="_blank" rel="noopener noreferrer">原始链接</a> |`
      );
    }
  }
  const access = manifest.attachments.access;
  const sample = access.sample[0] || {};
  const totalSize = manifest.docs
    .flatMap((d) => d.attachments || [])
    .reduce((s, a) => s + (a.size || 0), 0);

  return `---
title: 附件清单（站内阅读）
description: 英语一 128 个 HTML 附件清单，全部已收录，可在站内免登录打开并离线缓存。
---

# 附件清单（站内阅读）

## 说明

- 英语一共有 **${manifest.attachments.total} 个 HTML 附件**（2010–2025 × 4 篇 × 做题/复盘），总体积约 **${fmtSize(totalSize)}**。
- 这些原件已由维护者**本人在语雀登录后**下载并托管，**访问本站无需登录**，点「站内打开」即可阅读。
- 原件未做任何改写；「原始链接」仍指向语雀，匿名访问时需登录（${sample.status || 302} → \`${sample.location || '/login'}\`）。
- 附件体积较大：首次打开按需下载，读过即缓存；年份页可「缓存本年资料」整年保存。

## 清单（共 ${manifest.attachments.total} 条）

| 年份 | 篇目 | 模式 | 大小 | 站内阅读 | 原始语雀 |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## 原始语雀的可访问性（历史探测）

| 附件 | HTTP 状态 | 跳转 | 判定 |
| --- | --- | --- | --- |
${access.sample
  .map(
    (s) =>
      `| ${escapeMd(s.name)} | ${s.status || 'ERR'} | \`${s.location || '—'}\` | ${
        s.loginRequired ? '需登录' : '可公开读取'
      } |`
  )
  .join('\n')}

> 验证时间：${manifest.source.fetchedAt.slice(0, 10)}；方法：匿名 GET，禁止自动跟随跳转。
> 该结果说明语雀原站对匿名访客加登录墙；本站的免登录阅读依赖已下载的副本。
`;
}

function readerPage() {
  return `---
layout: false
title: 资料阅读
description: 站内阅读语雀资料原件
sidebar: false
aside: false
outline: false
---

<AttachmentReader />
`;
}

function offlinePage() {
  return `---
title: 离线
description: 当前页面未缓存，请在联网状态下访问一次。
---

<div data-pagefind-ignore>

# 这个页面还没有缓存

你正在离线浏览，而该页面尚未被 Service Worker 缓存。

- 已缓存的页面：从[首页](/)进入目录即可阅读。
- 需要该页面：联网后打开一次，下次即可离线访问。
- 搜索：底部的「搜索」在离线状态下仍可用（索引已缓存）。

</div>
`;
}

/* ------------------------------ 写文件 ------------------------------ */

function write(file, content) {
  const dest = path.join(CONTENT, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content.replace(/\r\n/g, '\n'), 'utf8');
}

fs.mkdirSync(CONTENT, { recursive: true });
// 只清理生成物，保留 content/public（PWA 图标、manifest、logo）
for (const file of ['index.md', 'guide.md', 'about.md', 'attachments.md', 'offline.md', 'reader.md']) {
  fs.rmSync(path.join(CONTENT, file), { force: true });
}
fs.rmSync(path.join(CONTENT, 'english-1'), { recursive: true, force: true });

const rawMap = readRawMarkdown();
let count = 0;
for (const year of years) {
  write(`english-1/${year}.md`, yearPage(year, rawMap.get(year)));
  count++;
}
write('english-1/index.md', sectionPage());
write('index.md', homePage());
write('guide.md', guidePage());
write('about.md', aboutPage());
write('attachments.md', attachmentsPage());
write('offline.md', offlinePage());
write('reader.md', readerPage());

// 附件机器可读清单（Excel 可直接打开；BOM 保证中文不乱码）
const csvRows = ['年份,篇目,模式,文件名,大小(字节),原始链接,访问状态'];
for (const year of years) {
  const doc = yearDocs.get(year);
  for (const att of doc.attachments || []) {
    csvRows.push(
      [
        year,
        `Text ${att.text ?? ''}`,
        att.mode,
        att.name,
        att.size || 0,
        att.url,
        '需登录语雀',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
  }
}
fs.writeFileSync(path.join(RAW, 'attachments.csv'), `\ufeff${csvRows.join('\n')}\n`, 'utf8');

console.log(`✓ 已生成 content/：首页、分区页、${count} 个年份页、使用指南、关于、附件清单、离线页`);
console.log(`  年份：${years[0]}–${years[years.length - 1]}；附件 ${manifest.attachments.total} 个`);
console.log('✓ 已写出 raw/attachments.csv（附件清单，Excel 可读）');