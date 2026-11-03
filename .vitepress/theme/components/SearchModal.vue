<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, useRouter } from 'vitepress'
import { searchOpen } from '../store'

interface SearchItem {
  title: string
  url: string
  excerpt: string
}

const { site } = useData()
const router = useRouter()

const query = ref('')
const results = ref<SearchItem[]>([])
const loading = ref(false)
const error = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

let pagefind: any = null
let pagefindLoading: Promise<any> | null = null
let seq = 0
let debounceTimer: number | undefined
let hideToast: number | undefined
let prefetchTimer: number | undefined

const dynamicImport = new Function('u', 'return import(u)') as (u: string) => Promise<any>

async function getPagefind() {
  if (pagefind) return pagefind
  if (!pagefindLoading) {
    const url = `${site.value.base}pagefind/pagefind.js`
    pagefindLoading = dynamicImport(url).then(async (pf: any) => {
      try {
        await pf.options({ baseUrl: site.value.base })
      } catch {
        /* 旧版本没有 baseUrl 选项，靠 normalize 兜底 */
      }
      pagefind = pf
      return pf
    })
  }
  return pagefindLoading
}

function normalizeUrl(raw: string): string {
  const base = site.value.base || '/'
  let p = raw || '/'
  if (!p.startsWith('/')) p = `/${p}`
  // 站点使用 .html 链接（兼容 GitHub Pages / Vercel），不做扩展名收敛
  if (base !== '/' && !p.startsWith(base)) {
    p = base.replace(/\/$/, '') + p
  }
  return p
}

async function run(q: string) {
  const my = ++seq
  loading.value = true
  error.value = ''
  try {
    const pf = await getPagefind()
    const search = await pf.search(q)
    const data = await Promise.all(
      search.results.slice(0, 20).map((r: any) => r.data())
    )
    if (my !== seq) return
    results.value = data.map((d: any) => ({
      title: d.meta?.title || d.url,
      url: normalizeUrl(d.url),
      excerpt: d.excerpt || '',
    }))
  } catch (e: any) {
    if (my !== seq) return
    error.value = `搜索索引加载失败：${e?.message || e}`
  } finally {
    if (my === seq) loading.value = false
  }
}

watch(query, (q) => {
  if (debounceTimer) window.clearTimeout(debounceTimer)
  const value = q.trim()
  if (!value) {
    results.value = []
    loading.value = false
    return
  }
  debounceTimer = window.setTimeout(() => run(value), 160)
})

function close() {
  searchOpen.value = false
}

function openFirst() {
  const first = results.value[0]
  if (first) {
    close()
    router.go(first.url)
  }
}

watch(searchOpen, async (open) => {
  if (open) {
    document.documentElement.classList.add('search-open')
    await nextTick()
    inputEl.value?.focus()
    getPagefind().catch((e) => {
      error.value = `搜索索引加载失败：${e?.message || e}`
    })
  } else {
    document.documentElement.classList.remove('search-open')
    query.value = ''
    results.value = []
    error.value = ''
  }
})

function onKeydown(e: KeyboardEvent) {
  const meta = e.ctrlKey || e.metaKey
  if (meta && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchOpen.value = !searchOpen.value
    return
  }
  if (e.key === 'Escape' && searchOpen.value) {
    e.preventDefault()
    close()
    return
  }
  const target = e.target as HTMLElement | null
  const typing =
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  if (e.key === '/' && !typing && !searchOpen.value) {
    e.preventDefault()
    searchOpen.value = true
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  prefetchTimer = window.setTimeout(() => {
    getPagefind().catch(() => {
      /* 首次进入后静默预载，失败时在用户打开搜索时提示 */
    })
  }, 2500)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (prefetchTimer) window.clearTimeout(prefetchTimer)
  if (debounceTimer) window.clearTimeout(debounceTimer)
  if (hideToast) window.clearTimeout(hideToast)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="searchOpen"
      class="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="站内搜索"
      @click.self="close"
    >
      <div class="search-panel">
        <div class="search-head">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" class="search-head__icon">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="m16 16 4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
          <input
            ref="inputEl"
            v-model="query"
            class="search-input"
            type="search"
            placeholder="搜索年份、Text、资料名…"
            autocomplete="off"
            spellcheck="false"
            aria-label="搜索关键词"
            @keydown.enter.prevent="openFirst"
          />
          <button class="search-close" type="button" aria-label="关闭搜索" @click="close">Esc</button>
        </div>

        <div class="search-body">
          <div v-if="loading" class="search-hint">搜索中…</div>
          <div v-else-if="error" class="search-hint search-hint--error">{{ error }}</div>
          <div v-else-if="query.trim() && !results.length" class="search-hint">
            没有找到「{{ query.trim() }}」相关内容
          </div>
          <ul v-else-if="results.length" class="search-results">
            <li v-for="r in results" :key="r.url">
              <a class="search-result" :href="r.url" @click="close">
                <span class="search-result__title">{{ r.title }}</span>
                <span class="search-result__excerpt" v-html="r.excerpt"></span>
              </a>
            </li>
          </ul>
          <div v-else class="search-hint">
            输入关键词开始搜索 · 支持中文、年份、Text 编号
          </div>
        </div>

        <div class="search-foot">
          <span>Pagefind 本地索引 · 查询不会上传</span>
          <span class="search-foot__keys"><kbd>Esc</kbd> 关闭 · <kbd>Enter</kbd> 打开第一条</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>