import { ref } from 'vue'

const isBrowser = typeof window !== 'undefined'

/** 正文字号档位（1 = 100%） */
export const FONT_STEPS = [0.9, 1, 1.1, 1.2, 1.3]
export const fontScale = ref(1)

/** 搜索弹窗开关（SearchButton / MobileDock / SearchModal 共享） */
export const searchOpen = ref(false)

const FONT_KEY = 'kaoyan:font-scale'
const PROGRESS_KEY = 'kaoyan:progress:v1'

export interface ProgressEntry {
  pct: number
  title: string
  ts: number
}

export function initFontScale() {
  if (!isBrowser) return
  let saved = 1
  try {
    saved = Number(localStorage.getItem(FONT_KEY)) || 1
  } catch {
    /* 隐私模式忽略 */
  }
  if (!FONT_STEPS.includes(saved)) saved = 1
  setFontScale(saved)
}

export function setFontScale(scale: number) {
  const clamped = Math.min(FONT_STEPS[FONT_STEPS.length - 1], Math.max(FONT_STEPS[0], Number(scale) || 1))
  fontScale.value = clamped
  if (!isBrowser) return
  document.documentElement.style.setProperty('--app-font-scale', String(clamped))
  try {
    localStorage.setItem(FONT_KEY, String(clamped))
  } catch {
    /* ignore */
  }
}

export function readProgress(): Record<string, ProgressEntry> {
  if (!isBrowser) return {}
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export function writeProgress(map: Record<string, ProgressEntry>) {
  if (!isBrowser) return
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map))
  } catch {
    /* 存储满或隐私模式 */
  }
}

export function lastRead(): { path: string; entry: ProgressEntry } | null {
  const map = readProgress()
  const entries = Object.entries(map).filter(([, v]) => v && typeof v.pct === 'number' && v.pct >= 3)
  if (!entries.length) return null
  entries.sort((a, b) => b[1].ts - a[1].ts)
  return { path: entries[0][0], entry: entries[0][1] }
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.round(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

/** 给站内相对路径补上部署 base */
export function withBase(path: string, base: string): string {
  if (!path) return base || '/'
  if (/^https?:\/\//.test(path)) return path
  const b = base && base !== '/' ? base.replace(/\/$/, '') : ''
  if (b && path.startsWith(b + '/')) return path
  return b + (path.startsWith('/') ? path : `/${path}`)
}