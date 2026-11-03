<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useData } from 'vitepress'

const { site } = useData()
const updateReady = ref(false)
const toast = ref('')

let registration: ServiceWorkerRegistration | null = null
let reloading = false
let toastTimer: number | undefined

function showToast(message: string, ms = 3200) {
  toast.value = message
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, ms)
}

function applyUpdate() {
  if (registration?.waiting) {
    registration.waiting.postMessage('SKIP_WAITING')
  } else {
    window.location.reload()
  }
}

function onOnline() {
  showToast('已恢复联网')
}
function onOffline() {
  showToast('当前已离线，可继续阅读已缓存内容')
}

onMounted(async () => {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  try {
    registration = await navigator.serviceWorker.register(`${site.value.base}sw.js`, {
      scope: site.value.base,
    })

    if (registration.waiting && navigator.serviceWorker.controller) {
      updateReady.value = true
    }

    registration.addEventListener('updatefound', () => {
      const installing = registration?.installing
      if (!installing) return
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          updateReady.value = true
        }
      })
    })

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })

    navigator.serviceWorker.ready.then(() => {
      let announced = false
      try {
        announced = sessionStorage.getItem('kaoyan:sw-ready') === '1'
        sessionStorage.setItem('kaoyan:sw-ready', '1')
      } catch {
        /* ignore */
      }
      if (!announced) showToast('已缓存完成，断网也能打开')
    })
  } catch (err) {
    console.warn('[pwa] Service Worker 注册失败：', err)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  if (toastTimer) window.clearTimeout(toastTimer)
})
</script>

<template>
  <div v-if="updateReady" class="sw-update" role="status">
    <span>站点有新版本</span>
    <button type="button" @click="applyUpdate">立即更新</button>
  </div>
  <Transition name="sw-toast">
    <div v-if="toast" class="sw-toast" role="status">{{ toast }}</div>
  </Transition>
</template>