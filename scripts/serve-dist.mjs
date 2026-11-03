#!/usr/bin/env node
/**
 * serve-dist.mjs —— 本地预览构建产物（支持 BASE_PATH 与 cleanUrls）
 *
 * 用法：
 *   node scripts/serve-dist.mjs [--port 4173] [--base /repo/]
 *   然后访问 http://127.0.0.1:4173/
 *
 * 说明：仅用于本地验收与预览；生产部署用 GitHub Pages / Vercel。
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, '.vitepress', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase()
  if (MIME[ext]) return MIME[ext]
  // Pagefind 分片：*.pf_index / *.pf_fragment / *.pf_meta / *.pagefind
  if (/\.(pf_index|pf_fragment|pf_meta|pagefind)$/.test(file)) return 'application/octet-stream'
  return 'application/octet-stream'
}

function resolveFile(root, relPath) {
  const clean = decodeURIComponent(relPath.split('?')[0]).replace(/\\/g, '/')
  const safe = path.normalize(clean).replace(/^([/\\])+/, '')
  if (safe.startsWith('..')) return null
  const candidates = [
    path.join(root, safe),
    path.join(root, `${safe}.html`),
    path.join(root, safe, 'index.html'),
  ]
  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate)
      if (stat.isFile()) return candidate
    } catch {
      /* continue */
    }
  }
  return null
}

export function createStaticServer({ root = DIST, base = process.env.BASE_PATH || '/' } = {}) {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`

  return http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)

    // 允许根路径重定向到 base（模拟 GitHub Pages 项目站点）
    if (normalizedBase !== '/' && pathname === '/') {
      res.writeHead(302, { Location: normalizedBase })
      res.end()
      return
    }
    if (normalizedBase !== '/' && pathname.startsWith(normalizedBase)) {
      pathname = pathname.slice(normalizedBase.length - 1)
    } else if (normalizedBase !== '/' && !pathname.startsWith(normalizedBase)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found (outside base)')
      return
    }

    if (pathname === '/') pathname = '/index.html'

    let file = resolveFile(root, pathname)
    if (!file) {
      const notFound = path.join(root, '404.html')
      if (fs.existsSync(notFound)) {
        res.writeHead(404, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' })
        res.end(fs.readFileSync(notFound))
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('404')
      }
      return
    }

    const ext = path.extname(file).toLowerCase()
    const headers = { 'Content-Type': mimeFor(file) }
    if (['.html', '.webmanifest'].includes(ext) || file.endsWith('sw.js')) {
      headers['Cache-Control'] = 'no-cache'
    } else {
      headers['Cache-Control'] = 'public, max-age=3600'
    }
    headers['Service-Worker-Allowed'] = '/'
    res.writeHead(200, headers)
    fs.createReadStream(file).pipe(res)
  })
}

export function startServer(options = {}) {
  return new Promise((resolve) => {
    const server = createStaticServer(options)
    const port = options.port ?? (Number(process.env.PORT) || 4173)
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      resolve({
        server,
        port: address.port,
        url: `http://127.0.0.1:${address.port}${options.base || '/'}`,
      })
    })
  })
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isCli) {
  const args = process.argv.slice(2)
  const portArg = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : undefined
  const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : undefined
  const { url } = await startServer({ port: portArg, base: baseArg, root: DIST })
  console.log(`本地预览：${url}`)
  console.log('（Ctrl+C 停止；sw.js 需要 HTTPS 或 localhost 才能注册）')
}