<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useData } from 'vitepress'
import { lastRead, timeAgo, withBase, type ProgressEntry } from '../store'

const { site } = useData()
const data = ref<{ path: string; entry: ProgressEntry } | null>(null)
const ago = ref('')

onMounted(() => {
  const l = lastRead()
  if (l) {
    data.value = l
    ago.value = timeAgo(l.entry.ts)
  }
})

const href = computed(() => (data.value ? withBase(data.value.path, site.value.base) : '/'))
const pct = computed(() => (data.value ? data.value.entry.pct : 0))
</script>

<template>
  <div v-if="data" class="continue-card">
    <div class="continue-card__head">
      <span class="continue-card__label">继续上次阅读</span>
      <span class="continue-card__time">{{ ago }}</span>
    </div>
    <a class="continue-card__title" :href="href">{{ data.entry.title }}</a>
    <div class="continue-card__bar" :aria-label="`已读 ${pct}%`">
      <span :style="{ width: pct + '%' }"></span>
    </div>
    <div class="continue-card__foot">
      <span>已读 {{ pct }}%</span>
      <a class="continue-card__btn" :href="href">继续阅读 →</a>
    </div>
  </div>
</template>