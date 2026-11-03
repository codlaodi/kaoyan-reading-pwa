#!/usr/bin/env node
/**
 * fetch-yuque.mjs
 * ---------------------------------------------------------------------------
 * 从语雀「公开」接口抓取《考研阅读大观 · 英语一》的元数据，生成 raw/manifest.json。
 *
 * 设计原则：
 *   1. 只使用匿名可访问的公开接口，不登录、不读取/保存任何 cookie 或 token；
 *   2. 不修改原文：正文 Markdown 由 yuque-dl 落盘后原样保留（raw/yuque-dl/）；
 *   3. 附件正文若需登录，则如实记录状态，绝不伪造内容。
 *
 * 用法：
 *   node scripts/fetch-yuque.mjs
 *   node scripts/fetch-yuque.mjs --book https://www.yuque.com/nanxiao_fighters/afkiny
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'raw');

const argv = process.argv.slice(2);
const argBook = argv.includes('--book') ? argv[argv.indexOf('--book') + 1] : null;
const BOOK_URL = argBook || 'https://www.yuque.com/nanxiao_fighters/afkiny';
const SCOPE_KEYWORD = '英语一'; // 只要英一，英二一律排除

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS = {
  'user-agent': UA,
  referer: BOOK_URL,
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(600 * (i + 1));
    }
  }
  throw lastErr;
}

/** 从知识库首页的 window.appData 中读取 TOC（公开页面自带，无需登录） */
async function fetchBook() {
  const res = await fetch(BOOK_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`知识库首页不可访问：HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/window\.appData\s*=\s*JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)/);
  if (!m) throw new Error('未在页面中找到 window.appData，语雀页面结构可能已变化');
  const appData = JSON.parse(decodeURIComponent(m[1]));
  if (!appData.book) throw new Error('appData 中没有 book 字段');
  return { book: appData.book, bookUrl: BOOK_URL, fetchedAt: new Date().toISOString() };
}

function parseAttachmentCards(lakeHtml) {
  const out = [];
  const cardRe = /<card[^>]*name="localdoc"[^>]*value="data:([^"]+)"/g;
  let m;
  while ((m = cardRe.exec(lakeHtml || ''))) {
    try {
      const card = JSON.parse(decodeURIComponent(m[1]));
      out.push({
        name: card.name || '',
        url: card.src || '',
        size: card.size || 0,
        ext: card.ext || (card.name || '').split('.').pop() || '',
        type: card.type || '',
      });
    } catch {
      /* 单个卡片解析失败不影响整体 */
    }
  }
  return out;
}

/** 把附件名拆成「第几篇 + 做题/复盘」 */
function classifyAttachment(att, year) {
  const name = att.name || '';
  const textMatch = name.match(/text\s*(\d+)/i);
  const modeMatch = name.match(/(做题|复盘)/);
  return {
    ...att,
    text: textMatch ? Number(textMatch[1]) : null,
    mode: modeMatch ? modeMatch[1] : '未知',
    year,
    label: name.replace(/\.html?$/i, ''),
  };
}

/** 抽样检查附件是否可匿名访问（预期：302 到登录页） */
async function probeAttachmentAccess(attachments) {
  const sample = [];
  const step = Math.max(1, Math.floor(attachments.length / 3));
  for (const idx of [0, step, Math.min(attachments.length - 1, step * 2)]) {
    const att = attachments[idx];
    if (!att) continue;
    try {
      const res = await fetch(att.url, { headers: HEADERS, redirect: 'manual' });
      const location = res.headers.get('location') || '';
      const body = res.status === 200 ? await res.text() : '';
      sample.push({
        name: att.name,
        url: att.url,
        status: res.status,
        location: location.split('?')[0],
        loginRequired: res.status >= 300 && res.status < 400 && location.includes('login'),
        contentType: res.headers.get('content-type') || '',
        bodyLooksLikeLogin: body.includes('pagetype" content="new_session"'),
      });
    } catch (err) {
      sample.push({ name: att.name, url: att.url, error: err.message });
    }
  }
  return {
    checked: sample.length,
    anyPubliclyReadable: sample.some((s) => s.status === 200 && !s.bodyLooksLikeLogin),
    note:
      '语雀对附件下载强制登录：匿名请求返回 302 -> /login。' +
      '本清单只记录附件元数据与原始链接，不收录其正文。',
    sample,
  };
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(iso))
    .replace(/\//g, '-');
}

async function main() {
  console.log('→ 读取知识库公开目录…');
  const { book, fetchedAt } = await fetchBook();
  console.log(`  知识库：${book.name}（id=${book.id}，${book.toc.length} 个 TOC 节点）`);

  const toc = book.toc || [];
  const sectionNode = toc.find(
    (n) => n.type === 'DOC' && !n.parent_uuid && (n.title || '').includes(SCOPE_KEYWORD)
  );
  if (!sectionNode) throw new Error(`目录中未找到「${SCOPE_KEYWORD}」分区`);
  console.log(`  分区：${sectionNode.title}（${sectionNode.url}）`);

  // 仅保留英一分区及其子文档；英二整支排除
  const sectionDocs = toc.filter((n) => n.parent_uuid === sectionNode.uuid && n.type === 'DOC');
  if (!sectionDocs.length) throw new Error('英一分区下没有子文档');
  console.log(`  英一年份文档：${sectionDocs.length} 篇`);

  // 读取分区页本身 + 每个年份文档
  const nodes = [sectionNode, ...sectionDocs];
  const docs = [];
  const allAttachments = [];

  for (const node of nodes) {
    console.log(`→ 抓取 ${node.title} …`);
    const api = `https://www.yuque.com/api/docs/${node.url}?book_id=${book.id}`;
    let data;
    try {
      const json = await getJson(api);
      data = json.data;
    } catch (err) {
      console.warn(`  ! ${node.title} 抓取失败：${err.message}`);
      docs.push({
        title: node.title,
        slug: node.url,
        url: `${BOOK_URL}/${node.url}`,
        error: err.message,
      });
      continue;
    }

    const yearMatch = (node.title || '').match(/(\d{2})年/);
    const year = yearMatch ? 2000 + Number(yearMatch[1]) : null;
    const attachments = parseAttachmentCards(data.content || '').map((a) =>
      classifyAttachment(a, year)
    );
    allAttachments.push(...attachments);

    docs.push({
      title: node.title,
      year,
      slug: node.url,
      url: `${BOOK_URL}/${node.url}`,
      parent: node.parent_uuid || null,
      format: data.format || '',
      wordCount: data.word_count || 0,
      updatedAt: data.content_updated_at || data.updated_at || '',
      updatedAtLocal: fmtDate(data.content_updated_at || data.updated_at),
      createdAt: data.created_at || '',
      attachmentCount: attachments.length,
      attachments,
    });
    await sleep(250); // 温和抓取，避免触发限流
  }

  console.log('→ 抽样检查附件可匿名访问性…');
  const access = await probeAttachmentAccess(allAttachments);

  const manifest = {
    generatedAt: new Date().toISOString(),
    generator: 'scripts/fetch-yuque.mjs',
    downloadedWith: 'yuque-dl@1.0.87（正文 Markdown，见 raw/yuque-dl/）',
    scope: '英语一（英二已排除）',
    source: {
      name: book.name,
      url: BOOK_URL,
      bookId: book.id,
      bookSlug: book.slug,
      namespace: book.namespace || 'nanxiao_fighters/afkiny',
      bookUpdatedAt: book.updated_at,
      fetchedAt,
      license: '版权归原作者所有；本站仅作个人离线阅读，内容与链接均标注原始来源。',
    },
    section: {
      title: sectionNode.title,
      slug: sectionNode.url,
      url: `${BOOK_URL}/${sectionNode.url}`,
    },
    docs,
    attachments: {
      total: allAttachments.length,
      years: [...new Set(allAttachments.map((a) => a.year))].sort(),
      access,
    },
    stats: {
      docCount: docs.length,
      yearDocCount: docs.filter((d) => d.year).length,
      attachmentCount: allAttachments.length,
      imageCount: 0,
      yearRange: [
        Math.min(...docs.filter((d) => d.year).map((d) => d.year)),
        Math.max(...docs.filter((d) => d.year).map((d) => d.year)),
      ],
    },
  };

  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(path.join(RAW, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\n✓ 已写入 raw/manifest.json');
  console.log(`  文档 ${manifest.stats.docCount} 篇 / 年份 ${manifest.stats.yearRange.join('–')}`);
  console.log(`  附件 ${manifest.attachments.total} 个；可匿名读取：${access.anyPubliclyReadable ? '是' : '否（需登录）'}`);
}

main().catch((err) => {
  console.error('抓取失败：', err);
  process.exit(1);
});