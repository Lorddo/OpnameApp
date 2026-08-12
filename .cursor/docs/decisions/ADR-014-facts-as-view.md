# ADR-014: Facts as security_invoker view

**Status:** Akkoord  
**Datum:** 2026-08-12  
**Gerelateerd:** [ADR-002](./ADR-002-observations-model.md), [data-model.md](../data-model.md)

---

## Context

Facts zijn de geconsolideerde “huidige waarde” per attribuut binnen een eigenaarscope. Een aparte getriggerde tabel loopt snel uit sync met de observation-history.

## Besluit

- `public.facts` is een **view** met `security_invoker = true`.
- LWW per `(property_id, subject_type, subject_id, attribute_key, owner_org_id)` op `updated_at` (daarna `observed_at`, `id`).
- Geen aparte sync van facts; clients lezen de view of een API die de view bevraagt.
- Materialiseren blijft een latere optie zonder API-contractwijziging.

## Consequenties

- RLS op `observations` blijft de autorisatiebron.
- Writes gaan altijd naar `observations`; facts zijn read-only.

## Alternatieven (verworpen)

- Getriggerde facts-tabel — drift-risico en dubbele sync.
- Facts zonder `owner_org_id` — breekt ownership-model.
