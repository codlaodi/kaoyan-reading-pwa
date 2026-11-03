<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useData } from 'vitepress'

const { site } = useData()

const file = ref('')
const year = ref('')
const title = ref('资料阅读')
const error = ref('')
const loading = ref(true)
const fromCache = ref(false)

const base = computed(() => (site.value.base || '/').replace(/\/$/, ''))
const src = computed(() => (file.value ? `${base.value}${file.value}` : ''))

function decodeName(path: string): string {
  try {
    const name = path.split('/').pop() || ''
    return name.replace(/\.html?$/i, '')
  } catch {
    return '资料阅读'
  }
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back()
  } else {
    window.location.href = `${base.value}/english-1/${year.value || '2010'}.html`
  }
}

function onFrameLoad() {
  loading.value = false
  try {
    const doc = (document.querySelector('.reader__frame') as HTMLIFrameElement)?.contentDocument
    const t = doc?.title
    if (t) title.value = t
  } catch {
    /* 跨域或未就绪时忽略 */
  }
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const f = params.get('f') || ''
  const y = params.get('year') || ''
  year.value = y
  if (!f.startsWith('/attachments/') || !/\.html?$/i.test(f)) {
    error.value = '无效的资料地址'
    loading.value = false
    return
  }
  file.value = f
  title.value = decodeName(f)

  // 判断是否已在离线缓存
  try {
    if ('caches' in window) {
      const cache = await caches.open('kaoyan-local-attachments')
      fromCache.value = !!(await cache.match(`${base.value}${f}`))
    }
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <div class="reader">
    <header class="reader__bar">
      <button class="reader__back" type="button" @click="goBack">← 返回</button>
      <div class="reader__titles">
        <span class="reader__title">{{ title }}</span>
        <span v-if="fromCache" class="reader__cache">已离线缓存</span>
      </div>
      <a v-if="src" class="reader__raw" :href="src" target="_blank" rel="noopener">原始文件</a>
    </header>

    <div v-if="error" class="reader__error">
      <p>{{ error }}</p>
      <a :href="`${base}/english-1/`">返回英语一目录</a>
    </div>
    <template v-else>
      <div v-if="loading" class="reader__loading">正在加载资料…</div>
      <iframe
        v-if="src"
        class="reader__frame"
        :src="src"
        title="资料阅读"
        @load="onFrameLoad"
      ></iframe>
    </template>
  </div>
</template>