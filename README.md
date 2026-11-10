# Bygglogg

En webbapp för byggarbetsplatsen: **dagbok, tidsrapportering och skyddsrond** i ett minimalistiskt nordiskt gränssnitt. Gränssnittet använder vanilla ES-moduler och en Node/Express-server. Verksamhetsdata sparas på servern och synkas automatiskt till inloggade enheter.

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

## Serverlagring och synk

- Alla verksamhetsändringar sparas på servern i `data.json`; webbläsarens localStorage innehåller endast inloggning och personliga vyinställningar.
- Inloggade webbläsare hämtar serverändringar automatiskt var fjärde sekund. Inloggning fungerar samtidigt på flera enheter.
- Servern skriver filen atomiskt och köar samtidiga ändringar för att undvika att två enheter skriver över varandra.
- För Render ska en persistent disk monteras på `/var/data` med miljövariabeln `DATA_DIR=/var/data`. Render Free har ett tillfälligt filsystem och får inte användas för permanent JSON-lagring.
- När Render-disken är tom skapas administratörskontot från `BOOTSTRAP_ADMIN_EMAIL` och `BOOTSTRAP_ADMIN_PASSWORD`. Blueprinten ber om lösenordet privat; lösenordet läggs inte i GitHub.
- Starta lokalt med `npm start`. Ange `DATA_DIR` för att spara i en annan mapp.

## Begränsningar

- En persistent fil-disk är avsedd för en serverinstans. För att skala till flera instanser behövs en gemensam databas.
- PDF-generering på server, integrationer och e-post ingår inte.
- Tidsmotorn tolkar svenska uttryck.
- Skyddsrondens AFS-hänvisningar är vägledande och ersätter inte officiell dokumentation från Arbetsmiljöverket (av.se).
