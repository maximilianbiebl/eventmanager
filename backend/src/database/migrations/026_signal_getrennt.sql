-- Migration: Zeitpunkt, an dem eine Signal-Kopplung verloren ging
-- Wiederholbar: ja
--
-- Wird gesetzt, wenn die App feststellt, dass das gekoppelte Geraet in
-- Signal nicht mehr besteht (am Handy entfernt oder abgemeldet). Daran
-- erkennt die Oberflaeche beim Anmelden, dass sie zum neuen Koppeln
-- auffordern muss. Beim erfolgreichen Koppeln und beim Trennen wieder NULL.

ALTER TABLE users ADD COLUMN IF NOT EXISTS signal_getrennt_am TIMESTAMP;
