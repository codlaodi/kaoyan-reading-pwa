#!/usr/bin/env node
/**
 * gh-deploy.mjs —— 直接用 GitHub REST API 部署（不依赖本机 git）
 * ---------------------------------------------------------------------------
 * 做四件事：
 *   1. 确保仓库存在（public，auto_init）
 *   2. 把项目源码提交到默认分支（main）
 *   3. 把已构建的 .vitepress/dist 提交到 gh-pages 分支（含 .nojekyll）
 *   4. 开启 GitHub Pages（source = gh-pages 分支），等待发布并输出 URL
 *
 * 用法（需 GH_TOKEN，且 token 具备 repo 权限）：
 *   GH_TOKEN=... node scripts/gh-deploy.mjs
 *   可选：GH_REPO=kaoyan-reading-pwa GH_BASE=/kaoyan-reading-pwa/
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, '.vitepress', 'dist')

const TOKEN = (process.env.GH_TOKEN || '').trim()
if (!TOKEN) {
  console.error('缺少 GH_TOKEN')
  process.exit(1)
}

const API = 'https://api.github.com'
const REPO = process.env.GH_REPO || 'kaoyan-reading-pwa'
const BASE = process.env.GH_BASE || `/${REPO}/`
const MAIN_ONLY = process.env.GH_MAIN_ONLY === '1'
const DESCRIPTION = '《考研阅读大观》英语一（2010–2025）VitePress + Pagefind + PWA 离线阅读站'
const COMMIT_MSG = 'feat: 考研阅读大观 英语一 PWA 离线阅读站'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...args) => console.log(...args)

let OWNER = process.env.GH_OWNER || ''

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '_tools',
  'cache',
  '.vitepress/cache',
  '.vitepress/dist',
  'raw/attachments',
])

function headers(extra = {}) {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kaoyan-pwa-deploy',
    ...extra,
  }
}

async function raw(pathname, opts = {}, retries = 3) {
  const url = pathname.startsWith('http') ? pathname : `${API}${pathname}`
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: headers(opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    if (res.ok) return { data, headers: res.headers, status: res.status }
    const retryable = res.status === 429 || res.status >= 500
    if (retryable && attempt < retries - 1) {
      await sleep(1500 * (attempt + 1))
      continue
    }
    const err = new Error(
      `${opts.method || 'GET'} ${url} -> ${res.status} ${String(text).slice(0, 400)}`
    )
    err.status = res.status
    err.data = data
    throw err
  }
  throw new Error('unreachable')
}

function collectFiles(root, { excludeGithub = false } = {}) {
  const files = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      const rel = path.relative(root, abs).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(rel) || EXCLUDE_DIRS.has(entry.name)) continue
        if (excludeGithub && rel === '.github') continue
        walk(abs)
      } else {
        files.push({ abs, rel, size: fs.statSync(abs).size })
      }
    }
  }
  walk(root)
  return files
}

async function uploadBlobs(files, concurrency = 6) {
  const entries = new Array(files.length)
  let cursor = 0
  let done = 0
  async function worker() {
    while (cursor < files.length) {
      const index = cursor++
      const file = files[index]
      const content = fs.readFileSync(file.abs).toString('base64')
      let sha
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data } = await raw(
            `/repos/${OWNER}/${REPO}/git/blobs`,
            { method: 'POST', body: { content, encoding: 'base64' } }
          )
          sha = data.sha
          break
        } catch (err) {
          if (attempt === 2) throw err
          await sleep(800 * (attempt + 1))
        }
      }
      entries[index] = { path: file.rel, mode: '100644', type: 'blob', sha }
      done++
      if (done % 30 === 0) log(`  blobs ${done}/${files.length}`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return entries
}

async function commitBranch(branch, files, { parent = null } = {}) {
  log(`\n▶ 上传 ${branch}：${files.length} 个文件`)
  const treeEntries = (await uploadBlobs(files)).filter(Boolean)
  const { data: tree } = await raw(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: 'POST',
    body: { tree: treeEntries },
  })

  let commit
  try {
    const res = await raw(`/repos/${OWNER}/${REPO}/git/commits`, {
      method: 'POST',
      body: {
        message: COMMIT_MSG,
        tree: tree.sha,
        parents: parent ? [parent] : [],
      },
    })
    commit = res.data
  } catch (err) {
    if (err.status !== 422 || !parent) throw err
    throw err
  }

  try {
    await raw(`/repos/${OWNER}/${REPO}/git/refs`, {
      method: 'POST',
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    })
  } catch (err) {
    if (err.status !== 422) throw err
    await raw(`/repos/${OWNER}/${REPO}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: { sha: commit.sha, force: true },
    })
  }
  log(`  ✓ ${branch} @ ${commit.sha.slice(0, 7)}`)
  return commit.sha
}

async function ensureRepo() {
  const user = (await raw('/user')).data
  OWNER = OWNER || user.login
  log(`账号：${OWNER}`)

  try {
    const { data } = await raw(`/repos/${OWNER}/${REPO}`)
    log(`仓库已存在：${data.full_name}（默认分支 ${data.default_branch}）`)
    return data
  } catch (err) {
    if (err.status !== 404) throw err
  }

  log(`▶ 创建仓库 ${OWNER}/${REPO}（public）`)
  const { data } = await raw('/user/repos', {
    method: 'POST',
    body: {
      name: REPO,
      description: DESCRIPTION,
      private: false,
      auto_init: true,
      has_issues: false,
      has_wiki: false,
    },
  })
  await sleep(2500)
  return data
}

async function enablePages() {
  log('\n▶ 开启 GitHub Pages（gh-pages 分支）')
  const body = { source: { branch: 'gh-pages', path: '/' } }
  try {
    await raw(`/repos/${OWNER}/${REPO}/pages`, { method: 'POST', body })
    log('  ✓ Pages 已创建')
  } catch (err) {
    if (err.status === 409 || err.status === 422) {
      await raw(`/repos/${OWNER}/${REPO}/pages`, { method: 'PUT', body })
      log('  ✓ Pages 已更新为 gh-pages')
    } else {
      throw err
    }
  }
}

async function waitPages() {
  log('\n▶ 等待 Pages 构建')
  let url = ''
  for (let i = 0; i < 450; i++) {
    const { data } = await raw(`/repos/${OWNER}/${REPO}/pages`)
    url = data.html_url || url
    const status = data.status || '(unknown)'
    process.stdout.write(`  [${i + 1}] status=${status} url=${url || '-'}\n`)
    if (url) {
      try {
        const res = await fetch(url, { redirect: 'follow' })
        if (res.ok) {
          log(`  ✓ 页面已可访问（HTTP ${res.status}）`)
          return url
        }
      } catch {
        /* 继续等待 */
      }
    }
    if (data.status === 'errored') {
      throw new Error(`Pages 构建失败：${JSON.stringify(data).slice(0, 500)}`)
    }
    await sleep(4000)
  }
  if (url) return url
  throw new Error('等待 Pages 超时')
}

async function main() {
  const start = Date.now()
  const repo = await ensureRepo()

  // 检测 token 是否具备 workflow scope，决定是否上传 .github
  const scopes = (
    (await raw('/user')).headers.get('x-oauth-scopes') || ''
  ).toLowerCase()
  const canWorkflow = scopes.includes('workflow')
  log(`Token scopes: ${scopes || '(none reported)'}；上传 .github = ${canWorkflow}`)

  const sourceFiles = collectFiles(ROOT, { excludeGithub: !canWorkflow })
  const mainParent = repo.default_branch
    ? await raw(`/repos/${OWNER}/${REPO}/git/ref/heads/${repo.default_branch}`)
        .then((r) => r.data.object.sha)
        .catch(() => null)
    : null

  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('缺少 .vitepress/dist/index.html，请先构建')
  }
  const ghPagesFiles = collectFiles(DIST)

  const mainSha = await commitBranch(repo.default_branch || 'main', sourceFiles, {
    parent: mainParent,
  })

  if (MAIN_ONLY) {
    log('\n仅更新 main（GH_MAIN_ONLY=1，跳过 gh-pages / Pages）')
    return
  }

  // gh-pages 基于 main 提交，避免空父提交（GitHub API 会拒绝）
  await commitBranch('gh-pages', ghPagesFiles, { parent: mainSha })

  await enablePages()
  const url = await waitPages()

  await raw(`/repos/${OWNER}/${REPO}`, {
    method: 'PATCH',
    body: { homepage: url, description: DESCRIPTION },
  }).catch(() => {})

  log('\n========================================')
  log(`✓ 部署完成：${url}`)
  log(`  仓库：https://github.com/${OWNER}/${REPO}`)
  log(`  base：${BASE}`)
  log(`  用时：${((Date.now() - start) / 1000).toFixed(1)}s`)
  log('========================================')
}

main().catch((err) => {
  console.error('\n部署失败：', err.message)
  if (err.data) console.error(JSON.stringify(err.data).slice(0, 1000))
  process.exit(1)
})