# Allmänt

1. Linnevik (Linneviken AB) säljer textilier till hotell: täcken, kuddar,
   lakan, handdukar och morgonrockar. Köparen är alltid ett företag.

2. Vi säljer två sorters produkter:

   * **Egna produkter**, som vi låter tillverka och har i lager. De billigare
     säljs direkt i webbshoppen med snabb leverans. De exklusiva
     dunalternativen, gås och dun, går inte att köpa på nätet. Där går de
     bara att beställa som prov, och de säljs via offert (§2).
   * **Franzén-produkter**, som vi köper från Franzén Textil i Kinna och säljer
     under eget namn (§4.13).

   Produkter från andra leverantörer, i större volymer, beskrivs här när de
   finns. `map_of_truth.md` i roten är ägarens egen sammanfattning och står
   över detta dokument om de säger emot varandra.

3. Ord som används i dessa regler. Varje ord betyder en sak, och samma sak
   överallt, både här och i admin.

   * **Admin** — en person hos Linnevik som är inloggad i /admin (§15).
   * **Företag** — en juridisk person i vårt register, med eller utan
     org-nummer. Alla företag ligger i ett och samma register. I databasen
     `clients`.
   * **Kund** — ett företag som köper av oss. Det är inget eget slag av
     företag och inget eget register.
   * **Tvätterikund** — en tagg på ett företag som är kund hos tvätteriet.
     Taggen säger varifrån företaget kommer, aldrig om vi har sålt något
     till det (§11.4).
   * **Webbkonto** — en person som loggar in i webbshoppen. Hör alltid till
     exakt ett företag. I databasen `customers`, vilket är olyckligt men
     står kvar.
   * **Kontaktperson** — en person på ett företag som vi har i registret för
     att ringa eller mejla. Kan inte logga in. I databasen `client_contacts`.
   * **Variant** — det man faktiskt köper: en sak med eget artikelnummer
     (SKU), eget pris och eget lager. "Kudde Eric 60 x 80" är en variant av
     produkten Kudde Eric.
   * **Lagerförd** — en variant vars lager vi räknar (§3.1). Motsatsen är
     *utan lagerföring*: då räknas inget lager, och det finns ingen gräns
     för hur många som kan säljas (§3.2).
   * **Order** — ett köp, betalt eller inte, med kort eller faktura.
   * **Provbeställning** — en begäran om gratis prov (§14). Inte
     "provförfrågan" och inte "sample request".

   Två ord används inte, eftersom de går att läsa på två sätt: *klient* och
   *kund* i betydelsen webbkonto. Den som loggar in är ett webbkonto. Kunden
   är företaget.

4. Alla belopp är i svenska kronor och exklusive moms, om inget annat sägs
   (exempelvis vid fakturering och utcheckning). I databasen sparas de i
   öre.


# 1. Produkter och varianter

## 1a. Produkten

1.1 En produkt har namn, beskrivning, bilder, kategorier, taggar, leverantör
    och en eller flera varianter. Allt som kunden läser finns på svenska och
    engelska.

1.2 **Leverantör** är den vi köper av, till exempel "Linnevik" eller
    "Franzén Textil i Kinna". Kunden ser den aldrig. Kunden ser **märket**,
    och det är alltid Linnevik.

1.3 En variant har artikelnummer (unikt i hela katalogen), pris (§4),
    lager (§3), minsta antal och steg (§5.3), och sina alternativ (§1b).
    Inköpspris och inköpsbatch finns också, men visas bara i admin.

## 1b. Alternativ (storlek, färg, fyllning)

1.4 Varje variant beskriver sig med par av namn och värde, till exempel
    *Storlek: 60 x 80*. Produktsidan visar ett **val** per namn, till exempel
    valet Storlek, och en knapp per värde.

1.5 Två varianter med samma namn hör till samma val. Namnet jämförs efter
    att mellanslag i början och slutet har tagits bort, och ett namn med
    sådana mellanslag går inte att spara.

1.6 Alla varianter i en produkt har samma namn på sina alternativ. Har en
    variant Storlek och Färg har alla varianter Storlek och Färg. En variant
    som saknar ett av dem går inte att spara.

1.7 Varje alternativ har en engelsk översättning med samma struktur:
    Storlek blir Size. Den engelska texten ändras i samma formulär som den
    svenska, så att de aldrig glider isär.

1.8 Produktsidan visar artikelnumret för den variant som är vald, inte för
    den första.

## 1c. Synlighet och adresser

1.9 En produkt är **utkast**, **aktiv** eller **arkiverad**. Bara en aktiv
    produkt syns i butiken och går att köpa. Det är en enda inställning.
    Kolumnen `active` är en kopia av den och får aldrig säga något annat.

1.10 En produkt som någon gång har sålts raderas aldrig. Den arkiveras. En
     variant som finns på en order eller i en varukorg går inte att radera.

1.11 En produkt har en webbadress på svenska och en på engelska. Båda
     behövs innan produkten kan bli aktiv. Byts en adress pekar den gamla
     vidare till den nya, på båda språken.

1.12 Kategorierna är ett träd. Varje produkt har en huvudkategori, och
     brödsmulorna följer den på båda språken. En kategorisida visar också
     produkterna i underkategorierna.

1.13 Det admin ändrar på en produkt syns i butiken direkt. Det gäller även
     bildernas ordning och alt-texter.


# 2. Hur en produkt säljs

2.1 Varje produkt säljs på ett av två sätt. Det bestäms av en tagg:

    * **Webbshop** (ingen tagg). Kunden lägger varan i varukorgen och betalar
      med kort (§6) eller faktura (§7).
    * **Beställningsvara** (`MTO` eller `SAMPLE_ONLY`, som betyder samma
      sak). Går aldrig att lägga i varukorgen. Produktsidan visar en
      prisuppskattning efter antal, med minst 50 stycken (§4.7), och kunden
      kan beställa prov (§14). Försäljningen sker för hand: offert och
      manuell faktura (§10).

2.2 Dunprodukterna är tillsvidare beställningsvaror: Täcke Sebastian, Täcke
    Jakob, Kudde Sigrid och Kudde Alva. Det är så med flit och inget fel.
    Att de inte finns i lager och inte går att köpa i webbshoppen är rätt.

2.3 Spärren gäller i servern, inte bara knappen. Ett direkt anrop kan inte
    lägga en beställningsvara i en varukorg.

2.4 Taggarna skrivs exakt så, med versaler. Andra taggar styr ingenting.
    De används bara i sökningen.


# 3. Lager

3.1 Varje variant har ett **fysiskt** lager och ett **reserverat**.
    Säljbart lager är fysiskt minus reserverat.

3.2 En variant kan vara utan lagerföring. Då finns ingen gräns för hur många
    som kan säljas. Franzén-varianterna är utan lagerföring, eftersom vi
    beställer hem dem från Franzén efter order.

3.3 När kunden går till kassan reserveras hela ordern: allt eller inget.

    * Med kort gäller reservationen i 45 minuter, lika länge som betalsidan
      hos Stripe.
    * Med faktura gäller den tills fakturan är betald eller ordern avbokad.
      Den släpps aldrig automatiskt. Därför får bara ett känt företag köpa
      på faktura (§7.1), och högst fem gånger per dygn (§7.7). Se B11.

3.4 När ordern är betald ligger reservationen kvar tills varorna skickas.
    Då minskar det fysiska lagret.

3.5 Reservationen släpps när kassan avbryts eller går ut, när betalningen
    misslyckas, när ordern avbokas, när fakturan makuleras och när en order
    som inte har skickats återbetalas helt.

3.6 När admin registrerar en retur läggs varorna tillbaka i lager, om admin
    inte väljer bort det.

3.7 Admin kan ändra lagret för hand. Varje ändring loggas, och lagret kan
    aldrig sättas lägre än det som är reserverat.

3.8 En lagerförd variant utan säljbart lager visas som slutsåld på
    produktsidan. Kunden ska inte kunna trycka på en köpknapp som servern
    sedan säger nej till.

3.9 Admin får ett driftlarm när säljbart lager är 5 eller lägre.


# 4. Priser

## 4a. Listpris och moms

4.1 Varje variant har ett listpris i kronor exklusive moms. 

4.2 Momsen är 25 % och visas för sig. Vi säljer och levererar bara inom
    Sverige, så omvänd skattskyldighet förekommer inte.

4.3 Priset bestäms alltid av servern, aldrig av kundens webbläsare.
    Webbläsaren skickar bara vilken variant och hur många. Annars kunde en
    kund ändra sitt eget pris. Varukorgen räknas om varje gång den visas,
    med samma regler som kassan, så att kunden aldrig ser ett pris och
    betalar ett annat.

4.4 Det finns inga kundpriser i webbshoppen. Ett avtalspris ges med manuell
    faktura och eget styckpris (§10.3).

4.5 **Kompispris** är det förhandlade pris Franzén tar av oss. Det är ett
    inköpspris, aldrig ett pris till kund.

## 4b. Mängdrabatt

4.6 Admin väljer ett av tre sätt att räkna mängdrabatten: trappa efter
    antal, linjär efter antal eller trappa efter ordervärde. Varje sparad inställning blir en ny version,
    och ordern minns vilken version den räknades med.

4.7 Eftersom beställningsvaror aldrig hamnar i varukorgen märks
    mängdrabatten på två ställen: som prisuppskattning på produktsidan, och
    på den manuella fakturan (§10). Webbshoppens kassa ger ingen
    mängdrabatt.

## 4c. Rabattkoder

4.8 En rabattkod ger procent, ett fast belopp eller fri frakt. Den kan ha
    ett lägsta ordervärde, giltighetsdatum, ett totalt antal användningar och
    ett antal per kund. Stora och små bokstäver spelar ingen roll.

4.9 Rabatten räknas på varorna, aldrig på frakten. Det som Stripe drar ska
    vara exakt det belopp som ordern visade.

4.10 En kod med gräns per kund kräver att köparen är inloggad, så att vi vet
     vem det är.

4.11 Koder fungerar i kassan, med kort och med faktura. På manuella fakturor
     används de inte.

## 4d. Frakt

4.12 Frakten räknas med fraktregler. Den första aktiva regeln som passar
     land och ordervärde gäller, i prioritetsordning. Över regelns gräns är
     frakten gratis, och med en kod för fri frakt likaså. Om ingen regel
     passar går det inte att betala i kassan. På en manuell faktura sätter
     admin då frakten själv.

## 4e. Franzén

4.13 Franzén-produkter säljs under märket Linnevik. Inköpspriset är det
     förhandlade priset om admin har fyllt i ett. Annars är det priset i
     Franzéns prisfil.

4.14 Utpriset sattes en gång till 2,4 gånger inköpspriset, avrundat till
     närmaste 5 kr, med 50 kr extra för brodyr. Därefter är det ett vanligt
     listpris som admin kan ändra. Marginalen som visas i admin räknas utan
     inkommande frakt och är alltså något för hög.

## 4f. Var ett pris ändras

4.15 Listpriset sitter på varianten. Det kan ändras på produkten i admin
     eller tillämpas från prisanalysen (§15.3). Båda skriver till samma
     fält, och varje ändring loggas med vem, när, gammalt och nytt pris och
     vilken sida den gjordes från.


# 5. Varukorgen

5.1 Vem som helst kan ha en varukorg, inloggad eller inte. Den sparas i
    webbläsaren och gäller i 7 dagar från senaste ändringen. Den kopplas
    inte till ett webbkonto, och att logga in slår inte ihop två korgar.

5.2 Varukorgen visar alltid aktuella priser (§4.3). En rad som inte längre
    går att köpa visas med en förklaring direkt, inte först i kassan.

5.3 För varje rad gäller:

    * antalet är ett heltal från 1 till 10 000
    * minst variantens minsta antal
    * i steg från det minsta antalet. Med minst 10 och steg 5 går 10, 15
      och 20.
    * högst det säljbara lagret, om varianten är lagerförd

5.4 Produktsidan och varukorgen föreslår bara antal som servern godtar.

5.5 När kunden går till kassan fryses varukorgen. Avbryter kunden hos Stripe
    och går tillbaka kommer hen till samma varukorg, med samma varor, och
    kan ändra eller försöka igen.

5.6 Varukorgen ska tåla allt kunden gör:

    * Byter kunden språk är det samma varukorg, med samma rader.
    * Ingen rad visas med tomma fält. Namn, variant, antal och pris finns
      alltid, på båda språken.
    * Ett tomt eller ogiltigt antal ändrar ingenting och visas som ett fel
      på raden.
    * Varje knapp gör en sak, en gång, även vid dubbelklick och långsamt
      nät.

    Vart och ett av fallen har ett test (§17.3).


# 6. Kassan med kort

6.1 Det behövs inget konto för att betala med kort. Stripe frågar efter
    faktureringsadress, leveransadress inom Sverige och org- eller
    momsnummer.

6.2 När kunden trycker på betala skapas en order som väntar på betalning.
    Den fryser rader, styckpriser, rabatt, frakt och moms. Det finns högst en
    order per version av varukorgen, så två tryck ger inte två ordrar.

6.3 Betalsidan hos Stripe gäller i 45 minuter. Trycker kunden igen inom den
    tiden får hen samma betalsida. Har kunden inte betalat efter 45 minuter
    går ordern ut och lagret släpps (§3.5).

6.4 Ordern är betald när Stripe säger det, aldrig tidigare. Sidan kunden
    kommer till efteråt visar orderns riktiga läge och uppdaterar sig tills
    betalningen har kommit in.

6.5 Vilka betalsätt som visas bestäms i Stripe, inte i koden.

6.6 Efter betalningen får köparen ett webbkonto på sin e-postadress om hen
    inte redan har ett (se B3).

6.7 Inställningen `OWNED_COMMERCE_ENABLED` stänger kassan och varukorgen. Då
    svarar de att handeln är stängd. Ordrar som redan finns hanteras som
    vanligt.


# 7. Kassan med faktura

7.1 Faktura kan bara väljas av ett inloggat, aktivt webbkonto vars företag
    har org-nummer, firmanamn och fullständig svensk adress.

7.2 Fakturan ställs till företaget. Personen står som "Er referens".
    Firmanamnet får inte vara personens eget namn, utom för enskild firma.
    Annars hamnar fakturan hos en anställd i stället för hos ekonomiavdelningen.

7.3 Webbkontots namn är personens namn. Det skrivs aldrig över med
    firmanamnet, varken vid köp, vid betalning eller av en manuell faktura.
    Den som har köpt på faktura en gång kan göra det igen.

7.4 E-post och org-nummer tas från kontot. Köparen kan ändra firmanamn,
    adress, referens och inköpsordernummer i kassan.

7.5 Leveransadressen är förifylld med fakturaadressen. Kunden ska tydligt
    kunna ändra den till en annan leveransadress.

7.6 Fakturan förfaller efter 30 dagar. Varorna är reserverade under tiden
    (§3.3).

7.7 Ett webbkonto kan lägga högst fem fakturaköp per dygn.

7.8 Utan ett giltigt bankgiro i inställningarna går det inte att fakturera
    alls. Admin får då ett driftlarm.


# 8. Ordern

## 8a. Innehåll

8.1 Ordernumret är orderns id och skrivs #12.

8.2 Ordern är en ögonblicksbild. Produktnamn, variant, antal, styckpris,
    rabatt, frakt och moms kopieras in när ordern skapas. Ändrar admin
    produkten efteråt påverkas inte ordern.

8.3 Varje händelse på ordern loggas i dess historik, med vem och när.

## 8b. Tre lägen

8.4 En order har tre lägen som hålls isär:

    * **Betalning**: väntar → betald → delvis återbetald → återbetald.
      Från väntar kan den också bli misslyckad eller utgången.
    * **Leverans**: ej skickad → delvis skickad → skickad.
    * **Orderstatus**: där ordern befinner sig i sitt förlopp.

8.5 Orderstatusen följer betalningen av sig själv. Admin sätter den bara
    på tre sätt: **pausa** och **återuppta**, **avboka** (§8.8) och
    **avsluta**. 

8.6 Varorna reserveras redan när kunden går till kassan (§3.3), så en betald
    order har normalt sitt lager. Det finns ett undantag: betalningen kommer
    in efter att reservationen har gått ut, och någon annan har hunnit köpa
    varorna. Det kallas **lagerundantag**. Ordern är då betald men saknar
    varor, och admin får ett driftlarm. Admin fyller på lagret och
    reserverar på nytt med en knapp på ordern, eller avbokar med
    återbetalning (§8.8).

8.7 En betalning som kommer in precis när reservationen går ut räknas som
    vanligt om varorna fortfarande finns. Den blir lagerundantag bara om
    lagret faktiskt inte räcker.

## 8c. Avboka, skicka, returnera, återbetala

8.8 Bara admin kan avboka en order.

    * En obetald order avbokas direkt. Fakturan makuleras och lagret släpps.
    * En betald order avbokas tillsammans med en återbetalning, i samma
      steg. Ingen betald order blir avbokad med pengarna kvar hos oss.

    Andra mellanlägen avgör admin för hand, med en kommentar på ordern
    (§15.6). 

8.9 En order skickas bara om den är betald och inte pausad, avbokad eller
    under tvist. Admin anger transportör och spårningsnummer, och kunden får
    ett mejl. Ordern kan skickas i flera omgångar.

8.10 En retur kan högst vara det som har skickats minus det som redan har
     returnerats.

8.11 Återbetalningar:

     * Det som betalades med kort återbetalas genom Stripe.
     * Det som betalades till bankgirot betalas tillbaka från banken, och
       admin registrerar återbetalningen på ordern. Vi skapar då
       automatiskt en kreditfaktura (§9.8). En kreditfaktura är ett eget
       dokument som tar tillbaka hela eller en del av en faktura.
       Bokföringen kräver den, eftersom en utställd faktura inte får
       ändras.
     * Det går aldrig att återbetala mer än det som betalades, minus det som
       redan har återbetalats. Momsen räknas i samma proportion.

8.12 En **tvist** är när kunden bestrider en kortbetalning hos sin bank. Den
     syns på ordern och ger ett driftlarm. Systemet ändrar inget mer av sig
     självt. Admin avgör vad som händer med ordern och skriver en kommentar
     (§15.6).

8.13 Kommer en betalning in på en avbokad order väcks ordern inte till liv.
     Admin får ett driftlarm.


# 9. Faktura och betalning

9.1 Vi gör fakturorna själva, som pdf. Stripe har ingenting med fakturor
    att göra: Stripe används bara för kortbetalning (§6).

9.2 Fakturan visar:

    * fakturanummer och fakturadatum
    * vårt namn, adress, org-nummer, momsregistreringsnummer och F-skatt
    * köparens namn, adress, org-nummer och momsregistreringsnummer
    * ordernummer och Er referens
    * varje rad med antal, styckpris och belopp, samt frakt
    * belopp exklusive moms, momsen (25 %) och att betala
    * OCR-nummer, bankgiro och förfallodag
    * villkoren

    Villkorstexten följer fakturans verkliga förfallotid. En faktura på 10
    dagar säger inte "30 dagar netto".

9.3 OCR-numret är ordernumret, följt av en längdsiffra och en
    kontrollsiffra (Luhn). Order 12 får OCR 1248. Ordernumret är alltså allt
    utom de två sista siffrorna.

9.4 Kunden betalar till bankgiro 5673-8776 med OCR-numret. Det är det enda
    sättet att betala en faktura.

9.5 Fakturanumren är en obruten serie som vi håller själva. Ett nummer
    används en gång och försvinner aldrig, inte heller om fakturan
    makuleras. Kreditfakturor får nummer i samma serie.

9.6 Fakturan skapas en gång och ändras aldrig. Pdf:en sparas i databasen,
    mejlas till kunden (§13.1) och kan laddas ned på ordern i admin och av
    kunden under Mina sidor. Ska något ändras makuleras fakturan eller
    krediteras den (§9.8), och en ny görs.

9.7 En förfallen faktura makuleras aldrig av sig själv. Det är så med flit:
    order #12 makulerades en gång medan kunden höll på att betala den via
    banken. I stället:

    * dag 1 efter förfallodagen: driftlarm
    * dag 7: ett påminnelsemejl till kunden
    * dag 14 och dag 45: nya driftlarm

    Påminnelsen går till samma adress som fakturan gick till.

9.8 En **kreditfaktura** skapas automatiskt när admin registrerar en
    återbetalning av en fakturaorder eller avbokar en betald fakturaorder.
    Den har eget nummer (§9.5), hänvisar till fakturan den krediterar och
    visar beloppet och momsen med minustecken. Den mejlas till kunden och
    sparas som fakturan.

9.9 Admin **registrerar en bankbetalning** när pengarna har kommit in på
    bankgirot. Det görs på ordern, med datum och belopp.

    * Datumet ligger mellan orderdagen och i dag.
    * Avviker beloppet med högst 1 kr räknas fakturan som betald.
    * Fattas det mer än 1 kr godtas betalningen inte. Delbetalning finns
      inte (se B7).
    * För mycket betalt godtas, och admin får ett driftlarm.
    * Är fakturan redan registrerad som betald godtas den inte. Admin får
      ett larm om möjlig dubbelbetalning.

    Därefter är ordern betald och kunden får sin orderbekräftelse.


# 10. Manuell faktura

10.1 Admin skapar en faktura för hand under **Ny faktura**. Så säljs
     beställningsvaror, och så ges avtalspriser.

10.2 Mottagaren är ett företag ur registret. Att det har taggen Tvätterikund
     spelar ingen roll (§11.4).

10.3 Raderna är varianter ur katalogen: 1–50 rader, 1–100 000 stycken per
     rad. Admin kan sätta ett eget styckpris på varje rad. Det är så ett
     avtalspris ges. Lämnas det tomt gäller listpriset, med mängdrabatt för
     beställningsvaror (§4.7). Formuläret visar hela tiden vilket pris som
     gäller på varje rad, och det är samma pris som servern sedan
     fakturerar.

10.4 Här får beställningsvaror förekomma, och reglerna om minsta antal och
     steg gäller inte. Det är admin som bestämmer.

10.5 Frakten sätts enligt en fraktregel, utan frakt eller för hand.

10.6 Förfallotiden är 1–120 dagar. Admin kan skriva ett meddelande som står
     på fakturan och en intern anteckning som bara syns i admin.

10.7 Lagret reserveras som för ett fakturaköp (§3.3).

10.8 Mottagarens e-post är en adress för fakturan, inte en inloggning. En
     manuell faktura skapar aldrig något webbkonto och flyttar aldrig ett
     befintligt till ett annat företag (se B4).


# 11. Företag, kunder och webbkonton

## 11a. Företaget

11.1 Ett företag har namn, org-nummer, fakturamejl, adress, kundnummer och
     taggar. Det kan också ha säljuppgifter: status, segment, prioritet och
     kontaktpersoner.

11.2 Org-numret sparas på ett enda sätt, som momsnummer: `SE556481331801`.
     Det spelar ingen roll hur det skrivs in: 556481-3318, 5564813318 och
     SE556481331801 är samma nummer. Det gäller överallt där ett org-nummer
     tas emot eller söks: registrering, kassa, admin och Stripe. Svenska
     nummer kontrolleras med kontrollsiffran. På fakturan står det både som
     org-nummer (556481-3318) och som momsnummer.

11.3 Ett org-nummer hör till högst ett företag. Två företag med samma
     org-nummer är ett fel och får inte kunna uppstå.

11.4 Det finns ett enda företagsregister. **Tvätterikund** är en tagg på
     företaget och styr ingenting. Ett taggat företag kan faktureras, ha
     webbkonton och köpa som alla andra. Admin kan filtrera registret på
     taggen.

11.5 Säljstatusen beskriver bara var säljarbetet med ett företag står. Den
     säger aldrig om företaget är kund.

## 11b. Webbkontot

11.6 Ett webbkonto har e-post, förnamn, efternamn och telefon. Telefonen är
     frivillig. E-postadressen är inloggningen och är unik i hela systemet.
     Ett företag kan ha flera webbkonton.

11.7 Vem som helst kan registrera sig. Det kräver e-post, namn, org-nummer,
     firmanamn och adress. Finns org-numret redan kopplas kontot till det
     företaget. Annars skapas ett nytt företag.

11.8 Registrerar sig någon med en e-post som redan finns ändras ingenting.
     Personen får en inloggningslänk, och sidan svarar likadant i båda
     fallen.

11.9 Ett webbkonto kan vara inaktivt. Det kan då inte logga in och inte
     köpa.

11.10 Ett webbkonto kan ändra företagets firmanamn och adress. Org-numret
      ändras bara av admin (se B5).

11.11 Raderar personen sitt webbkonto försvinner bara det. Företaget och dess
      ordrar ligger kvar. Admin kan radera ett webbkonto eller ett helt
      företag, med webbkonton och kontaktpersoner. Ett företag med obetalda
      fakturor går inte att radera (se B6). Ordrar raderas aldrig.

11.12 Webbkonton hanteras på företagets sida i admin.


# 12. Inloggning

12.1 Det finns inga lösenord för webbkonton. Kunden skriver sin e-post och
     får en länk. Länken gäller i 15 minuter och kan användas en gång. Den
     öppnar en sida med en knapp, så att e-postens säkerhetsskanner inte
     kan logga in i kundens ställe.

12.2 En inloggning gäller i 30 dagar.

12.3 Sidan svarar likadant oavsett om e-postadressen finns, så att den inte
     går att använda för att ta reda på vem som har konto.

12.4 Högst fem länkar per e-postadress och 20 per IP-adress under en kvart.


# 13. Mejl

13.1 Kunden får:

     | Mejl | När | Till |
     |---|---|---|
     | Orderbekräftelse | första gången ordern blir betald | orderns e-post |
     | Faktura | när fakturan skapas | fakturamejlet, annars kontots e-post |
     | Påminnelse | dag 7 efter förfallodagen | samma som fakturan |

13.2 Kunden får inget mejl när en order återbetalas eller avbokas (se B8).

13.3 Admin får driftlarm (§17.4), inget mejl om nya ordrar (se B8).
     Provbeställningar mejlas till oss.

13.4 Ett mejl som inte går fram stoppar aldrig ordern. Det loggas på ordern
     och admin får ett driftlarm.


# 14. Prover

14.1 Vem som helst kan beställa prov, utan konto. Det kräver namn, e-post,
     företag och adress. Prover är gratis.

14.2 Provbeställningen sparas först. Sedan mejlas den till oss. Går mejlet
     inte fram syns det som "ej aviserad" i admin.

14.3 En provbeställning är **ny**, **påbörjad**, **skickad** eller
     **avböjd**.

14.4 Alla aktiva produkter går att beställa prov på.

14.5 Högst fem provbeställningar per IP-adress och timme. En provbeställning
     skapar aldrig något webbkonto.


# 15. Admin

15.1 Admin är Gabriel, Johan och Ahron. I dag delar de ett lösenord och
     väljer sitt namn vid inloggningen (se B1). En inloggning gäller i 12
     timmar.

15.2 Allt admin ändrar loggas med vem, när och vad. Ändringar på en order
     syns i orderns historik och i Aktivitet.

15.3 Varje sak har ett hem i admin, och bara ett:

     * **Översikt** (startsidan) visar det som väntar på någon: ordrar att
       skicka, lagerundantag, förfallna fakturor, nya provbeställningar och
       öppna driftlarm.
     * **Ordrar**: alla ordrar, kort och faktura. **Ny faktura** finns här.
     * **Provbeställningar**.
     * **Produkter**: produkt, varianter, pris, lager och bilder.
     * **Kategorier**.
     * **Priser**: kostnadsunderlag, konkurrenter och Franzén, och
       mängdrabatt. Härifrån kan ett föreslaget pris tillämpas (§4.15).
     * **Rabattkoder och frakt**.
     * **Företag**, med webbkonton och kontaktpersoner. Tvätterikunderna är
       ett filter här, inte en egen lista.
     * **System**: Besökare, Export, Aktivitet och Driftlarm.

15.4 Allt i admin är på svenska, även statusar och felmeddelanden. Ingen
     "paid", "unfulfilled" eller "fulfillment".

15.5 Admin kan se allt som ett webbkonto ser.

15.6 Admin kan skriva kommentarer på en order, ett företag och en
     provbeställning. Varje kommentar sparas med vem som skrev den och när,
     och kan inte ändras eller raderas. Så hanteras ovanliga fall: admin
     avgör, och skriver varför (§8.8, §8.12).


# 16. Bokföring och export

16.1 Exporten är CSV med semikolon och decimalkomma, så att den öppnas rätt
     i svenskt Excel.

16.2 Ordrar exporteras efter betalningsdag, i svensk tid. En redan stängd
     månad ändras inte när en sen faktura betalas.

16.3 Återbetalningar och kreditfakturor exporteras efter sin egen dag, med
     sin momsdel.

16.4 Ordrar i testläge kommer aldrig med.


# 17. Drift

17.1 Stripe avgör om en kortbetalning är betald. Vi får beskedet från
     Stripe direkt (webhook). Varje natt kl 03:00 stämmer vi dessutom av mot
     Stripe, ifall något besked har uteblivit. En faktura är betald när
     admin har registrerat bankbetalningen (§9.9).

17.2 Samma besked från Stripe hanteras en gång. Ett besked som fastnade
     halvvägs tas upp igen. Det blir aldrig liggande.

17.3 Varje regel här ska ha ett test som kör regeln, inte ett som letar efter
     en textsträng i koden.

17.4 Driftlarm skapas när något har gått fel eller kräver en människa:

     * ett besked från Stripe misslyckades eller saknar order
     * avstämningen misslyckades
     * lagerundantag eller tvist
     * fel belopp
     * en återbetalning gjordes utanför admin
     * en kreditfaktura misslyckades
     * ett mejl gick inte fram
     * lågt lager
     * en faktura är förfallen eller felbetald
     * faktureringen saknar inställningar

     Samma larm mejlas högst en gång i timmen.


# Bilaga A. Där koden avviker i dag

Det här är listan över vad som ska rättas. Den viktigaste står först. En
punkt märkt *Rättad* är klar i koden och har ett test i `web/tests/db`. Den
stryks när rättningen är i drift.

A1  *Rättad.* §7.3. **Andra fakturaköpet stoppas.** Varje fakturaköp skriver
    firmanamnet över webbkontots för- och efternamn
    (`web/app/api/invoice/route.ts:423`, som anropar
    `upsertCustomerFromCheckout` i `commerceOperations.ts:321`). Vid nästa
    köp är firmanamnet lika med personens namn, och §7.2 stoppar köpet.
    Det drabbar alla företag utom enskilda firmor. Betalningen av fakturan
    (`stripeInvoices.ts:91`) och den manuella fakturan
    (`manualInvoice.ts:374`) skriver över namnet på samma sätt.

A2  *Rättad.* §1.5. **Kudde Eric 60 x 80 går inte att köpa på svenska sidan.**
    Varianten heter "Storlek " med ett mellanslag, så `deriveOptions`
    (`catalogDb.ts:464`) gör två val. Klick på 60 x 80 väljer fortfarande
    50 x 70. Samma fel fanns i 24 av 48 varianter: gemener, mellanslag och
    oöversatta engelska namn. *Rättad* av `drizzle/0044`.

A3  §1.7, §1.11. **Engelska sidan halkar efter.** Ingenting i admin
    skriver `option_values_en` eller `handle_en`. Nya produkter ger därför
    404 på /en. På produkter som har skapats eller kopierats efter
    migrering 0040 går bara den första varianten att välja. De engelska
    brödsmulorna pekar på svenska kategoriadresser (`catalogDb.ts:86`).

A4  *Rättad.* §5.5. **Varukorgen töms när kunden avbryter hos Stripe.** Korgen står
    kvar som "i kassan", `GET` svarar 404 och webbläsaren glömmer korgen
    (`CartContext.tsx:220`).

A5  *Rättad.* §8.6. **Ett lagerundantag kan inte skickas**, inte ens när lagret har
    rättats. Ingenting reserverar på nytt, och att skicka kräver en aktiv
    reservation (`ordersDb.ts:920`).

A6  *Rättad.* §8.7. En betalning som kommer in precis när reservationen går ut blir
    lagerundantag även om lagret räcker (`inventoryDb.ts:157`).

A7  *Rättad* av `drizzle/0050`. §17.2. Ett besked från Stripe som fastnar halvvägs, till exempel vid en
    timeout, blir liggande som "processing". Varje nytt försök besvaras med
    "duplicate". Återbetalningar och tvister har ingen nattlig avstämning.

A8  *Rättad.* §8.12. En vunnen tvist sätter ordern som "paid" av sig själv, även om
    den var pausad eller avslutad (`stripeRefunds.ts:187`). Enligt regeln
    ska admin avgöra.

A9  *Rättad.* §8.5, §8.8, §8.9.

    * Admin kan sätta vilken status som helst (`api/admin/orders/[id]/route.ts:27`):
      tillbaka till väntar, eller avbokad till betald.
    * Pausad och tvist hindrar inte att ordern skickas.
    * Att avboka en betald kortorder släpper lagret utan att återbetala.

A10 *Rättad.* §4.9. En procentkod drar av även på frakten hos Stripe, eftersom frakten
    skickas som en vanlig rad. Det Stripe tar avviker då från ordern
    (`checkout/route.ts:389`).

A11 *Rättad.* §3.5. En helt återbetald order som inte har skickats behåller sin
    reservation.

A12 *Rättad.* §10.8. En manuell faktura skapar ett webbkonto för mottagarens e-post.
    Hör e-posten redan till ett webbkonto flyttas det kontot till
    fakturans företag (`commerceOperations.ts:354`).

A13 *Rättad* av `drizzle/0046`. §11.4. Koden har två slag av företag, `kind = lead` och
    `kind = customer`, med var sin lista i admin (Tvätterikunder och
    Kunder), knappen **Gör till kund** och en omvandling när en
    tvätterikund väljs i Ny faktura. Allt det ersätts av taggen.

A14 *Rättad* av `drizzle/0046`. §11.5. Säljstatusen har värdena "Tvätterikund", "Aktiv kund" och
    "Tidigare kund" och säger alltså vem som är kund. De värdena tas bort.

A15 *Rättad.* §11.2, §11.3, §11.10.

    * Det unika indexet på org-nummer skapades bara om det inte fanns
      dubbletter (`drizzle/0036`). Det fanns i produktionen och sätts nu
      ovillkorligt av `drizzle/0046`.
    * Ett webbkonto kan ändra företagets org-nummer.
    * Ett webbkonto kan kopplas till ett företag via en kontaktpersons
      e-post, även om org-numret är ett annat.
    * Kortkassan sparade Stripes momsnummer som det stod, så
      "5564813318" och "SE556481331801" blev två företag.

A16 *Rättad.* §11.9. Ett inaktivt webbkonto kan logga in och betala med kort. Bara
    fakturaköp stoppas.

A17 *Rättad.* §9. **Fakturorna görs i Stripe.** Stripe ger numret, gör pdf:en, mejlar
    den och erbjuder kortbetalning på fakturans sida. Kreditfakturor görs
    i Stripe, och de som görs för hand där kommer aldrig in hos oss. Allt
    det ersätts av egna pdf:er med egen nummerserie, och Stripe används
    bara för kort.

A18 *Rättad* av `drizzle/0049`. §16.2. Exporten tar ordrar efter skapad dag, inte betalningsdag, och
    räknar i UTC (`bookkeepingExport.ts:57`).

A19 *Rättad.* §9.2. Villkorstexten säger alltid "30 dagar netto", även när
    förfallotiden är en annan (`invoiceIssue.ts:383`). Rättas i de egna
    pdf:erna (A17).

A20 *Rättad* av `drizzle/0045`. §1.9. `status` och `active` kan säga olika saker. Butiken läser
    `status`, medan varukorgen och den manuella fakturan läser `active`.

A21 *Rättad.* §3.8. En lagerförd variant med noll i lager visar en köpknapp som
    servern sedan säger nej till.

A22 *Rättad.* §5.4. Produktsidan räknar steg från noll, servern från minsta antalet.
    Beställningsvaror visar steg 10, som ingen regel i servern har.

A23 *Rättad.* §6.4. Sidan efter betalningen visar "väntar" för betalda ordrar som har
    lagerundantag eller tvist, och uppdaterar sig aldrig.

A24 §15.3.

    * Startsidan är en kostnadsanalys för en enda leverans från Kina.
    * Listpriset kan ändras från tre olika sidor.
    * Aktivitet och Driftlarm ligger under Kundregister.
    * Statusar och felmeddelanden visas på engelska.

A25 §15.2. Statusändringar, återbetalningar, leveranser och returer på en
    order syns inte i Aktivitet.

A26 *Rättad.* §17.1. README och en kommentar säger att avstämningen körs var tionde
    minut. Den körs en gång per natt (`vercel.json`), och gränserna (100
    rader, ingen sidbrytning) är gjorda för tio minuter.

A27 §17.3. De flesta testerna för kassa och faktura läser källkoden som text
    och letar efter strängar. De kör inte flödet. Nya tester skrivs i
    `web/tests/db` och körs med `npm run test:db` mot en tillfällig
    Neon-gren. De gamla ersätts allteftersom flödena rättas.

A28 *Rättad* av `drizzle/0043`. §3.2. Franzén-varianterna har ett
    påhittat lager på 1000. De är lagerförda, och lagret begränsar hur
    mycket som kan köpas.

A29 §7.5. Fakturakassan har ingen egen leveransadress. Företagets adress
    används alltid som båda (`web/app/api/invoice/route.ts:426`).

A30 §2.1. Koden skiljer på taggarna. Mängdrabatt och minsta antal gäller
    bara `MTO`, inte `SAMPLE_ONLY` (`pricingRules.ts`, `cartDb.ts:142`).
    Behåll en tagg och ta bort den andra.

A31 *Rättad* av `drizzle/0048`. §15.6. Kommentarer finns i dag som ett enda textfält på order, företag
    och provbeställning. Det skrivs över och sparar varken vem eller när.


# Bilaga B. Beslut som behöver bekräftas

Här har jag valt en regel som koden inte avgör. Ändra regeln om valet är fel.

B1  §15.1. Ska varje admin ha ett eget lösenord? I dag kan den som har
    lösenordet logga in i någon annans namn, och då säger loggen inte vem
    som gjorde vad.

B2  §8.8. En betald order avbokas bara tillsammans med en återbetalning.

B3  §6.6. Ska den som betalar med kort få ett webbkonto automatiskt? I dag
    får hen det.

B4  §10.8. En manuell faktura skapar inga webbkonton. I dag gör den det
    (A12).

B5  §11.10. Bara admin ändrar org-nummer.

B6  §11.11. Ett företag med obetalda fakturor går inte att radera.

B7  §9.9. Ska delbetalning via bankgirot gå att registrera? I dag avvisas
    den. Påminnelseavgiften (`clients.reminder_fee`) sparas men används
    aldrig. Ska den finnas?

B8  §13.2, §13.3. Ska kunden få mejl när en order återbetalas eller
    avbokas? Ska admin få mejl om nya ordrar?

B11 §3.3, §7.1. Räcker skyddet mot påhittade fakturaköp? Reglerna kräver
    bara ett webbkonto och ett org-nummer med rätt kontrollsiffra. Ingen
    kontrollerar att företaget finns eller att köparen hör dit. Ett
    alternativ är att admin godkänner ett företags första fakturaköp innan
    lagret reserveras.


