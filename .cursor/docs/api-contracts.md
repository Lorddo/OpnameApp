# API contracts

**Status:** fase 1 implementatie (v0.1)  
**Laatst bijgewerkt:** 2026-08-13

OpenAPI: `GET /api/openapi.json`

## Auth

| Pad | Header |
|---|---|
| Gebruiker (PWA) | `Authorization: Bearer <supabase_access_token>` |
| Dashboard (M2M) | `Authorization: Bearer opk_<prefix>_<secret>` |

JWT moet `app_metadata.org_id` (en idealiter `org_role`) bevatten. API-keys worden gehasht opgeslagen (`api_keys`).

## Endpoints (v0.1)

| Method | Path | Doel |
|---|---|---|
| GET | `/api/sync/pull?sinceTemplates=&sinceProperties=&sinceInspections=` | Incremental pull voor offline clients |
| GET | `/api/me` | Auth-context |
| POST | `/api/me/api-keys` | API-key aanmaken (org admin) |
| GET | `/api/templates` | Lijst templates |
| GET | `/api/templates/:key/:version` | Template config |
| GET/POST | `/api/properties` | Objecten |
| GET | `/api/properties/:id` | Object + floors/rooms/assets |
| POST | `/api/properties/:id/floors` | Laag toevoegen |
| POST | `/api/properties/:id/rooms` | Ruimte toevoegen |
| GET/POST | `/api/inspections` | Opnames (+ template pins bij create) |
| PATCH | `/api/inspections/:id` | Status bijwerken |
| POST | `/api/observations/batch` | Batch upsert observations |
| GET | `/api/facts?propertyId=` | Facts-view |
| POST | `/api/photos/upload-url` | Foto-metadata + upload target |
| PUT | `/api/photos/:id/content` | Binary upload naar R2 |
| GET | `/api/photos/:id/content` | Binary download uit R2 |
| GET | `/api/photos?propertyId=&inspectionId=` | Foto-metadata lijst |
| GET | `/api/exports/properties/:id/dossier` | JSON-dossier (`schemaVersion: 1`) |
| POST | `/api/assignments` | Property toewijzen aan inspection-org |
| POST | `/api/admin/provision-inspector` | Org (optioneel) + user invite/link + `app_metadata` + `org_members` |
| POST | `/api/admin/assign-inspection` | Property + inspection (+ pins) vanuit dashboard |

## Dashboard provisioning

Auth: `Authorization: Bearer opk_…` (API-key). Lege `scopes` = alles; anders o.a. `provision:users`, `assignments:write`.

### `POST /api/admin/provision-inspector`

```json
{
  "email": "jan@bureau.nl",
  "displayName": "Jan",
  "role": "inspector",
  "sendInvite": true,
  "organization": {
    "externalId": "pranimate-org-123",
    "name": "Bureau Noord",
    "orgType": "inspection"
  }
}
```

- Platform-API-key: mag orgs aanmaken/updaten via `externalId` onder dezelfde tenant.
- Inspection-org key / org-admin JWT: nodigt alleen uit in **eigen** org (organization-payload weglaten of eigen id).
- Zet altijd `app_metadata.org_id` + `org_role` en `org_members`.

### `POST /api/admin/assign-inspection`

```json
{
  "assignedUserEmail": "jan@bureau.nl",
  "templates": [{ "templateKey": "bbmi", "templateVersion": "0.1.0" }],
  "property": { "postcode": "1234AB", "houseNumber": "1" },
  "inspection": { "status": "assigned" }
}
```

## Dossier shape (schemaVersion 1)

`property`, `floors`, `rooms`, `assets`, `inspections`, `observations`, `facts`, `photos`, `completeness` (per gepind template).
