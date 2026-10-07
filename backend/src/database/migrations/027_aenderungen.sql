-- Migration: Aenderungsprotokoll der Leitung
-- Wiederholbar: ja
--
-- Wer hat was wann an einer Veranstaltung geaendert - damit die Co-Leitung
-- nachvollziehen kann, was die andere Leitung gemacht hat, und beim
-- naechsten Oeffnen der App sieht, was sich in ihrer Abwesenheit getan hat.
--
-- Erfasst werden Aenderungen durch Leitung und Admins (Aufgaben, Gruppen,
-- Serien, Pool, Einteilung, Veranstaltung). Was Mitarbeiter abhaken, steht
-- hier bewusst nicht - dafuer gibt es die Benachrichtigungen, und das
-- Protokoll waere sonst voll davon.
--
-- user_name wird mitgeschrieben: das Protokoll soll auch dann noch sagen,
-- wer es war, wenn das Konto inzwischen geloescht ist.

CREATE TABLE IF NOT EXISTS aenderungen (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name  TEXT NOT NULL,
  zeit       TIMESTAMP NOT NULL DEFAULT NOW(),
  art        TEXT NOT NULL,
  text       TEXT NOT NULL,
  task_id    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_aenderungen_event_zeit ON aenderungen (event_id, zeit DESC);
CREATE INDEX IF NOT EXISTS idx_aenderungen_zeit ON aenderungen (zeit);

-- Wann war jemand zuletzt in der App? Grundlage fuer "Waehrend du weg warst".
ALTER TABLE users ADD COLUMN IF NOT EXISTS zuletzt_aktiv_am TIMESTAMP;
