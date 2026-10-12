-- Migration: Welche Statusmeldungen die Leitung bekommt
-- Wiederholbar: ja
--
-- Bisher gab es nur "Statusmeldungen an/aus". Jetzt waehlt jede Person aus
-- der Leitung, bei welchen Status sie Bescheid bekommt (Offen, In Arbeit,
-- Erledigt, Ueberfaellig) und ob auch bei oeffentlichen Aufgaben.
--
-- leitung_meldungen NULL heisst: Voreinstellung (Offen, In Arbeit,
-- Erledigt - genau was bisher kam; "Ueberfaellig" gab es fuer die Leitung
-- bisher nicht). Siehe services/meldungen, LEITUNG_STANDARD.

ALTER TABLE users ADD COLUMN IF NOT EXISTS leitung_meldungen TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS leitung_oeffentliche BOOLEAN NOT NULL DEFAULT true;
