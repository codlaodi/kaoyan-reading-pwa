<script setup lang="ts">
import { searchOpen } from '../store'
</script>

<template>
  <button class="search-trigger" type="button" aria-label="站内搜索" @click="searchOpen = true">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8" />
      <path d="m16 16 4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
    <span class="search-trigger__text">搜索</span>
    <kbd class="search-trigger__kbd">Ctrl K</kbd>
  </button>
</template>