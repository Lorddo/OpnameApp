import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { setupI18n } from './i18n'
import { initTheme } from './lib/theme'
import { router } from './router'
import './assets/index.css'

initTheme()

const app = createApp(App)
app.use(createPinia())
setupI18n(app)
app.use(router)
app.mount('#app')
