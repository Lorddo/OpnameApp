import { onUnmounted, ref } from 'vue'
import { apiFetch } from '@/lib/api'
import { resolvePhotoPreviewUrl } from '@/lib/photo-preview'
import { loadTemplateConfigs } from '@/lib/templates'
import { getLocalPropertyBundle } from '@/db/repository'
import { localPropertyToDossierPayload } from '@/stores/inspection-hydrate'
import type { InspectionTemplate } from '@opnameapp/core'
import type { DossierPayload } from '@/components/dossier/types'

export function useDossierLoad(propertyId: () => string) {
  const dossier = ref<DossierPayload | null>(null)
  const templates = ref<InspectionTemplate[]>([])
  const photoPreviewUrls = ref<Record<string, string>>({})
  const error = ref<string | null>(null)
  const loading = ref(true)

  function revokePreviews() {
    for (const url of Object.values(photoPreviewUrls.value)) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
    photoPreviewUrls.value = {}
  }

  async function load() {
    loading.value = true
    error.value = null
    revokePreviews()
    try {
      try {
        dossier.value = await apiFetch<DossierPayload>(
          `/api/exports/properties/${propertyId()}/dossier`,
        )
      } catch {
        // Local-only / pending-sync properties: build a minimal dossier from Dexie.
        const local = await getLocalPropertyBundle(propertyId())
        if (!local) throw new Error('Dossier niet beschikbaar (lokaal noch server)')
        dossier.value = {
          exportedAt: new Date().toISOString(),
          ...localPropertyToDossierPayload(local),
        } as DossierPayload
      }
      const payload = dossier.value
      if (!payload) throw new Error('Dossier niet beschikbaar (lokaal noch server)')
      const pins = (payload.inspections ?? []).flatMap(
        (inspection) => inspection.inspection_template_pins ?? [],
      )
      const unique = [
        ...new Map(pins.map((p) => [`${p.template_key}@${p.template_version}`, p])).values(),
      ].map((p) => ({
        templateKey: p.template_key,
        templateVersion: p.template_version,
      }))
      const configs: InspectionTemplate[] = []
      for (const pin of unique) {
        try {
          configs.push(...(await loadTemplateConfigs([pin])))
        } catch {
          // skip missing pin — dossier can still render without every template
        }
      }
      templates.value = configs

      const photos = payload.photos ?? []
      const previews: Record<string, string> = {}
      await Promise.all(
        photos.map(async (photo) => {
          const url = await resolvePhotoPreviewUrl(photo.id)
          if (url) previews[photo.id] = url
        }),
      )
      photoPreviewUrls.value = previews
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  onUnmounted(() => {
    revokePreviews()
  })

  return {
    dossier,
    templates,
    photoPreviewUrls,
    error,
    loading,
    load,
    revokePreviews,
  }
}
