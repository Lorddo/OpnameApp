<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { ApiClientError, apiFetch } from '@/lib/api'
import { inputClass } from '@/lib/ui'
import type { OrgType } from '@opnameapp/core'

type Organization = {
  id: string
  name: string
  orgType: OrgType
  externalId: string | null
  createdAt?: string
}

type ProvisionResult = {
  organization: {
    id: string
    name: string
    orgType: OrgType
    externalId: string | null
    created: boolean
  }
  user: {
    id: string
    email: string
    role: 'inspector' | 'admin'
    created: boolean
    invited: boolean
    emailSent: boolean
    actionLink: string | null
    note?: string
  }
}

const { t } = useI18n()

const organizations = ref<Organization[]>([])
const orgsError = ref<string | null>(null)
const orgsLoading = ref(false)

const orgMode = ref<'new' | 'existing'>('new')
const orgName = ref('')
const orgType = ref<'inspection' | 'client'>('inspection')
const externalId = ref('')
const existingOrgId = ref('')
const email = ref('')
const displayName = ref('')
const role = ref<'inspector' | 'admin'>('inspector')

const submitting = ref(false)
const error = ref<string | null>(null)
const result = ref<ProvisionResult | null>(null)
const copied = ref(false)

async function loadOrganizations() {
  orgsLoading.value = true
  orgsError.value = null
  try {
    const data = await apiFetch<{ organizations: Organization[] }>('/api/admin/organizations')
    organizations.value = data.organizations
  } catch {
    orgsError.value = t('admin.orgsLoadError')
  } finally {
    orgsLoading.value = false
  }
}

function orgTypeLabel(type: string) {
  if (type === 'inspection') return t('admin.orgTypeInspection')
  if (type === 'client') return t('admin.orgTypeClient')
  return type
}

async function onSubmit() {
  error.value = null
  result.value = null
  copied.value = false
  submitting.value = true

  const organization =
    orgMode.value === 'existing'
      ? { id: existingOrgId.value }
      : {
          name: orgName.value.trim(),
          orgType: orgType.value,
          ...(externalId.value.trim() ? { externalId: externalId.value.trim() } : {}),
        }

  try {
    const data = await apiFetch<ProvisionResult>('/api/admin/provision-inspector', {
      method: 'POST',
      body: JSON.stringify({
        email: email.value.trim(),
        displayName: displayName.value.trim() || undefined,
        role: role.value,
        sendInvite: true,
        organization,
      }),
    })
    result.value = data
    email.value = ''
    displayName.value = ''
    if (data.organization.created) {
      orgMode.value = 'existing'
      existingOrgId.value = data.organization.id
    }
    await loadOrganizations()
  } catch (err) {
    error.value = err instanceof ApiClientError ? err.message : t('admin.orgsLoadError')
  } finally {
    submitting.value = false
  }
}

async function copyLink() {
  const link = result.value?.user.actionLink
  if (!link) return
  try {
    await navigator.clipboard.writeText(link)
    copied.value = true
  } catch {
    copied.value = false
  }
}

onMounted(() => {
  void loadOrganizations()
})
</script>

<template>
  <section class="space-y-6 lg:col-span-2">
    <div>
      <h1 class="text-3xl font-bold sm:text-4xl">{{ t('admin.title') }}</h1>
      <p class="mt-2 max-w-3xl text-muted-foreground">{{ t('admin.subtitle') }}</p>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <form
        class="space-y-5 rounded-xl border border-border bg-card p-5"
        @submit.prevent="onSubmit"
      >
        <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {{ t('admin.inviteTitle') }}
        </p>

        <fieldset class="space-y-3">
          <legend class="text-sm font-medium">{{ t('admin.orgMode') }}</legend>
          <div class="flex flex-wrap gap-3">
            <Button
              :variant="orgMode === 'new' ? 'brand' : 'outline'"
              type="button"
              @click="orgMode = 'new'"
            >
              {{ t('admin.orgNew') }}
            </Button>
            <Button
              :variant="orgMode === 'existing' ? 'brand' : 'outline'"
              type="button"
              @click="orgMode = 'existing'"
            >
              {{ t('admin.orgExisting') }}
            </Button>
          </div>
        </fieldset>

        <template v-if="orgMode === 'new'">
          <label class="block space-y-2">
            <span class="text-sm font-medium">{{ t('admin.orgName') }}</span>
            <input
              v-model="orgName"
              type="text"
              required
              :placeholder="t('admin.orgNamePlaceholder')"
              :class="inputClass"
            />
          </label>
          <label class="block space-y-2">
            <span class="text-sm font-medium">{{ t('admin.orgType') }}</span>
            <select v-model="orgType" :class="inputClass">
              <option value="inspection">{{ t('admin.orgTypeInspection') }}</option>
              <option value="client">{{ t('admin.orgTypeClient') }}</option>
            </select>
          </label>
          <label class="block space-y-2">
            <span class="text-sm font-medium">{{ t('admin.externalId') }}</span>
            <input v-model="externalId" type="text" :class="inputClass" />
            <span class="block text-xs text-muted-foreground">{{ t('admin.externalIdHint') }}</span>
          </label>
        </template>

        <label v-else class="block space-y-2">
          <span class="text-sm font-medium">{{ t('admin.existingOrg') }}</span>
          <select v-model="existingOrgId" required :class="inputClass">
            <option value="" disabled>{{ t('admin.chooseOrg') }}</option>
            <option v-for="org in organizations" :key="org.id" :value="org.id">
              {{ org.name }} ({{ orgTypeLabel(org.orgType) }})
            </option>
          </select>
        </label>

        <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {{ t('admin.inspectorTitle') }}
        </p>

        <label class="block space-y-2">
          <span class="text-sm font-medium">{{ t('admin.email') }}</span>
          <input v-model="email" type="email" required autocomplete="off" :class="inputClass" />
        </label>
        <label class="block space-y-2">
          <span class="text-sm font-medium">{{ t('admin.displayName') }}</span>
          <input
            v-model="displayName"
            type="text"
            :placeholder="t('admin.displayNamePlaceholder')"
            :class="inputClass"
          />
        </label>
        <label class="block space-y-2">
          <span class="text-sm font-medium">{{ t('admin.role') }}</span>
          <select v-model="role" :class="inputClass">
            <option value="inspector">{{ t('admin.roleInspector') }}</option>
            <option value="admin">{{ t('admin.roleAdmin') }}</option>
          </select>
        </label>

        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        <Button type="submit" :disabled="submitting">
          {{ submitting ? t('admin.submitting') : t('admin.submit') }}
        </Button>
      </form>

      <div class="space-y-5">
        <div v-if="result" class="space-y-3 rounded-xl border border-border bg-card p-5">
          <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('admin.success') }}
          </p>
          <p class="font-medium">
            {{ result.organization.name }}
            <span class="text-sm font-normal text-muted-foreground">
              — {{ result.organization.created ? t('admin.orgCreated') : t('admin.orgReused') }}
            </span>
          </p>
          <p>
            {{ result.user.email }}
            <span class="text-sm text-muted-foreground">
              — {{ result.user.created ? t('admin.userCreated') : t('admin.userLinked') }}
            </span>
          </p>
          <template v-if="result.user.actionLink">
            <p class="text-sm font-medium">{{ t('admin.inviteLink') }}</p>
            <p class="text-xs text-muted-foreground">{{ t('admin.inviteLinkHint') }}</p>
            <p class="break-all rounded-lg bg-muted px-3 py-2 text-xs">
              {{ result.user.actionLink }}
            </p>
            <div class="flex flex-wrap gap-3">
              <Button type="button" variant="brand" size="sm" @click="copyLink">
                {{ copied ? t('admin.copied') : t('admin.copyLink') }}
              </Button>
              <a
                :href="result.user.actionLink"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-10 items-center rounded-md border border-input bg-card px-3 text-sm font-semibold hover:bg-muted"
              >
                {{ t('admin.openLink') }}
              </a>
            </div>
          </template>
          <p v-else class="text-sm text-muted-foreground">{{ t('admin.noLink') }}</p>
        </div>

        <div class="rounded-xl border border-border bg-card p-5">
          <p class="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('admin.orgsTitle') }}
          </p>
          <p v-if="orgsLoading" class="text-sm text-muted-foreground">{{ t('common.loading') }}</p>
          <p v-else-if="orgsError" class="text-sm text-destructive">{{ orgsError }}</p>
          <p v-else-if="organizations.length === 0" class="text-sm text-muted-foreground">
            {{ t('admin.orgsEmpty') }}
          </p>
          <ul v-else class="divide-y divide-border">
            <li v-for="org in organizations" :key="org.id" class="py-3 first:pt-0 last:pb-0">
              <p class="font-medium">{{ org.name }}</p>
              <p class="text-sm text-muted-foreground">
                {{ orgTypeLabel(org.orgType) }}
                <template v-if="org.externalId"> · {{ org.externalId }}</template>
              </p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
