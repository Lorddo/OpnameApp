# Domein-overzicht (conceptueel)

Living diagram bij [data-model.md](../data-model.md).  
**Laatst bijgewerkt:** 2026-08-10

Property is de kern. Rooms/Assets zijn subjects. Observations vullen attributes; templates (BBMI, WWS, …) zijn views/configuraties over diezelfde claims — geen aparte apps.

```mermaid
flowchart TD

    Property[Property]

    Property --> Floors[Floors]
    Floors --> Rooms[Rooms]
    Property --> Assets[Assets]

    Rooms --> Observations[Observations]
    Assets --> Observations
    Property --> Observations

    AttributeCatalog[Attribute Catalog]
    AttributeCatalog --> Observations

    Observations --> BBMI[BBMI]
    Observations --> WWS[WWS]
    Observations --> EPA[EPA]
    Observations --> Brandveiligheid[Brandveiligheid]
    Observations --> Verkoopopname[Verkoopopname]

    Observations --> Photos[Photos]
```
