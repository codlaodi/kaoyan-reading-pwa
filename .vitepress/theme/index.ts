import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import ContinueReading from './components/ContinueReading.vue'
import AttachmentReader from './components/AttachmentReader.vue'
import YearDownload from './components/YearDownload.vue'

import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('ContinueReading', ContinueReading)
    app.component('AttachmentReader', AttachmentReader)
    app.component('YearDownload', YearDownload)
  },
} satisfies Theme