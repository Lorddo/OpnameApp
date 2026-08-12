# Domein ER-diagram (Detailed)

Living diagram bij [data-model.md](../data-model.md).  
**Laatst bijgewerkt:** 2026-08-12

## Belangrijke keuzes

| Onderwerp | Keuze | ADR |
|---|---|---|
| Gecombineerde opname | `inspection_template_pins` i.p.v. één template per inspection | [ADR-015](../decisions/ADR-015-combined-inspection.md) |
| Opdrachtgever | `organizations.org_type` + `property_assignments` | [ADR-016](../decisions/ADR-016-client-org-assignment.md) |
| Facts | View `security_invoker`, LWW binnen `owner_org_id` | [ADR-014](../decisions/ADR-014-facts-as-view.md) |
| BAG | Nullable `bag_id`, geen lookup in onze app | — |

`visibility` op Observation / Photo:

| Waarde | Betekenis | MVP |
|---|---|---|
| `private` | Alleen eigenaar-org | In gebruik |
| `shared` | Orgs met expliciete share/grant | Hook, geen UI |
| `public_to_client` | Opdrachtgever van de opname | Hook, geen UI |

```mermaid
erDiagram

    TENANT ||--o{ ORGANIZATION : contains
    ORGANIZATION ||--o{ ORG_MEMBER : has
    PROFILE ||--o{ ORG_MEMBER : membership
    ORGANIZATION ||--o{ PROPERTY : home_or_creates
    ORGANIZATION ||--o{ PROPERTY_ASSIGNMENT : assigned
    PROPERTY ||--o{ PROPERTY_ASSIGNMENT : grants
    ORGANIZATION ||--o{ INSPECTION : owns
    ORGANIZATION ||--o{ OBSERVATION : owns
    ORGANIZATION ||--o{ PHOTO : owns
    ORGANIZATION ||--o{ API_KEY : issues

    PROPERTY ||--o{ FLOOR : contains
    FLOOR ||--o{ ROOM : contains
    PROPERTY ||--o{ ASSET : has
    PROPERTY ||--o{ INSPECTION : receives
    PROPERTY ||--o{ OBSERVATION : has_claims

    INSPECTION_TEMPLATE ||--o{ INSPECTION_TEMPLATE_PIN : pinned_as
    INSPECTION ||--o{ INSPECTION_TEMPLATE_PIN : pins
    INSPECTION ||--o{ OBSERVATION : records
    ATTRIBUTE ||--o{ OBSERVATION : answers
    OBSERVATION ||--o{ PHOTO : evidence

    TENANT {
        uuid id
        text name
    }

    ORGANIZATION {
        uuid id
        uuid tenant_id
        text name
        org_type org_type
    }

    PROFILE {
        uuid id
        text display_name
        text locale
    }

    ORG_MEMBER {
        uuid id
        uuid org_id
        uuid user_id
        org_role role
    }

    PROPERTY {
        uuid id
        uuid home_org_id
        uuid created_by_org_id
        text postcode
        text house_number
        text house_number_addition
        text city
        text property_type
        int build_year
        text bag_id
    }

    PROPERTY_ASSIGNMENT {
        uuid id
        uuid property_id
        uuid org_id
        property_assignment_role role
        timestamptz active_from
        timestamptz active_to
    }

    FLOOR {
        uuid id
        uuid property_id
        text label
        int sort_order
    }

    ROOM {
        uuid id
        uuid floor_id
        uuid property_id
        text room_type
        text label
    }

    ASSET {
        uuid id
        uuid property_id
        text asset_type
        text label
    }

    ATTRIBUTE {
        text attribute_key
        answer_scope answer_scope
        text question_key
        text label
        answer_type answer_type
        jsonb options
    }

    INSPECTION_TEMPLATE {
        uuid id
        text template_key
        text version
        text label
        text locale
        jsonb config
        timestamptz published_at
    }

    INSPECTION {
        uuid id
        uuid property_id
        uuid owner_org_id
        uuid client_org_id
        uuid inspector_id
        uuid assigned_user_id
        inspection_status status
    }

    INSPECTION_TEMPLATE_PIN {
        uuid id
        uuid inspection_id
        text template_key
        text template_version
    }

    OBSERVATION {
        uuid id
        uuid property_id
        uuid inspection_id
        text attribute_key
        subject_type subject_type
        uuid subject_id
        jsonb value
        uuid owner_org_id
        visibility visibility
        text device_id
        timestamptz updated_at
    }

    PHOTO {
        uuid id
        uuid property_id
        uuid observation_id
        uuid owner_org_id
        visibility visibility
        text storage_provider
        text storage_key
        text checksum
        uuid source_inspection_id
    }

    API_KEY {
        uuid id
        uuid org_id
        text name
        text key_prefix
        text key_hash
        timestamptz revoked_at
    }
```

**Facts** is geen tabel: view over `observations` (LWW per property/subject/attribute/`owner_org_id`).
