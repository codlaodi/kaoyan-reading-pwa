<script setup lang="ts">
import { computed } from 'vue'
import { useData, useRoute } from 'vitepress'
import { FONT_STEPS, fontScale, searchOpen, setFontScale } from '../store'

const { isDark } = useData()
const route = useRoute()
const index = computed(() => FONT_STEPS.indexOf(fontScale.value))
const hidden = computed(() => /\/reader\.html$/.test(route.path))

function step(delta: number) {
  const next = Math.min(FONT_STEPS.length - 1, Math.max(0, index.value + delta))
  setFontScale(FONT_STEPS[next])
}

function toggleTheme() {
  isDark.value = !isDark.value
  try {
    localStorage.setItem('vitepress-theme-appearance', isDark.value ? 'dark' : 'light')
  } catch {
    /* ignore */
  }
}

function toTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <nav v-if="!hidden" class="mobile-dock" aria-label="快捷操作">
    <button type="button" class="mobile-dock__btn" @click="searchOpen = true">
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="m16 16 4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span>搜索</span>
    </button>
    <button type="button" class="mobile-dock__btn" :disabled="index <= 0" @click="step(-1)">
      <span class="mobile-dock__glyph">A-</span>
      <span>缩小</span>
    </button>
    <button type="button" class="mobile-dock__btn" :disabled="index >= FONT_STEPS.length - 1" @click="step(1)">
      <span class="mobile-dock__glyph">A+</span>
      <span>放大</span>
    </button>
    <button type="button" class="mobile-dock__btn" @click="toggleTheme">
      <svg v-if="isDark" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.7" />
        <path
          d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
        <path
          d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linejoin="round"
        />
      </svg>
      <span>{{ isDark ? '浅色' : '深色' }}</span>
    </button>
    <button type="button" class="mobile-dock__btn" @click="toTop">
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
        <path d="M12 19V6M6 11.5 12 5.5l6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>顶部</span>
    </button>
  </nav>
</template>