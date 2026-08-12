# Vision

**Status:** productvoorstel / offertefase  
**Laatst bijgewerkt:** 2026-08-10

---

## Hoofddoel

We bouwen **geen** BBMI-app, WWS-app of EPA-app.

We bouwen een **generiek vastgoed- en inspectieplatform** waarvan BBMI en WWS de eerste templates in scope zijn. Andere inspectietypes (EPA, NEN 2580, WO, BOG, brandveiligheid, …) zijn dezelfde architectuur, maar **meerwerk** buiten de initiële oplevering.

Alle technische keuzes moeten deze visie ondersteunen.

### In initiële oplevering (fasen 1–4)

- Platform-engine + PWA
- Offline + sync
- Template: BBMI
- Template: WWS

### Meerwerk / latere templates (zelfde platform, geen nieuwe app)

- EPA
- NEN 2580
- WO
- BOG-specifieke inspecties / uitbreidingen
- Brandveiligheid
- Energielabel-inspecties
- Verkoop- / aankoopopnames
- Vastgoedinventarisaties
- Woningcorporatie- / makelaarsopnames
- Overige inspectietypes

Nieuwe inspectietypes worden toegevoegd **zonder nieuwe applicaties** te bouwen — als configuratie (templates) over hetzelfde datamodel.

---

## Centrale filosofie

**Het vastgoedobject (Property) is de bron van waarheid.**

Niet het rapport. Niet de inspectie. Niet de vragenlijst.

Geldt voor **elk type vastgoed** (woning, BOG, gemengd gebruik, etc.) — niet alleen wonen.

Alle informatie wordt opgeslagen als objectdata. Dossiers, exports en (klant)rapportages gebruiken die data.

### Voorbeeld

1. Een makelaar of partner legt vast: ruimtes, algemene pandkenmerken, type verwarming.
2. Later voert een andere inspecteur een aanvullende inspectie uit.
3. Die vult alleen **ontbrekende of aanvullende** gegevens aan.
4. Over tijd ontstaat een rijkere objectdatabase.

### Ontwerpregel (kern)

> Templates vragen om data.  
> Observations leggen claims vast (met tijd, bron **en eigenaar**).  
> Property houdt de geconsolideerde waarheid **voor zover zichtbaar voor de huidige organisatie**.  
> Dossiers / exports / rapporten zijn views over die waarheid.

Aanvullend:

> Bouw geen BBMI-/WWS-/EPA-platform.  
> Bouw een vastgoed- en inspectieplatform waarin die slechts **configuraties** zijn.

### Data-eigenaarschap (juridisch vs. platform)

**Juridisch / commercieel:** de inmeter, inspecteur of opdrachtgevende organisatie (bijv. woningcorporatie) blijft eigenaar van bronbestanden en opnamedata — **niet** de softwareleverancier. Dat betekent o.a. export, meeneembaarheid en geen vendor lock-in op data.

**Platformtechnisch:** dat verandert de architectuur niet. Observations blijven bestaan. Wel geldt:

- Elke observation / inspectieresultaat / foto / rapportdata heeft een **eigenaar (org/company)**.
- Bij wissel van company/organisatie worden bestaande claims **niet automatisch** opgenomen in de zichtbare of geconsolideerde data van de nieuwe partij.
- Delen gebeurt alleen via expliciete `visibility` / shares — nooit stilzwijgend.

**Middenweg:**

| Laag | Gedrag |
|---|---|
| Property (fysiek: ruimtes, installaties, pandkenmerken) | Mag centraal bestaan en herkenbaar blijven over partijen |
| Inspection-resultaten, observations, foto’s, rapportdata | Hebben een eigenaar; niet automatisch beschikbaar voor andere orgs |

Zie ook [business-rules.md](./business-rules.md) en [ADR-003-multi-tenant.md](./decisions/ADR-003-multi-tenant.md).

---

## Scope-taal (herbruikbaar voor offerte)

### Wel beloven (fase 1–4)

- Generiek **vastgoed-inspectieplatform** (niet alleen woningen)
- **PWA** voor veldopnames op iOS/Android/desktop
- **API** als koppelvlak; klantdashboard kan data ophalen
- **Offline-first** vanaf fase 2
- Templates **BBMI** (fase 3) en **WWS** (fase 4)
- Foto’s als bewijs bij observations/subjects (met eigenaarschap)
- Datamodel voorbereid op meer templates, multi-tenant, eigenaarschap en delen
- Export / dossier-download zodat klant data kan meenemen

### Expliciet buiten scope (tenzij apart geoffreerd)

- Bouw, beheer of UI van het **bestaande klantdashboard**
- **Rapportgeneratie** (BBMI/WWS/EPA-rapporten e.d.) — hun dashboard/tools
- Templates: **EPA, NEN 2580, WO, BOG, brandveiligheid**, overige inspecties
- **iOS LiDAR / scan-app** (integratie later mogelijk op dezelfde API)
- **Partner-template vullen / CSV-export** naar klant- of partnersjablonen (apart traject; architectuur sluit er wel op aan via API/JSON)
- **Realworks API-integratie**; eventueel later import van Realworks-exports als meerwerk
- Native **App Store**-app als harde opleveringseis
- Volledige automatisering (“90%+”) van rapportage — wij leveren gestructureerde opnamedata

---

## Zie ook

- [architecture.md](./architecture.md) — principes, stack, fasen
- [data-model.md](./data-model.md) — domeinmodel
- [decisions/](./decisions/) — ADRs
