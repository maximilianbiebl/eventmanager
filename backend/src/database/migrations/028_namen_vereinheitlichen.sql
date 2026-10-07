-- Migration: Anmeldenamen vereinheitlichen
-- Wiederholbar: ja
--
-- Namen aus einer CSV (Excel, Word, Mac) koennen gleich aussehen und doch
-- anders sein: doppelte Leerzeichen, geschuetzte Leerzeichen (U+00A0),
-- Umlaute in zerlegter Form (u + Trema). Beim Anmelden tippt man die
-- gewoehnliche Form und bekam "Benutzername oder Passwort falsch".
--
-- Ab jetzt vereinheitlicht der Server jeden Namen beim Speichern und beim
-- Anmelden (backend utils/namen.ts). Diese Migration zieht die vorhandenen
-- Namen nach: zusammengesetzte Form (NFC), jeder Leerraum ein einfaches
-- Leerzeichen, nichts am Anfang oder Ende.
--
-- Wuerde ein bereinigter Name mit einem vorhandenen zusammenfallen, bleibt
-- dieser eine Name, wie er ist (Hinweis im Protokoll) - die Migration
-- bricht deswegen nicht ab.

DO $$
DECLARE
  r RECORD;
  neu TEXT;
BEGIN
  FOR r IN SELECT id, name FROM users ORDER BY id LOOP
    neu := btrim(regexp_replace(normalize(r.name, NFC),
                                E'[\\s\\u00A0\\u2007\\u202F\\u200B\\uFEFF]+', ' ', 'g'));
    IF neu <> r.name AND neu <> '' THEN
      BEGIN
        UPDATE users SET name = neu WHERE id = r.id;
        RAISE NOTICE 'Name vereinheitlicht: Benutzer %', r.id;
      EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'Name von Benutzer % nicht geaendert: "%" gibt es schon', r.id, neu;
      END;
    END IF;
  END LOOP;
END $$;
