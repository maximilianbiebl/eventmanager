import React from 'react';

/*
 * Personalbedarf einer Aufgabe.
 *
 * Zeigt "eingeteilt / benoetigt" und, wenn hinterlegt, die gewuenschte
 * Aufteilung nach weiblich und maennlich.
 *
 * Die Angabe ist ausdruecklich unverbindlich - mehr oder weniger Leute sind
 * erlaubt. Deshalb wird nichts blockiert und auch nichts rot: fehlt jemand,
 * ist das ein Hinweis (gelb), ist die Zahl erreicht, ist es gut (gruen).
 *
 * Die Aufteilung haengt an der AUFGABE, nicht an Personen. In den Profilen
 * wird kein Geschlecht gefuehrt und soll auch keines gefuehrt werden - die
 * App kann also gar nicht nachrechnen, ob sie erfuellt ist. Sie steht hier
 * fuer den Menschen, der einteilt.
 */

export interface Bedarf {
  needed_staff?: number | null;
  needed_female?: number | null;
  needed_male?: number | null;
}

/**
 * Gesamtzahl. Ist nur die Aufteilung gepflegt, ergibt sich der Bedarf aus
 * ihrer Summe - dann muss man dieselbe Zahl nicht zweimal eintragen.
 */
export const bedarfGesamt = (t: Bedarf): number | null => {
  if (t.needed_staff !== null && t.needed_staff !== undefined) return t.needed_staff;
  const w = t.needed_female ?? 0;
  const m = t.needed_male ?? 0;
  return w + m > 0 ? w + m : null;
};

export const hatBedarf = (t: Bedarf): boolean =>
  bedarfGesamt(t) !== null
  || (t.needed_female ?? 0) > 0
  || (t.needed_male ?? 0) > 0;

const teilung = (t: Bedarf): string => {
  const teile: string[] = [];
  if (t.needed_female) teile.push(`${t.needed_female} w`);
  if (t.needed_male) teile.push(`${t.needed_male} m`);
  return teile.join(' · ');
};

interface Props {
  task: Bedarf;
  /** Wie viele sind eingeteilt - fuer "2/4". Fehlt sie, steht nur der Bedarf. */
  zugewiesen?: number;
  /** Kleiner, fuer enge Zeilen. */
  klein?: boolean;
}

export const BedarfBadge: React.FC<Props> = ({ task, zugewiesen, klein }) => {
  if (!hatBedarf(task)) return null;

  const gesamt = bedarfGesamt(task);
  const aufteilung = teilung(task);
  const fehlt = gesamt !== null && zugewiesen !== undefined && zugewiesen < gesamt;

  const text = gesamt === null
    ? aufteilung
    : zugewiesen === undefined
      ? `${gesamt} gesucht`
      : `${zugewiesen}/${gesamt}`;

  const teileText = [
    task.needed_female ? `${task.needed_female} weiblich` : '',
    task.needed_male ? `${task.needed_male} männlich` : '',
  ].filter(Boolean).join(' und ');

  const bedarfSatz = gesamt === null
    ? `Benötigt: ${teileText}`
    : `Benötigt: ${gesamt} ${gesamt === 1 ? 'Person' : 'Personen'}${teileText ? `, davon ${teileText}` : ''}`;

  const titel = [
    bedarfSatz,
    zugewiesen === undefined ? '' : `Eingeteilt: ${zugewiesen}`,
    'Die Angabe ist unverbindlich - mehr oder weniger sind in Ordnung.',
  ].filter(Boolean).join('. ');

  return (
    <span
      title={titel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: klein ? '0 0.375rem' : '0.125rem 0.5rem',
        borderRadius: '9999px',
        whiteSpace: 'nowrap',
        fontSize: klein ? '0.6875rem' : '0.75rem',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        backgroundColor: fehlt ? 'var(--c-warning-soft)' : 'var(--c-success-soft)',
        color: fehlt ? 'var(--c-warning-strong)' : 'var(--c-success-strong)',
      }}
    >
      {text}
      {/* In Klammern, sonst liest sich "1/4 2 w" wie eine einzige Zahlenreihe. */}
      {gesamt !== null && aufteilung && (
        <span style={{ fontWeight: 500, opacity: 0.85 }}>({aufteilung})</span>
      )}
    </span>
  );
};
