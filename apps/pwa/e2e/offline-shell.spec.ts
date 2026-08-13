import { expect, test } from '@playwright/test'

async function waitForControllingSW(page: import('@playwright/test').Page) {
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.ready
    return Boolean(reg.active) && navigator.serviceWorker.controller != null
  })
}

test.describe('offline PWA shell', () => {
  test('login shell survives offline after SW precache', async ({ page, context }) => {
    await page.goto('/login')
    await expect(page.getByText('OpnameApp')).toBeVisible()

    // First load installs SW; a second online navigation lets it take control if needed.
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return Boolean(reg?.active || reg?.installing || reg?.waiting)
    })
    await page.reload({ waitUntil: 'networkidle' })
    await waitForControllingSW(page)

    // Ensure precache has the document shell.
    await page.waitForFunction(async () => {
      const keys = await caches.keys()
      for (const key of keys) {
        const cache = await caches.open(key)
        const match = await cache.match('/index.html')
        if (match) return true
        const matchRoot = await cache.match('/')
        if (matchRoot) return true
      }
      return false
    })

    await context.setOffline(true)
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('OpnameApp')).toBeVisible()
    await expect(page.getByRole('button', { name: /inloggen|sign in/i })).toBeVisible()
  })

  test('IndexedDB outbox row survives app restart while offline', async ({ page, context }) => {
    await page.goto('/login')
    await expect(page.getByText('OpnameApp')).toBeVisible()

    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return Boolean(reg?.active || reg?.installing || reg?.waiting)
    })
    await page.reload({ waitUntil: 'networkidle' })
    await waitForControllingSW(page)

    await page.waitForFunction(async () => {
      try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('opnameapp')
          req.onerror = () => reject(req.error ?? new Error('idb open failed'))
          req.onsuccess = () => resolve(req.result)
        })
        const ok = db.objectStoreNames.contains('outbox')
        db.close()
        return ok
      } catch {
        return false
      }
    })

    const entityId = await page.evaluate(async () => {
      const id = crypto.randomUUID()
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('opnameapp')
        req.onerror = () => reject(req.error ?? new Error('idb open failed'))
        req.onsuccess = () => resolve(req.result)
      })

      const now = new Date().toISOString()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('outbox', 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('outbox write failed'))
        tx.objectStore('outbox').put({
          id: crypto.randomUUID(),
          op: 'property.create',
          entityId: id,
          payload: { id, postcode: '1234AB', houseNumber: '1' },
          dependsOn: [],
          createdAt: now,
          attempts: 0,
          nextAttemptAt: now,
          lastError: null,
        })
      })
      db.close()
      return id
    })

    await context.setOffline(true)
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('OpnameApp')).toBeVisible()

    const stillThere = await page.evaluate(async (wanted) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('opnameapp')
        req.onerror = () => reject(req.error ?? new Error('idb open failed'))
        req.onsuccess = () => resolve(req.result)
      })
      const rows = await new Promise<Array<{ entityId: string }>>((resolve, reject) => {
        const tx = db.transaction('outbox', 'readonly')
        const req = tx.objectStore('outbox').getAll()
        req.onerror = () => reject(req.error ?? new Error('outbox read failed'))
        req.onsuccess = () => resolve(req.result as Array<{ entityId: string }>)
      })
      db.close()
      return rows.some((r) => r.entityId === wanted)
    }, entityId)

    expect(stillThere).toBe(true)
  })
})
