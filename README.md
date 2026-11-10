# Bygglogg

En fristående webbapp för byggarbetsplatsen: **dagbok, tidsrapportering och skyddsrond** i ett minimalistiskt nordiskt gränssnitt. Byggd utan ramverk, byggsteg eller externa beroenden – vanilla ES-moduler, localStorage och en liten Node-server.

All data sparas lokalt i webbläsaren.

## Funktioner

### Byggdagbok
- Inlägg per dag och projekt: arbete, hinder, material, besök och anteckning.
- Väder, författare, tidsstämpel och kommentarer.
- Publicera dagen, lås/upplås och skriv ut.
- Datumnavigering med veckostrip.

### Tidsrapportering
- Naturlig tidsbeskrivning i fritext som fyller datum och minuter.
- Veckoöversikt per dag, projektfördelning, statusöversikt och veckomål.
- Status: utkast, inskickad, godkänd, avvisad.
- Lunchavdrag föreslås automatiskt när intervallet passerar lunch.

### Skyddsrond (arbetsskyddsrund)
- Rondmallar med grupperade kontrollpunkter baserade på Arbetsmiljöverkets föreskrifter (AFS).
- Svarsalternativ: Godkänd, Ej lämnad, Avvikelse.
- Avvikelse kräver observation, åtgärd, ansvarig och datum.
- Progress, sammanställning, signering med namn/tid och låsning efter signering.
- Foton kan läggas till varje avvikelse.

### Administration
- Projekt: skapa, redigera, status, period och beställare.
- Användare: namn, e-post, lösenord, roll, projektåtkomst och aktiv/inaktiv.
- Rondmallar: dynamisk punkteditor med grupper.
- Aktiviteter: debiterbara eller interna.
- Inställningar: företag, organisationsnummer, arbetsdag, lunchavdrag, rapporteringsgräns.
- Export av all data som JSON samt återställning till demodata.

## Naturlig tidsbeskrivning

Tidsmotorn (`src/parser.js`) förstår bland annat:

| Inmatning | Resultat |
| --- | --- |
| `igår 7:30-16:00` | igår, 07:30–16:00, 8 h 30 min |
| `2h 30m` / `1h30` | 150 min |
| `2,5 timmar` | 150 min |
| `en och en halv timme` | 90 min |
| `45 min` / `kvart` | 45 / 15 min |
| `måndag 6 timmar` | senaste måndag, 360 min |
| `förra fredagen 8-16` | fredagen veckan innan |
| `12/5 07-15` | 12 maj, 8 h |
| `2026-05-12 22-06` | nattpass, 8 h |
| `kl 07.00 till 16.30` | 9 h 30 min |

Datum som utelämnas antas vara idag.

## Roller

| Roll | Dagbok | Tid | Skyddsrond | Admin |
| --- | --- | --- | --- | --- |
| Administratör | skriva, publicera, låsa | alla, godkänna | alla, signera | allt |
| Arbetsledare | skriva, publicera, låsa | alla, godkänna | alla, signera | – |
| Hantverkare | skriva | egna | genomföra | – |
| Klient | läsa publicerat, kommentera | – | läsa | – |

## Struktur

```
index.html
assets/styles.css
src/main.js
src/store.js
src/parser.js
src/components.js
src/ui.js
src/icons.js
src/views/
test/parser.test.mjs
server.mjs
```

## Design

Minimalistisk nordisk palett: varm beige canvas, vita kort, slategrå navigation, stålblå etiketter och gul primäråtgärd. Inga skuggor – endast tunna linjer, 8 px radie och tät typografi. Responsiv ned till mobil, med utskriftsläge.

## Begränsningar

- Data sparas lokalt i webbläsaren (localStorage). Ingen server, ingen synk mellan enheter.
- PDF-generering på server, integrationer och e-post ingår inte.
- Tidsmotorn tolkar svenska uttryck.
- Skyddsrondens AFS-hänvisningar är vägledande och ersätter inte officiell dokumentation från Arbetsmiljöverket (av.se).