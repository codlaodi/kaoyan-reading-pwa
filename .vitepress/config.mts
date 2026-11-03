import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../raw/manifest.json'), 'utf8')
)

const base = (process.env.BASE_PATH || '/').replace(/\/?$/, '/')

const years = manifest.docs
  .filter((d: any) => d.year)
  .map((d: any) => d.year)
  .sort((a: number, b: number) => a - b)

const yearItems = years.map((y: number) => ({
  text: `${y} 年`,
  link: `/english-1/${y}.html`,
}))

const siteDescription =
  '《考研阅读大观》英语一 2010–2025 的离线 PWA 阅读版：目录、Pagefind 全文搜索、阅读进度、深色模式、字号调节，断网可读。'

export default defineConfig({
  lang: 'zh-CN',
  title: '考研阅读大观',
  titleTemplate: ':title · 考研阅读大观',
  description: siteDescription,
  base,
  srcDir: 'content',
  // GitHub Pages 不支持无扩展名 URL 重写；统一输出 /xxx.html，最稳妥
  cleanUrls: false,
  lastUpdated: false,
  head: [
    ['link', { rel: 'manifest', href: `${base}manifest.webmanifest` }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}icons/apple-touch-icon.png` }],
    ['meta', { name: 'robots', content: 'noindex, nofollow' }],
    ['meta', { name: 'theme-color', content: '#f7f8fa', media: '(prefers-color-scheme: light)' }],
    ['meta', { name: 'theme-color', content: '#0b1220', media: '(prefers-color-scheme: dark)' }],
    ['meta', { name: 'mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: '考研阅读' }],
    ['meta', { name: 'format-detection', content: 'telephone=no' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: '考研阅读大观 · 英语一离线阅读' }],
    ['meta', { property: 'og:description', content: siteDescription }],
    ['meta', { property: 'og:site_name', content: '考研阅读大观' }],
  ],
  themeConfig: {
    logo: { src: `${base}logo.svg`, alt: '考研阅读大观' },
    siteTitle: '考研阅读大观',
    nav: [
      { text: '首页', link: '/' },
      { text: '英语一', link: '/english-1/index.html', activeMatch: '/english-1/' },
      { text: '使用指南', link: '/guide.html', activeMatch: '/guide' },
      { text: '附件清单', link: '/attachments.html', activeMatch: '/attachments' },
      { text: '关于', link: '/about.html', activeMatch: '/about' },
    ],
    sidebar: {
      '/english-1/': [
        {
          text: '英语一 · 2010–2025',
          items: [{ text: '分区总览', link: '/english-1/index.html' }, ...yearItems],
        },
        {
          text: '附录',
          items: [
            { text: '附件清单与限制', link: '/attachments.html' },
            { text: '使用与安装', link: '/guide.html' },
          ],
        },
      ],
    },
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换为浅色模式',
    darkModeSwitchTitle: '切换为深色模式',
    footer: {
      message: '内容版权归原作者所有 · 本站仅供个人离线阅读与检索',
      copyright: '数据来源：语雀《考研阅读大观》（仅英语一）',
    },
  },
  markdown: {
    lineNumbers: false,
    image: { lazyLoading: true },
  },
  vite: {
    build: {
      chunkSizeWarningLimit: 1600,
    },
  },
})