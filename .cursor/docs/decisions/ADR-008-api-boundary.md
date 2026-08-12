# ADR-008: API boundary (dashboard & rapporten)

**Status:** Akkoord  
**Datum:** 2026-08-10  
**Gerelateerd:** [vision.md](../vision.md), [architecture.md](../architecture.md), [api-contracts.md](../api-contracts.md)

---

## Context

De klant heeft (of bouwt) een eigen dashboard en rapportagetools. Als wij dashboard-UI en BBMI/WWS-rapportgeneratie meenemen, explodeert scope en ontstaat vendor lock-in op hun processen.

## Besluit

- Wij leveren **backend + API + inspectie-PWA**
- **Klantdashboard** (bouw/beheer/UI) = buiten scope; zij koppelen op onze API
- **Rapportgeneratie** (BBMI/WWS/EPA e.d.) = buiten scope; gebeurt in hun dashboard/tools op onze data
- Partner-template/CSV-vulling = apart traject; architectuur sluit aan via API/JSON
- **Realworks API-koppeling** niet voorzien; eventueel later import van exports als meerwerk
- Wij zijn technische bron van waarheid van het platform; juridisch blijft de klant data-eigenaar (export/portabiliteit)

## Consequenties

- API-contract / dossier-export is een opleveringsartefact (zie open punten in api-contracts)
- Geen belofte van “90%+ automatisering” van rapportage
- Integraties zijn pull-op-onze-API, niet ad-hoc point-to-point naar klantsoftware

## Alternatieven (verworpen)

- Dashboard + rapporten in dezelfde MVP — scope en onderhoudsexplosie
- Realworks live API als harde eis — duur/onnodig voor initiële oplevering
