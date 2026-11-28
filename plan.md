# Granskning: är allt rätt ihopkopplat?

Varje fält, knapp och funktion på hemsidan och i admin ska granskas. För
varje del ska det gå att svara ja på frågan: gör den det som står på den, och
landar det den skickar där det ska?

Felet som startade det här: formuläret för ny faktura skickade raderna som
`payloadLines`, men servern läste `lines`. Varje offert föll därför på "Lägg
till minst en rad.", och ingen manuell faktura har gått att skapa sedan
formuläret byggdes. Alla tester var gröna, eftersom inget test gick från
formuläret hela vägen till servern. Den luckan är det planen ska stänga.

Facit för hur något *ska* fungera är `rules/source_of_truth.md`. Där koden och
specen säger olika saker är det ett fynd.


## 1. När är en del rätt ihopkopplad?

**Ett fält**

* Det skickas under det namn och i den typ som servern läser: kronor eller
  öre, sträng eller tal, tomt eller `null`.
* Servern använder det: sparar det, räknar med det eller skickar det vidare.
  Ett fält som skickas men aldrig läses är ett fynd.
* Det som sparas syns igen när sidan laddas om, på samma plats och i samma
  form.
* Kräver servern ett fält som formuläret inte har, är det också ett fynd.
* Felaktig inmatning ger ett begripligt fel vid fältet. Felet får aldrig
  landa på en annan rad eller i en annan del av sidan.

**En knapp**

* Den gör det som står på den, och bara det.
* Medan den arbetar är den låst, så att två klick inte gör samma sak två
  gånger.
* När något går fel får admin eller kunden se det, på svenska (engelska på
  /en). Fel som sväljs i tysthet räknas som fynd.
* När den är klar visar sidan det nya läget utan att man behöver ladda om.
* Är den låst ska skälet stå bredvid, och skälet ska vara det verkliga.

**En text**

* Den stämmer med hur systemet fungerar i dag. Ett exempel som inte gör det:
  "Fakturan skapas i Stripe". Efter A17 görs fakturorna som egna pdf:er.
* Den finns på både svenska och engelska där sidan finns på båda språken.

**En sida**

* Den nås från menyn eller från en länk. En sida som inte nås från någonting
  är antingen död och ska bort, eller saknar en länk.
* Den fungerar tom, med en rad och med många rader.


## 2. Felen vi letar efter

1. **Kontraktsglidning.** Klienten och servern använder olika namn, typer
   eller enheter för samma sak, som `payloadLines` mot `lines` eller kronor
   mot öre.
2. **Döda fält.** De skickas men läses aldrig, eller visas men sparas aldrig.
3. **Saknade fält.** Servern kräver något som formuläret aldrig skickar.
4. **Gamla texter.** De beskriver hur systemet fungerade förut, som Stripe-
   fakturor eller interna anteckningar som nu är kommentarer.
5. **Tysta fel.** En `catch` som inte visar någonting, eller ett svar som
   inte är ok men ändå behandlas som lyckat.
6. **Inaktuellt läge.** Sidan visar det gamla läget efter en ändring, till
   exempel för att en `router.refresh()` saknas.
7. **Döda sidor och routes.** API-routes utan anropare och sidor utan länk.
8. **Fel i låsta knappar.** Knappen är låst av fel skäl, eller skälet som
   visas är ett annat än det verkliga.
9. **Testläge och skarpt läge.** Någonting beter sig olika beroende på
   Stripe-nyckeln utan att admin ser det.


## 3. Förutsättningar

Allt det här ska vara klart innan granskningen börjar.

* **En egen databas för granskningen.** Förhandsversionerna delar i dag
  `DATABASE_URL` med produktionen. En push har redan migrerat produktionen
  av misstag, den 26/11. Preview och lokal utveckling ska få varsin Neon-
  gren innan någon klickar runt och skapar ordrar.
* **Stripes testnycklar** lokalt och i Preview, med en webhook mot
  Preview. Inga skarpa kort under granskningen.
* **Mejl som kommer fram men inte når kunder.** Antingen går de till en
  egen testadress eller så skrivs de bara till loggen. Fakturor, kvitton,
  inloggningslänkar och prov skickar mejl.
* **Testdata:** ett företag med webbkonto, ett inaktivt konto, en produkt
  med lagerstyrning, en utan lagerstyrning, en dunprodukt (bara prov, se
  `map_of_truth.md`), en rabattkod och en fraktregel.


## 4. Metod: tre lager

### Lager A: kontrakten, i koden

För alla 70 `fetch`-anrop till `/api` och de sex server actions:

1. Lista det klienten skickar: nycklar, typer och enheter.
2. Lista det routen läser och kräver.
3. Jämför. Varje skillnad är ett fynd.
4. Rätta genom att klient och route delar en typ och en parser. Mönstret
   är det från rättelsen av fakturan: `ManualInvoiceQuoteBody` och
   `parseManualInvoiceQuote` i `src/lib/manualInvoiceInput.ts`. Då kan
   namnen inte glida isär utan att `tsc` säger ifrån.

Svaren åt andra hållet granskas på samma sätt: det routen svarar mot det
klienten läser ur svaret.

### Lager B: varje sida, för hand

Varje sida i avsnitt 5 och 6 gås igenom i webbläsaren, mot granskningens
databas. Varje fält och varje knapp prövas med:

* rätt värde
* tomt värde
* fel värde: text i ett beloppsfält, negativa tal, 0, för långt
* dubbelklick
* omladdning efteråt: syns det sparade?

Varje del bockas av i listan nedan. Varje fynd skrivs i avsnitt 8.

### Lager C: flödestester som körs automatiskt

De viktigaste flödena får tester som går genom webbläsaren, från klick
till databas (Playwright, som läggs till). De körs före varje sjösättning, så
att ett fel som det i fakturaformuläret fångas innan det når produktionen:

1. Kortköp: varukorg → kassa → Stripe (test) → klar-sidan → ordern är
   betald i admin.
2. Fakturaköp: inloggad kund → fakturakassa → ordern och fakturan finns,
   och pdf:en går att hämta.
3. Manuell faktura i admin: välj kund, lägg till rader, se summan, skapa.
   Ordern och fakturan finns.
4. Registrera en bankbetalning: fakturan blir betald och syns i exporten.
5. Återbetalning och retur på en order.
6. Provbeställning: hemsidan → admin → behandlad.
7. Webbkonto: registrera, logga in med länk, ändra företagsuppgifter, logga
   ut. Ett inaktivt konto kommer inte in.
8. Admin ändrar en produkt, ett pris och lagret, och ändringen syns på
   hemsidan.


## 5. Hemsidan

Varje rad bockas av när lager A och B är gjorda.

### Navigering och ramen
- [ ] Sidhuvud och meny, på sv och en, i mobil och på dator
- [ ] Sök (`LiveSearch` → `/api/search`): förslag, enter, inga träffar
- [ ] Valuta och region (`CurrencySelector`, `RegionSelectorModal` →
      `/api/currencies`): val sparas, och priserna följer valet
- [ ] Besöksloggen (`VisitLogger` → `/api/analytics/visit`) får inte ge fel i
      konsolen
- [ ] Sidfot: alla länkar leder någonstans
- [ ] Cookie-banner och `/cookie-policy`

### Katalog
- [ ] Startsidan `/[locale]`
- [ ] `/collections` och `/collections/[handle]`: filter, sortering, tom
      kategori
- [ ] `/products/[handle]`: välja variant, pris (inkl./exkl. moms), lager,
      slutsåld, dunprodukt (bara prov), lägga i varukorgen, antal
- [ ] `/search`
- [ ] `/Econa` och pdf:en (`/api/pdf/econa`)
- [ ] `/about`, `/terms`, `/contact` (formuläret → `/api/contact`)

### Varukorg och kassa
- [ ] Varukorgen (`CartContext` → `/api/store/cart/...`): lägga till, ändra
      antal, ta bort, tömma, varukorgen finns kvar efter omladdning och
      efter inloggning
- [ ] Rabattkod: giltig, ogiltig, förbrukad, kräver inloggning
- [ ] Frakt och moms i varukorgen stämmer med kassan och Stripe
- [ ] Kortkassa (`CheckoutButton` → `/api/checkout`): lyckad, avbruten,
      utgången, prisändring under tiden (`CART_REPRICED`), inaktivt konto
      (`ACCOUNT_INACTIVE`)
- [ ] Fakturakassa (`InvoiceCheckoutButton` → `/api/invoice`): företags-
      uppgifter, referens, inköpsordernummer, beloppsgräns, inte inloggad
- [ ] `/checkout/klar`: betald, faktura, väntar (sidan laddas om), misslyckad,
      avbruten, okänd session
- [ ] `/thank-you`: används den fortfarande, eller är den död?

### Prov
- [ ] `/samples` (`/api/products`): välja produkter, gränser
- [ ] `/samples/checkout` (`/api/sample-request`): alla fält, org-nummer,
      adress, kvittens

### Konto
- [ ] `/login`: inloggningslänk (`/api/auth/magic-link`), fel e-post,
      inaktivt konto
- [ ] `/login/verify` (`/api/auth/magic-link/consume`): giltig, använd och
      utgången länk
- [ ] `/login/create-account` (`handleRegister`): alla fält, org-nummer,
      dubblett
- [ ] `/login/forgot` (`handleRecover`)
- [ ] `/account/activate/...` och `/account/reset/...`: lever de, eller är
      de rester från ett äldre inloggningssätt?
- [ ] `/account`: företagsuppgifter (`saveCompanyDetails`,
      `loadCompanyDetails`), ordrar, fakturor (`/api/account/invoices/[number]`),
      radera kontot (`deleteOwnAccount`), logga ut (`logout`)


## 6. Admin

### Ram
- [ ] Inloggning och utloggning (`/api/admin/session`)
- [ ] Menyn: varje punkt leder rätt och markeras rätt
- [ ] Sidor som inte nås från menyn: `/admin/customers`,
      `/admin/customers/[id]` och `/admin/customers/new`. Ska de finnas
      kvar bredvid Företag?

### Översikt
- [ ] `/admin`: varje lista och varje siffra stämmer, och varje rad leder
      till rätt order eller prov

### Försäljning
- [ ] `/admin/orders`: sök, filter, statusar, testordrar
- [ ] `/admin/orders/[id]`: varje knapp i `OrderActions` (pausa, återuppta,
      avboka, leverera `fulfillments`, återbetala `refunds`, returnera
      `returns`, skicka mejl igen `emails`)
- [ ] `/admin/orders/[id]`: `InvoicePaymentPanel` (registrera bankbetalning,
      skicka påminnelse), fakturans pdf (`/api/admin/invoices/[number]/pdf`),
      kommentarer (`Comments`)
- [ ] `/admin/orders/ny-faktura` (`ManualInvoiceForm`): välj kund, alla
      mottagarfält, rader, eget pris, frakt (regel, egen, ingen), villkor,
      meddelande, intern notering, skapa. Rättat: offerten. Kvar att
      granska: allt annat.
- [ ] `/admin/prover` och `/admin/prover/[id]` (`SampleRequestActions`,
      kommentarer)

### Katalog
- [ ] `/admin/products` (`ProductTable`): skapa, filter, Stripe-synk
      (`/api/admin/products/stripe`)
- [ ] `/admin/products/[handle]` (`ProductEditor`, 14 anrop): titel, text,
      status, bilder, varianter, alternativ, lager och lagerrörelser,
      duplicera, Stripe-synk per produkt
- [ ] `/admin/collections` (`CollectionTree`): skapa, flytta, döpa om, ta bort

### Priser
- [ ] `/admin/priser` (prisbilden, `VariantPricing`): förslag, tillämpa,
      ändra listpris (loggas med sidan)
- [ ] `/admin/franzen` (`FranzenPricing`): samma sak mot Franzéns priser
- [ ] `/admin/pricing` (Mängdrabatt, `PricingConfigPanel`): spara, versioner
- [ ] `/admin/commerce` (`CommerceSettings`): rabattkoder
      (`/api/admin/discounts`) och fraktregler (`/api/admin/shipping`)

### Kunder
- [ ] `/admin/clients` (`ClientTable`): sök, taggar, massändring (`batch`)
- [ ] `/admin/clients/new` och `/admin/clients/[id]` (`ClientForm`): alla
      fält, kontakter (`ContactList`), webbkonton (`CommerceCustomerPanel`),
      kommentarer

### System
- [ ] `/admin/analytics` (`VisitorAnalytics`)
- [ ] `/admin/export` (`ExportPanel`): sammanställning och nedladdning, och
      perioden stämmer med betalningsdagen
- [ ] `/admin/activity`
- [ ] `/admin/alerts` (`AlertList`): bekräfta ett larm

### Utan sida
- [ ] Stripe-webhooken, nattens avstämning (`/api/cron/commerce-reconcile`)
      och prisbevakningen (`/api/cron/price-watch`). De körs mot testläget och
      ska ge rätt resultat och rätt larm.


## 7. Det som redan ser misstänkt ut

Allt här ska bekräftas eller avfärdas först.

* **`InvoicePaymentPanel` talar om Stripe-fakturor.** Där står "Kunde inte
  läsa fakturan i Stripe" och "betalades på Stripes fakturasida". Efter A17
  finns inga Stripe-fakturor.
* **Kommentarer om Stripe i `manualInvoiceInput.ts`.** De beskriver
  idempotensnycklar för Stripe-fakturor, alltså samma rest efter A17.
* **"Intern notering" på manuell faktura.** Den sparas nu som en kommentar
  på ordern (A31). Etiketten bör säga det.
* **API-routes som ingen sida anropar:** `/api/admin/customers`,
  `/api/admin/customers/[id]`, `/api/admin/clients/[id]/customers` (POST),
  `/api/admin/orders` (listan), `/api/auth/callback` och `/api/cart`. Varje
  route är antingen död eller saknar en knapp.
* **Hur skapas ett nytt företag?** `ClientForm` anropar bara
  `/api/admin/clients/[id]`, inte POST till `/api/admin/clients`.
  Kontrollera vad som händer på `/admin/clients/new`.
* **Två prissidor med nästan samma namn:** `/admin/priser` (Priser) och
  `/admin/pricing` (Mängdrabatt).
* **Stripe-synk av produkter** (`/api/admin/products/stripe` och
  `/api/admin/products/[id]/stripe`). Behövs den fortfarande, när
  kassan bygger rader själv?
* **`/thank-you`, `/account/activate` och `/account/reset`.** Lever de
  bredvid `/checkout/klar` och inloggningslänken?


## 8. Fynd

En rad per fynd. Allvar:

1. **Stoppar affären:** någon kan inte köpa, fakturera eller få betalt.
2. **Fel data:** fel belopp, fel moms, något sparas inte eller sparas fel.
3. **Vilseleder:** fel text eller fel felmeddelande.
4. **Kosmetiskt.**

Prefix: **F** försäljning i admin, **K** katalog och priser, **C** företag och
webbkonton, **H** hemsidan. Lager A (kontrakten) är gjord för alla fyra.

| # | Var | Vad händer | Vad ska hända (§) | Allvar | Status |
|---|-----|------------|-------------------|--------|--------|
| F0 | `/admin/orders/ny-faktura` | Offerten skickar `payloadLines` och servern läser `lines`. Ingen faktura går att skapa. | §9 | 1 | Rättad och sjösatt (`e621be2`) |
| K1 | Produkt och kategori i admin | Det finns inget fält för den engelska adressen (`handle_en`). Nya och duplicerade produkter och kategorier ger 404 på /en. Engelska alternativnamn går inte heller att ange. | §1.7, §1.11 | 1 | Rättad (`7f9e1dd`) |
| K2 | Produktsidan i admin | Priset heter "inkl. moms", men det är listpriset exkl. moms. Den som skriver ett pris inkl. moms tar 25 % för mycket. Varningen för under självkostnad räknar fel. | §4.1 | 2 | Rättad (`361b709`) |
| K3 | Rabattkoder och frakt | Efter att raden sparats kraschar formuläret (`currentTarget` är null), sidan uppdateras inte och ett nytt klick skapar en dubblett. | §4.8 | 2 | Rättad (`06a4488`) |
| K4 | Mängdrabatt | Att spara en strategi nollställer de två andra strategiernas inställningar. | §4.7 | 2 | Rättad (`0b9703f`) |
| K5 | Ny variant | En SKU som bara skiljer sig i `-`, `.` eller `_` krockar på en Stripe-nyckel som inget använder, och admin får ett okänt fel. | §1.5 | 2 | Rättad (`e005fd5`) |
| K6 | Ändra variant | Faller lagerändringen sparas priset ändå, men loggas inte. | §4.15 | 2 | Rättad (`6ef8d6f`) |
| K7 | Ny produkt | En ny tom produkt blir aktiv direkt. | §1.11 | 2 | Rättad (`343f700`) |
| K8 | Rabattkoder och frakt | Felmeddelanden på engelska. Ett procentvärde med decimaler avvisas, och över 100 % godtas. | §15.4, §4.8 | 3 | Rättad (`06a4488`) |
| K9 | Produkter | "Kopplad till Stripe" visas som krav för publicering, fast kassan skapar Stripe-produkten själv. | §6 | 3 | Öppen |
| K10 | Radera produkt | Kundernas varukorgsrader försvinner i tysthet. | §1.10 | 3 | Öppen |
| K11 | Mängdrabatt, Rabattkoder | Texterna säger att kassan debiterar efter mängdrabatten och att koder bara gäller kortkassan. | §4.7, §4.11 | 3 | Öppen |
| K12 | Ny variant | Startlagret ger ingen rad i lagerhistoriken. | §2 | 3 | Öppen |
| K13 | Prisbild, Franzén | Tillämpa flera priser stannar vid första felet utan att sidan uppdateras. | §4.15 | 3 | Öppen |
| K14 | Ny produkt, Duplicera | Knappen blir klickbar igen innan sidbytet. Två klick kan ge två produkter. | | 3 | Öppen |
| K15 | Katalog | Fel som sväljs: alt-text, förslag, mängdrabatt vid nätverksfel. Kategoribyte loggas utan innehåll. | §15.2 | 3 | Öppen |
| K16 | API | Routes utan anropare: `suggestions/apply`, och GET på products, collections, pricing-config, discounts, shipping. | | 4 | Öppen |
| F1 | Bankbetalning | Att registrera en betalning tar bort pausen på ordern. Den hamnar i Att skicka. Samma sak när en pausad kortorder betalas. | §8.9 | 2 | Rättad (`0017392`) |
| F2 | Leverans, Retur | Formulären kan skickas två gånger. Två leveranser och två mejl, eller dubbel återföring av lager. | §8.9, §8.10 | 2 | Rättad (`c969251`) |
| F3 | Återbetalning | Faller kreditfakturan efter återbetalningen går den inte att göra om. Avboka ger ett allmänt fel. | §9, §8.11 | 2 | Misstänkt, ska prövas |
| F4 | Alla knappar i försäljning | Vid nätverksfel fastnar knappen ("Registrerar…", "Återbetalar…") utan meddelande. | | 3 | Delvis rättad: ordersidan, betalningsrutan, rabattkoder. Kvar: kommentarer, prov, larm, katalog |
| F5 | Betalningsrutan | Texter om Stripe-fakturor: "markeras som betald i Stripe", "Kunde inte läsa fakturan i Stripe", status på engelska. | A17 | 3 | Rättad (`cc7a371`) |
| F6 | Historik | En bankbetald order visar "Betald med kort". | §15.2 | 3 | Rättad (`cc7a371`) |
| F7 | Order | Interna noteringar på återbetalning och leverans, och skälet vid paus, visas ingenstans. | A31 | 3 | Öppen |
| F8 | Återbetalning | Beloppsfelet anges i öre fast fältet är i kronor. | | 3 | Rättad (`c969251`) |
| F9 | Faktura, leverans, betalning | Att mejlet inte skickades visas aldrig för admin. | §9, §8.9 | 3 | Öppen |
| F10 | Order | Fel skäl visas när en order inte går att skicka (t.ex. pausad). | §8.9 | 3 | Rättad (`c969251`) |
| F11 | Återbetalning | Ett nytt försök med annat belopp kan återanvända en förbrukad nyckel hos Stripe. | | 3 | Rättad (`c969251`) |
| F12 | Ny faktura | Vid nätverksfel kan ett nytt försök ge två fakturor. | §9 | 3 | Öppen |
| F13 | Order | Kreditfakturor har ingen länk i admin. | §9 | 3 | Öppen |
| F14 | Order | Återbetalningsformuläret visas på obetalda ordrar. | | 4 | Rättad (`c969251`) |
| F15 | Avboka | Texten säger "Fakturan makuleras" även för kortordrar. | | 4 | Rättad (`c969251`) |
| F16 | Ny faktura | Med bara bankkonto visas "Bankgiro bankkonto". Kassan avstängd stoppas först efter bekräftelsen. | | 4 | Öppen |
| F17 | Export | Ett tömt datum ger ett allmänt fel, och nedladdningslänkarna öppnar ett JSON-fel. | §16 | 4 | Öppen |
| F18 | Driftlarm, Ordrar | Larmtypen `order.credit_note_failed` höjs aldrig. Den tomma orderlistan nämner bara Stripe-checkout. | | 4 | Öppen |
| F19 | API | Routes utan anropare: GET på orders, orders/[id], sample-requests/[id]. | | 4 | Öppen |
| C1 | Företag | Formuläret saknar land. Att spara ett utländskt företag sätter landet till SE eller misslyckas varje gång. | §11.2 | 2 | Rättad (`40ce87c`) |
| C2 | Webbkonto | En e-post som redan finns ger ett rått SQL-fel och lägger till en kontaktperson ingen bett om. | §11 | 2 | Rättad (`08eb47e`) |
| C3 | Radera företag | Ett företag med obetalda fakturor går att radera. | §11.11, B6 | 2 | Rättad (`63799b9`) |
| C4 | Webbkonto | Kontot har ett eget fält för org.nr som fakturakassan faller tillbaka på. Två källor till org-numret. | §11.1, B5 | 3 | Beslut behövs |
| C5 | Webbkonto | Status och orderstatus på engelska. Felmeddelanden på engelska. | §15.4 | 3 | Rättad (`48ed7c1`) |
| C6 | Besökare | Ett klick på en annan period kan tappas, och sidan visar fel period i upp till 30 s. | | 3 | Öppen |
| C7 | Webbkonton | Bekräftelsen säger att företaget "står kvar bland tvätterikunderna". | §11.4 | 3 | Rättad (`48ed7c1`) |
| C8 | Webbkonto | Att spara kontot återskapar en raderad kontaktperson. | | 3 | Rättad (`08eb47e`) |
| C9 | Nytt företag | Texten säger att fakturamejl krävs för att fakturera. Det gör det inte. | | 4 | Rättad (`48ed7c1`) |
| C10 | Kontakter, Webbkonto | Fria anteckningar utan historik finns kvar. `scripts/seed-clients.mjs` skriver `clients.notes`. | A31 | 4 | Beslut behövs |
| C11 | Alla knappar i företag | Vid nätverksfel fastnar knappen. Utloggning fastnar på "Loggar ut…". | | 4 | Öppen |
| C12 | Kontakter | Att ta bort en kontakt döljer serverns felmeddelande. | | 4 | Rättad (`48ed7c1`) |
| C13 | Gamla sidor och routes | `/admin/customers*` är bara vidarekopplingar. `/api/admin/customers*` svarar 410. GET `/api/admin/clients` saknar anropare. | | 4 | Öppen |
| H1 | Varukorg → fakturakassa | Efter en avbruten kortkassa svarar "Skicka faktura" att kassan redan är påbörjad, tills Stripes session går ut. | §5.5, §7 | 1 | Rättad (`1584146`) |
| H2 | Produktsidan | "Lägg i varukorg" som misslyckas säger ingenting: lager, minsta antal, stängd butik. | §5, §6.7 | 2 | Rättad (`b3675e8`) |
| H3 | Provbeställning | En begäran kan skickas utan produkter om produktlistan inte laddas. Listan tar högst 100 produkter (17 aktiva i dag). | §14 | 2 | Rättad (`602ce2b`) |
| H4 | Kortkassan | Spärren för inaktiva konton före Stripe slår aldrig till, eftersom e-posten aldrig skickas. Ett inaktivt konto kan betala med kort. | §11.9, A16 | 2 | Rättad (`4425970`) |
| H5 | Varukorg → Mina sidor | Länken "logga in för att betala mot faktura" leder till /account, som för en utloggad visar ett tomt konto utan inloggning. | §12 | 2 | Rättad (`5aea6c0`) |
| H6 | Registrering, konto | Språket tas bara från kakan. Den som kommer direkt till /en får svenska fel och en svensk inloggningslänk. | §12 | 3 | Öppen |
| H7 | Kassorna | Felkoder utan översättning (CART_INVALID, lager, antal). Varukorgen uppdateras inte efter ett lagerfel. | §5, §15.4 | 3 | Rättad (`e902ee9`) |
| H8 | Kontakt, Prov | Felen är en hårdkodad engelsk `alert` och serverns svenska meddelande visas aldrig. | | 3 | Rättad (`602ce2b`) |
| H9 | Mina sidor | Ordrar listas per person, fakturor per företag. Manuella fakturor syns aldrig på Mina sidor. | §9.6 | 3 | Öppen |
| H10 | Inloggning | Ett inaktivt eller raderat konto med giltig kaka fastnar mellan /login och /account. | §11.9 | 3 | Rättad (`5aea6c0`) |
| H11 | Mina sidor | Spara kan alltid falla på låst org.nr om numret är sparat i annan form. | §11.2 | 3 | Avfärdad: alla org.nr har rätt form i produktionen |
| H12 | Produktsidan | Antalet rundas med produktens största minsta antal och steg, inte variantens. Servern kan då vägra. | §5 | 3 | Öppen (1 produkt berörs) |
| H13 | Texter | `/login/forgot` talar om lösenord. Provformuläret kräver telefon, org.nr och land, fast §14.1 inte gör det. | §12.1, §14.1 | 3 | Delvis rättad (`602ce2b`): provformuläret. Kvar: `/login/forgot` |
| H14 | Död kod | `/api/currencies`, `/api/cart`, `/api/auth/callback`, GET `/api/store/cart?id=`, oanvända komponenter. | | 4 | Öppen |
| H15 | Kosmetiskt | Hårdkodad svenska på /en, kassans adresser pekar på produktionen även lokalt, sökningen kan visa gamla förslag. Korgen lever 30 dagar, §5.1 säger 7. | §5.1 | 4 | Öppen |


## 9. Ordning

1. Förutsättningarna i avsnitt 3.
2. Lager A för hela kodbasen. Det är snabbt och hittar felen av samma sort
   som det i fakturaformuläret.
3. Lager B och C för pengaflödena: kassan, fakturan, betalning,
   återbetalning och export.
4. Det kunden ser: katalog, varukorg, prov och konto.
5. Det admin gör varje dag: ordrar, prov och manuell faktura.
6. Katalog och priser i admin.
7. System.

Rättelser committas per område, och varje rättelse får ett test som hade
fångat felet. Fynd av allvar 1 sjösätts direkt. Övriga sjösätts när ett
område är klart.


## 10. Klart när

* Varje rad i avsnitt 5 och 6 är avbockad.
* Varje anrop från en klient till en route går genom en delad typ och
  parser.
* Flödestesterna i lager C går igenom och körs före varje sjösättning.
* Varje fynd av allvar 1–3 är rättat. Fynd av allvar 4 är rättade eller
  medvetet lämnade.
* Inga texter talar om Stripe-fakturor eller annat som inte finns längre.
