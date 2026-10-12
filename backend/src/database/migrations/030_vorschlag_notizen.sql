-- Migration: Vorlagen-Vorschlag merkt sich, ob Notizen mitsollen
-- Wiederholbar: ja
--
-- Wer eine Veranstaltung als Vorlage vorschlaegt, waehlt, ob die internen
-- Notizen der Leitung mit in die Vorlage sollen. Der Admin sieht diese
-- Wahl beim Annehmen als Voreinstellung und kann sie aendern.

ALTER TABLE events ADD COLUMN IF NOT EXISTS vorschlag_mit_notizen BOOLEAN NOT NULL DEFAULT false;
