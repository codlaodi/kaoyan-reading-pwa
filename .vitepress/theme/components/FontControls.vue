<script setup lang="ts">
import { computed } from 'vue'
import { FONT_STEPS, fontScale, setFontScale } from '../store'

const index = computed(() => FONT_STEPS.indexOf(fontScale.value))
const label = computed(() => `${Math.round(fontScale.value * 100)}%`)

function step(delta: number) {
  const next = Math.min(FONT_STEPS.length - 1, Math.max(0, index.value + delta))
  setFontScale(FONT_STEPS[next])
}
</script>

<template>
  <div class="font-controls" role="group" aria-label="正文字号调节">
    <button
      type="button"
      class="font-controls__btn"
      :disabled="index <= 0"
      title="减小字号"
      @click="step(-1)"
    >
      A-
    </button>
    <span class="font-controls__label" title="当前字号">{{ label }}</span>
    <button
      type="button"
      class="font-controls__btn"
      :disabled="index >= FONT_STEPS.length - 1"
      title="增大字号"
      @click="step(1)"
    >
      A+
    </button>
  </div>
</template>