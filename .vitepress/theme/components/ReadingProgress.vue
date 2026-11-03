<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'
import { readProgress, writeProgress } from '../store'

const route = useRoute()
const pct = ref(0)
const savedPct = ref<number | null>(null)
const showResume = ref(false)

let lastSave = 0
let ticking = false
let hideTimer: number | undefined
let mounted = false

function currentPct(): number {
  const el = document.documentElement
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((el.scrollTop / max) * 100)))
}

function save(force = false) {
  if (!mounted) return
  const now = Date.now()
  if (!force && now - lastSave < 800) return
  lastSave = now
  const p = currentPct()
  pct.value = p
  if (p < 3) return
  const map = readProgress()
  map[route.path] = {
    pct: p,
    title: document.title.replace(/ · 考研阅读大观$/, ''),
    ts: now,
  }
  const keys = Object.keys(map)
    .sort((a, b) => map[b].ts - map[a].ts)
    .slice(0, 120)
  const trimmed: Record<string, (typeof map)[string]> = {}
  for (const k of keys) trimmed[k] = map[k]
  writeProgress(trimmed)
}

function onScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    ticking = false
    pct.value = currentPct()
    save()
  })
}

function checkResume() {
  const entry = readProgress()[route.path]
  if (entry && entry.pct >= 10 && entry.pct <= 95 && Math.abs(entry.pct - currentPct()) > 4) {
    savedPct.value = entry.pct
    showResume.value = true
    if (hideTimer) window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => {
      showResume.value = false
    }, 9000)
  } else {
    showResume.value = false
  }
}

function resume() {
  const el = document.documentElement
  const max = el.scrollHeight - el.clientHeight
  window.scrollTo({ top: (max * (savedPct.value || 0)) / 100, behavior: 'smooth' })
  showResume.value = false
}

function onVisibility() {
  if (document.visibilityState === 'hidden') save(true)
}

function onPageHide() {
  save(true)
}

onMounted(() => {
  mounted = true
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibility)
  window.setTimeout(checkResume, 500)
})

watch(
  () => route.path,
  async () => {
    pct.value = 0
    showResume.value = false
    await nextTick()
    window.setTimeout(() => {
      pct.value = currentPct()
      checkResume()
    }, 400)
  }
)

onBeforeUnmount(() => {
  save(true)
  mounted = false
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('pagehide', onPageHide)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div class="reading-progress" :style="{ width: pct + '%' }" aria-hidden="true"></div>
  <button v-if="showResume" class="resume-pill" type="button" @click="resume">
    <span class="resume-pill__dot"></span>
    继续上次阅读 · {{ savedPct }}%
  </button>
</template>