#!/usr/bin/env node
/**
 * build.mjs —— 一条命令完成全部构建
 *   1. 生成 content/（来自 raw/ 的语雀公开数据）
 *   2. VitePress 构建静态站
 *   3. Pagefind 生成中文全文索引
 *   4. Workbox injectManifest 生成预缓存 Service Worker
 *   5. 产物自检（manifest / 图标 / sw / pagefind / 页面数）
 *
 * 用法：
 *   node scripts/build.mjs
 *   BASE_PATH=/repo/ node scripts/build.mjs      # GitHub Pages 项目站点
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getManifest } from 'workbox-build'
import { build as esbuild } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, '.vitepress', 'dist')
const node = process.execPath

const base = (process.env.BASE_PATH || '/').replace(/\/?$/, '/')
const env = { ...process.env, BASE_PATH: base }

function run(label, args) {
  console.log(`\n▶ ${label}`)
  execFileSync(node, args, { cwd: ROOT, stdio: 'inherit', env })
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function dirSize(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    total += entry.isDirectory() ? dirSize(file) : fs.statSync(file).size
  }
  return total
}

async function main() {
  const started = Date.now()
  console.log(`构建 base = ${base}`)

  run('1/5 生成内容（raw → content）', ['scripts/build-content.mjs'])
  run('2/5 构建 VitePress 静态站', ['node_modules/vitepress/bin/vitepress.js', 'build', '.'])

  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('VitePress 构建失败：dist/index.html 不存在')
  }

  console.log('\n▶ 3/5 Pagefind 中文全文索引')
  const pagefindBin = path.join(ROOT, 'node_modules/pagefind/lib/runner/bin.cjs')
  execFileSync(
    node,
    [
      pagefindBin,
      '--site',
      DIST,
      '--exclude-selectors',
      '.VPNav,.VPSidebar,.VPDocAside,.VPFooter,.VPLocalNav,.mobile-dock,.search-overlay,.sw-toast,.sw-update,.resume-pill',
      '--quiet',
    ],
    { cwd: ROOT, stdio: 'inherit', env }
  )

  console.log('\n▶ 4/5 生成 Service Worker（Workbox getManifest + esbuild 打包）')
  const { manifestEntries, warnings, size } = await getManifest({
    globDirectory: DIST,
    globPatterns: ['**/*'],
    globIgnores: ['sw.js', '**/*.map'],
    maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
  })
  for (const warning of warnings) console.warn(`  ! ${warning}`)

  const swSource = fs.readFileSync(path.join(ROOT, 'pwa', 'sw.js'), 'utf8')
  const banner = `self.__WB_MANIFEST = ${JSON.stringify(manifestEntries)};\n`
  await esbuild({
    stdin: {
      contents: banner + swSource,
      resolveDir: ROOT,
      sourcefile: 'sw.js',
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    target: ['chrome90', 'safari15'],
    outfile: path.join(DIST, 'sw.js'),
    minify: true,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
  console.log(`  预缓存 ${manifestEntries.length} 个文件，共 ${human(size)}`)

  console.log('\n▶ 5/5 产物自检')
  const required = [
    'index.html',
    'manifest.webmanifest',
    'logo.svg',
    'favicon.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'icons/apple-touch-icon.png',
    'sw.js',
    'offline.html',
    'pagefind/pagefind.js',
    'english-1/index.html',
    'english-1/2010.html',
    'english-1/2025.html',
    'attachments.html',
  ]
  const missing = required.filter((f) => !fs.existsSync(path.join(DIST, f)))
  if (missing.length) throw new Error(`构建产物缺失：${missing.join(', ')}`)

  const htmlCount = fs
    .readdirSync(DIST, { recursive: true })
    .filter((f) => String(f).endsWith('.html')).length
  const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8')
  if (!sw.includes('pagefind') || !sw.includes('offline.html')) {
    throw new Error('Service Worker 预缓存清单似乎不完整（缺少 pagefind 或 offline.html）')
  }

  console.log(`  页面：${htmlCount} 个 HTML`)
  console.log(`  产物体积：${human(dirSize(DIST))}`)
  console.log(`  Service Worker：${human(fs.statSync(path.join(DIST, 'sw.js')).size)}`)
  console.log(`\n✓ 构建完成，用时 ${((Date.now() - started) / 1000).toFixed(1)}s`)
  console.log(`  产物目录：${DIST}`)
}

main().catch((err) => {
  console.error('\n构建失败：', err)
  process.exit(1)
})