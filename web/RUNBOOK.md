# Driftrunbook

Vad man gör när något gått fel i butiken, i den ordning man gör det. Skriven
för den som står med problemet klockan sju på morgonen, inte för den som skrev
koden.

Systemet larmar numera själv: allt nedan som kan upptäckas automatiskt landar i
**/admin → Driftlarm** och mejlas till `OPS_ALERT_TO` (faller tillbaka på
`CONTACT_EMAIL_TO`). Samma händelse mejlas högst en gång i timmen, men varje
förekomst räknas i listan.

---

## 0. Var sanningen finns

| Fråga | Källa |
| --- | --- |
| Vad kunden betalade | Stripe. Alltid. |
| Vad vi trodde att kunden skulle betala | `orders.total_minor` innan webhooken skrev över den |
| Vad som såldes | `order_items` — fryser SKU, titel och styckpris |
| Varför lagret står som det gör | `inventory_movements`, per variant i produktkortet |
| Vad någon gjorde i /admin | `admin_activity`, i /admin → Aktivitet |
| Vad som hänt med en order | `order_events`, längst ned på orderkortet |
| Vilken prisregel som gällde | `orders.pricing_version` → `pricing_config_versions` |

Databasen är Neon. Point-in-time recovery finns på planen; se avsnitt 6.

---

## 1. "Kunden har betalat men ordern syns inte"

1. Sök upp betalningen i Stripe. Notera `payment_intent` och sessionens
   `linnevik_order_id` under Metadata.
2. Finns ordernumret i /admin → Ordrar? Då är kopplingen bruten men ordern
   till: gå till 1a. Finns det inte alls: 1b.

**1a. Ordern finns men står som `pending`.** Webhooken kom aldrig fram eller
föll. Kör avstämningen för hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://www.linnevik.se/api/cron/commerce-reconcile
```

Den läser om alla `pending`-ordrar från de tre senaste dygnen mot Stripe,
skriver dem som betalda, skickar orderbekräftelsen och släpper utgångna
reservationer. Svaret säger hur många som lagades. Går det inte igenom svarar
den 207 med en `failures`-lista.

**1b. Ingen order alls.** Larmet *Betalning utan order hos oss* ska ha gått ut.
Det betyder att pengar tagits emot för något vi inte kan koppla till en order —
sessionen saknar vår metadata. Det går inte att laga automatiskt. Skapa
återbetalningen i Stripe (den speglas nu automatiskt hit) eller lägg ordern för
hand, och notera vilket i orderns interna notering.

---

## 2. "Betald order som inte går att skicka" (`stock_exception`)

Ordern står röd i listan med etiketten **Lager saknas**, och larmet har gått ut.
Kunden har betalat för fler enheter än vi kunde binda.

1. Öppna varianten i produktkortet → **Lagerhistorik**. Där står varje
   reservation, plock och justering, med vem som gjorde den.
2. Finns varorna fysiskt? Rätta lagret i produktkortet — justeringen skrivs i
   historiken med ditt namn — och sätt sedan orderstatus till `paid` på
   orderkortet.
3. Finns de inte? Återbetala hela eller delar av ordern på orderkortet
   (momsdelen räknas ut och sparas automatiskt) och skicka ett mejl till kunden.

Reservationen släpps inte av sig själv för en betald order. Det är avsiktligt:
en betald order ska hålla sina enheter tills någon bestämt vad som ska hända.

---

## 3. Tvist eller återbetalning som börjat i Stripe

Båda speglas numera hit automatiskt och larmar.

**Tvist.** Ordern får status `disputed` och en händelse i sin historik med
`evidence_due_by`. Pengarna är redan innehållna av Stripe. Lämna underlag i
Stripes kontrollpanel före tidsfristen — det går inte att göra härifrån.
Vinner vi återgår ordern till `paid`, förlorar vi skrivs den som `refunded`.

**Återbetalning gjord i Stripe.** En rad skapas här med `actor = stripe`,
momsdelen uträknad, och ordersumman räknas om. Ingen åtgärd behövs — larmet är
till för att du ska veta att det hänt.

---

## 4. Mejl som inte gick fram

Larmet *E-post* pekar på ordern. På orderkortet finns **Kundutskick** med
"Skicka om orderbekräftelsen". Innehållet blir identiskt med det kunden skulle
ha fått.

Går det fortfarande inte igenom: kontrollera `SMTP_USER`/`SMTP_PASS` och att
`MAIL_FROM` ligger på linnevik.se. Domänens SPF är hard fail och DMARC står på
`p=quarantine` med strikt inpassning — post från någon annan avsändardomän
hamnar i skräpposten, även om SMTP svarar OK.

---

## 5. Lagret ser fel ut

1. Produktkortet → varianten → **Lagerhistorik**. Varje ändring står där med
   typ, antal, order och vem.
2. `Reserverad` utan matchande `Släppt` eller `Plockad` betyder en öppen order.
   Reservationer från övergivna kassor släpps automatiskt när någon går till
   kassan igen, och annars av dygnskörningen 03:00.
3. Rätta saldot i variantens formulär. Lagret kan inte sättas under vad
   pågående ordrar reserverat — då svarar formuläret hur många enheter som är
   bundna.

Larmet *Lågt lager* går ut en gång per dygn för säljbara varianter med
`LOW_STOCK_THRESHOLD` (5) eller färre kvar.

---

## 6. Databasen

**Kopia före ett riskabelt ingrepp.** Ta en Neon-branch från konsolen innan du
kör något som skriver brett. Den är gratis och tar sekunder.

**Återställning.** Neon → Branches → Restore, välj tidpunkt. Kontrollera efter
återställning:

```sql
select count(*) from orders where payment_status = 'paid';
select count(*) from inventory_reservations where status = 'active';
select name from _migrations order by name desc limit 3;
```

Ligger `_migrations` efter koden som är utrullad: kör `npm run migrate`.

**Migreringar** körs automatiskt vid deploy, en fil i taget, varje fil i en
transaktion med ett rådgivande lås. En fil som faller rullas tillbaka helt och
deployen misslyckas — inget blir halvlagt. En fil som måste köras utanför
transaktion (`CREATE INDEX CONCURRENTLY`) märks med
`-- migrate: no-transaction` på första raden och ansvarar då själv för att tåla
en omkörning.

---

## 7. Rulla tillbaka en deploy

Vercel → Deployments → den föregående → Promote to Production.

Tänk på att en migrering *inte* rullas tillbaka med koden. En deploy som lagt
till en kolumn är ofarlig att backa (den gamla koden bryr sig inte om den); en
som tagit bort eller döpt om något är det inte. Därför regeln: migreringar är
alltid additiva, och det som ska bort tas bort i en senare deploy när ingen kod
längre läser det.

---

## 8. Nödstopp

`OWNED_COMMERCE_ENABLED=false` i Vercels miljövariabler stänger korg och kassa
(503) utan att röra katalogen eller ordrarna. Sajten går fortfarande att läsa.
Använd om något systematiskt är fel med priser, moms eller lager — det är
bättre att inte sälja alls än att sälja fel.

Efter ändringen krävs en ny deploy för att variabeln ska slå igenom.

---

## 9. Vad som körs av sig självt

| När | Vad |
| --- | --- |
| 03:00 varje natt | Avstämning mot Stripe, släpper utgångna reservationer, lågt-lager-larm, städar ratbegränsningar |
| Måndagar 06:00 | Prisbevakningen |
| Vid varje kassa | Utgångna reservationer släpps innan lagret räknas |
| Vid varje deploy | Migreringar |

Cron-schemat står i `vercel.json`. Hobby-planen tillåter en körning per dygn;
byts planen räcker det att ändra schemat där.
