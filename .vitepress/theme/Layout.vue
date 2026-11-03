<script setup lang="ts">
import { onMounted } from 'vue'
import DefaultTheme from 'vitepress/theme'
import SearchButton from './components/SearchButton.vue'
import FontControls from './components/FontControls.vue'
import SearchModal from './components/SearchModal.vue'
import MobileDock from './components/MobileDock.vue'
import ReadingProgress from './components/ReadingProgress.vue'
import PwaUpdate from './components/PwaUpdate.vue'
import { initFontScale } from './store'

const { Layout } = DefaultTheme

onMounted(() => initFontScale())
</script>

<template>
  <ReadingProgress />
  <Layout>
    <template #nav-bar-content-after>
      <div class="nav-actions">
        <SearchButton />
        <FontControls />
      </div>
    </template>
  </Layout>
  <MobileDock />
  <SearchModal />
  <PwaUpdate />
</template>