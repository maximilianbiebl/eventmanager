/*
 * Farben der Aufgabengruppen.
 *
 * Gespeichert wird der NAME ('gelb'), nicht der Farbwert. Übersetzt wird er
 * erst hier - in CSS-Token, die im hellen und im dunklen Thema eigene Werte
 * haben. Eine frei gewählte Farbe wäre im dunklen Thema entweder unsichtbar
 * oder grell.
 *
 * `kraeftig` trägt den Streifen und den Punkt, `weich` die Fläche.
 */
export interface Gruppenfarbe {
  name: string;
  anzeige: string;
  kraeftig: string;
  weich: string;
}

export const GRUPPEN_FARBEN: Gruppenfarbe[] = [
  { name: 'blau', anzeige: 'Blau', kraeftig: 'var(--g-blau)', weich: 'var(--g-blau-soft)' },
  { name: 'gruen', anzeige: 'Grün', kraeftig: 'var(--g-gruen)', weich: 'var(--g-gruen-soft)' },
  { name: 'gelb', anzeige: 'Gelb', kraeftig: 'var(--g-gelb)', weich: 'var(--g-gelb-soft)' },
  { name: 'rot', anzeige: 'Rot', kraeftig: 'var(--g-rot)', weich: 'var(--g-rot-soft)' },
  { name: 'violett', anzeige: 'Violett', kraeftig: 'var(--g-violett)', weich: 'var(--g-violett-soft)' },
  { name: 'tuerkis', anzeige: 'Türkis', kraeftig: 'var(--g-tuerkis)', weich: 'var(--g-tuerkis-soft)' },
  { name: 'braun', anzeige: 'Braun', kraeftig: 'var(--g-braun)', weich: 'var(--g-braun-soft)' },
  { name: 'grau', anzeige: 'Grau', kraeftig: 'var(--g-grau)', weich: 'var(--g-grau-soft)' },
];

/** Zu einem gespeicherten Namen die Farbe - oder nichts, wenn keine gesetzt ist. */
export const farbeVon = (name?: string | null): Gruppenfarbe | undefined =>
  GRUPPEN_FARBEN.find((f) => f.name === name);

/**
 * Streifen links und zarter Flächenton für eine Gruppenleiste. Ohne Farbe
 * bleibt alles wie bisher - deshalb ein leeres Objekt statt Vorgabewerten.
 */
export const gruppenLeisteStil = (name?: string | null): React.CSSProperties => {
  const f = farbeVon(name);
  if (!f) return {};
  return { backgroundColor: f.weich, borderLeft: `3px solid ${f.kraeftig}` };
};
