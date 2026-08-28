-- Ett organisationsnummer får bara peka ut en kundpost.
--
-- Registreringen slår upp företaget på organisationsnumret och skapar posten
-- när uppslagningen är tom. De två stegen var inte serialiserade, så två
-- anställda på samma företag som registrerade sig samtidigt — olika mejl,
-- samma organisationsnummer — kunde få var sin kundpost. Efter det ligger
-- ordrar, fakturaadress och avtalade priser på två ställen.
--
-- 0035 lade ett vanligt index här och lämnade dubbletter till admin. Det här
-- gör indexet unikt, men bara om registret faktiskt är rent: en migrering får
-- inte fälla en deploy på data som redan ligger fel. Finns det dubbletter
-- kvar loggas de i stället; migreringen räknas ändå som körd, så spärren
-- sätts av en ny numrerad fil när dubbletterna är sammanslagna i admin.
DO $$
DECLARE
  duplicates int;
BEGIN
  SELECT count(*) INTO duplicates FROM (
    SELECT "org_number" FROM "clients"
    WHERE "org_number" IS NOT NULL
    GROUP BY "org_number" HAVING count(*) > 1
  ) AS d;

  IF duplicates > 0 THEN
    RAISE WARNING
      'clients_org_number_key skapades inte: % organisationsnummer har fler än en kundpost. Slå ihop dem i admin; spärren sätts av en senare migrering.',
      duplicates;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "clients_org_number_key"
      ON "clients" ("org_number") WHERE "org_number" IS NOT NULL;
  END IF;
END $$;
