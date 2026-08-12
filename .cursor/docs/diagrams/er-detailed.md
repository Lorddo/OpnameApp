# Domein ER-diagram (Detailed)

Living diagram bij [data-model.md](../data-model.md).  
**Laatst bijgewerkt:** 2026-08-10

## Belangrijke correcties t.o.v. eerdere schets

| Was | Wordt | Waarom |
|---|---|---|
| `ANSWER` | `OBSERVATION` | Claims met tijd, bron, eigenaar; niet alleen “antwoord op vraag” |
| `QUESTION` | `ATTRIBUTE` | Catalogus van gestructureerde attributen; templates selecteren subsets |
| Alleen Inspection → Answer | + `owner_org_id` + `visibility` | Eigenaarschaplaag; geen stille data-overname bij company-wissel |
| Foto alleen aan answer | Photo volgt observation + eigenaar | Bronbestanden blijven van klant/opnemende partij |
| Ontbrekende Facts | `FACT` per zichtbare org-scope | Geconsolideerde waarheid alleen uit observations die de org mag zien |

## Eigenaarschap & visibility

- **Juridisch:** inmeter / inspecteur / opdrachtgever blijft eigenaar van brondata — niet de softwareleverancier.
- **Property** (fysiek: ruimtes, installaties, pandkenmerken) mag centraal/herkenbaar blijven.
- **Inspection, Observation, Photo** hebben `owner_org_id` en zijn niet automatisch beschikbaar voor andere organisaties.
- Bij **company-wissel**: bestaande observations/foto’s/facts van de vorige org worden **niet automatisch** opgenomen.

`visibility` op Observation / Photo:

| Waarde | Betekenis |
|---|---|
| `private` | Alleen eigenaar-org |
| `shared` | Orgs met expliciete share/grant |
| `public_to_client` | Opdrachtgever/client-org van deze opname |

```mermaid
erDiagram

    TENANT ||--o{ ORGANIZATION : contains
    ORGANIZATION ||--o{ USER : employs
    ORGANIZATION ||--o{ PROPERTY : manages
    ORGANIZATION ||--o{ INSPECTION : owns
    ORGANIZATION ||--o{ OBSERVATION : owns
    ORGANIZATION ||--o{ PHOTO : owns

    PROPERTY ||--o{ FLOOR : contains
    FLOOR ||--o{ ROOM : contains

    PROPERTY ||--o{ ASSET : has
    PROPERTY ||--o{ INSPECTION : receives
    PROPERTY ||--o{ OBSERVATION : has_claims
    PROPERTY ||--o{ FACT : consolidates

    ATTRIBUTE ||--o{ TEMPLATE_ATTRIBUTE : used_in
    INSPECTION_TEMPLATE ||--o{ TEMPLATE_ATTRIBUTE : requires

    INSPECTION ||--o{ OBSERVATION : records
    INSPECTION }o--|| INSPECTION_TEMPLATE : uses_pinned

    ROOM ||--o{ OBSERVATION : relates_to
    ASSET ||--o{ OBSERVATION : relates_to
    ATTRIBUTE ||--o{ OBSERVATION : answers
    ATTRIBUTE ||--o{ FACT : current_value_of

    OBSERVATION ||--o{ PHOTO : evidence

    TENANT {
        uuid id
        string name
    }

    ORGANIZATION {
        uuid id
        uuid tenant_id
        string name
    }

    USER {
        uuid id
        uuid org_id
        string role
    }

    PROPERTY {
        uuid id
        uuid home_org_id
        string address
        string postcode
        string house_number
        string property_type
        string bag_id
    }

    FLOOR {
        uuid id
        uuid property_id
        string floor_type
    }

    ROOM {
        uuid id
        uuid floor_id
        string room_type
        string name
    }

    ASSET {
        uuid id
        uuid property_id
        string asset_type
    }

    INSPECTION_TEMPLATE {
        uuid id
        string name
        string version
    }

    ATTRIBUTE {
        uuid id
        string attribute_key
        string label
        string answer_type
        string scope
    }

    TEMPLATE_ATTRIBUTE {
        uuid template_id
        uuid attribute_id
        boolean required
        boolean required_photo
    }

    INSPECTION {
        uuid id
        uuid property_id
        uuid template_id
        uuid template_version_pinned
        uuid inspector_id
        uuid owner_org_id
        string status
    }

    OBSERVATION {
        uuid id
        uuid property_id
        uuid inspection_id
        uuid attribute_id
        uuid room_id
        uuid asset_id
        string value
        datetime observed_at
        uuid observer_id
        uuid owner_org_id
        string visibility
    }

    FACT {
        uuid id
        uuid property_id
        uuid attribute_id
        uuid room_id
        uuid asset_id
        string value
        uuid source_observation_id
        uuid visible_to_org_id
    }

    PHOTO {
        uuid id
        uuid observation_id
        uuid property_id
        uuid owner_org_id
        string visibility
        string storage_url
        uuid source_inspection_id
    }
```
