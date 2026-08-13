import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { setupI18n } from './i18n'
import { initTheme } from './lib/theme'
import { router } from './router'
import { useAuthStore } from './stores/auth'
import { db } from './db'
import { getDeviceId } from './db/device-id'
import './assets/index.css'

initTheme()
getDeviceId()
void db.open()

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
setupI18n(app)
app.use(router)

const auth = useAuthStore(pinia)
// Mount immediately so offline boot never depends on network auth calls.
app.mount('#app')
void auth.init()
