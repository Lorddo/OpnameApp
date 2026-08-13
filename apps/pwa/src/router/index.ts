import { createRouter, createWebHistory } from 'vue-router'
import AppShell from '@/layouts/AppShell.vue'
import LoginView from '@/views/LoginView.vue'
import ProjectsView from '@/views/ProjectsView.vue'
import SettingsView from '@/views/SettingsView.vue'
import InspectionFlowView from '@/views/InspectionFlowView.vue'
import DossierView from '@/views/DossierView.vue'
import AuthCallbackView from '@/views/AuthCallbackView.vue'
import SetPasswordView from '@/views/SetPasswordView.vue'
import { useAuthStore } from '@/stores/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: AuthCallbackView,
      meta: { public: true },
    },
    {
      path: '/auth/set-password',
      name: 'set-password',
      component: SetPasswordView,
      // Requires session from invite/recovery; guard allows if authenticated
    },
    {
      path: '/',
      component: AppShell,
      children: [
        {
          path: '',
          name: 'projects',
          component: ProjectsView,
        },
        {
          path: 'inspections/new',
          name: 'inspection-new',
          component: InspectionFlowView,
        },
        {
          path: 'inspections/:inspectionId',
          name: 'inspection-resume',
          component: InspectionFlowView,
        },
        {
          path: 'dossier/:propertyId',
          name: 'dossier',
          component: DossierView,
        },
        {
          path: 'settings',
          name: 'settings',
          component: SettingsView,
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.init()
  if (to.meta.public) {
    if (auth.isAuthenticated && to.name === 'login') return { name: 'projects' }
    return true
  }
  if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  return true
})
