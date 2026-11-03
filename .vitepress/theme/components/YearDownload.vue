<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useData } from 'vitepress'

const { site } = useData()

interface Item {
  file: string
  size: number
}

const items = ref<Item[]>([])
const cached = ref(0)
const busy = ref(false)
const supported = ref(false)
const error = ref('')

const base = computed(() => (site.value.base || '/').replace(/\/$/, ''))
const totalSize = computed(() => items.value.reduce((s, i) => s + i.size, 0))
const totalLabel = computed(() => {
  const mb = totalSize.value / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(totalSize.value / 1024)} KB`
})
const allCached = computed(() => items.value.length > 0 && cached.value >= items.value.length)

async function refreshCached() {
  try {
    if (!('caches' in window)) return
    const cache = await caches.open('kaoyan-local-attachments')
    let n = 0
    for (const item of items.value) {
      if (await cache.match(`${base.value}${item.file}`)) n++
    }
    cached.value = n
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  supported.value =
    typeof window !== 'undefined' &&
    'caches' in window &&
    (window.isSecureContext || location.hostname === 'localhost')

  const seen = new Set<string>()
  for (const a of Array.from(document.querySelectorAll('[data-att-file]'))) {
    const file = a.getAttribute('data-att-file') || ''
    if (!file || seen.has(file)) continue
    seen.add(file)
    items.value.push({ file, size: Number(a.getAttribute('data-att-size') || 0) })
  }
  await refreshCached()
})

async function downloadAll() {
  if (busy.value || !supported.value) return
  busy.value = true
  error.value = ''
  try {
    const cache = await caches.open('kaoyan-local-attachments')
    for (const item of items.value) {
      const url = `${base.value}${item.file}`
      if (await cache.match(url)) {
        await refreshCached()
        continue
      }
      try {
        const res = await fetch(url, { cache: 'no-cache' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await cache.put(url, res.clone())
      } catch (err) {
        error.value = `有文件缓存失败：${(err as Error).message}`
      }
      await refreshCached()
    }
  } finally {
    busy.value = false
    await refreshCached()
  }
}
</script>

<template>
  <div v-if="items.length" class="year-download">
    <div class="year-download__info">
      <strong>离线保存</strong>
      <span>
        本年 {{ items.length }} 份资料，共 {{ totalLabel }}；已缓存 {{ cached }}/{{ items.length }}
      </span>
    </div>
    <button
      class="year-download__btn"
      type="button"
      :disabled="busy || !supported || allCached"
      @click="downloadAll"
    >
      <template v-if="allCached">✓ 已全部缓存</template>
      <template v-else-if="busy">缓存中… {{ cached }}/{{ items.length }}</template>
      <template v-else>缓存本年资料</template>
    </button>
    <div v-if="!supported" class="year-download__hint">
      当前环境不支持离线缓存（需要 HTTPS 或 localhost）
    </div>
    <div v-if="error" class="year-download__hint year-download__hint--error">{{ error }}</div>
  </div>
</template>