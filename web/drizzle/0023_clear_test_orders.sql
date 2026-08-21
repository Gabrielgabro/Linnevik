-- Rensar testordrarna före cutover.
--
-- Databasen innehåller fyra ordrar och alla är test: `test_mode` är satt och
-- varje Stripe-session är en `cs_test_`-session. En av dem är dessutom det
-- 21aug-granskningen pekade ut — obetald men markerad som skickad, ett
-- tillstånd den nya betalningsspärren i createFulfillment inte längre
-- tillåter. De får inte ligga kvar och blandas ihop med riktiga ordrar i
-- adminvyn eller i avstämningen mot Stripe.
--
-- Migrering i stället för handpåläggning: den körs en gång, syns i git och
-- ger samma resultat i alla miljöer som delar databasen.
--
-- `test_mode = true` är villkoret genomgående. Skulle en riktig order redan
-- ha hunnit in när den här körs rörs den inte.

-- Fulfillment-raderna först: fulfillment_items -> order_items och
-- fulfillments -> orders är båda ON DELETE RESTRICT, alltså blockerar de
-- borttagningen av ordern om de får ligga kvar.
DELETE FROM fulfillment_items
 WHERE fulfillment_id IN (
   SELECT f.id FROM fulfillments f
     JOIN orders o ON o.id = f.order_id
    WHERE o.test_mode
 );

DELETE FROM fulfillments
 WHERE order_id IN (SELECT id FROM orders WHERE test_mode);

DELETE FROM refunds
 WHERE order_id IN (SELECT id FROM orders WHERE test_mode);

-- En testleverans flyttade riktigt lagersaldo: `fulfill` drog av antalet ur
-- inventory_quantity fast ingenting skickades. Saldot läggs tillbaka innan
-- rörelserna tas bort, annars står lagret kvar med ett avdrag som inget
-- kvitto längre förklarar.
UPDATE product_variants v
   SET inventory_quantity = v.inventory_quantity + m.quantity,
       updated_at = now()
  FROM (
    SELECT variant_id, sum(quantity)::int AS quantity
      FROM inventory_movements
     WHERE type = 'fulfill'
       AND order_id IN (SELECT id FROM orders WHERE test_mode)
     GROUP BY variant_id
  ) m
 WHERE v.id = m.variant_id;

DELETE FROM inventory_movements
 WHERE order_id IN (SELECT id FROM orders WHERE test_mode);

-- order_items, order_events, inventory_reservations och discount_redemptions
-- hänger alla på ON DELETE CASCADE och följer med ordern.
DELETE FROM orders WHERE test_mode;

-- Korgarna som låstes när testkassorna öppnades. Utan sin order kommer de
-- aldrig vidare från checkout_started, och en kund som återvänder till en
-- sådan korg möter bara 409.
DELETE FROM carts
 WHERE status = 'checkout_started'
   AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.cart_id = carts.id);
