/*
 * Farbgebung der Personen-Badges nach Rolle.
 *
 * Dieselben Toene wie auf der Mitarbeiter-Seite, damit "gelb = Admin" und
 * "gruen = Teamleiter" ueberall dasselbe heisst. Mitarbeiter bleiben im
 * Akzentton - sie sind der Normalfall und sollen nicht auffallen.
 *
 * Bewusst an EINER Stelle: denselben Badge gab es schon einmal doppelt
 * (Tabellen- und Kartenansicht), und die eine Haelfte blieb beim Aendern
 * zurueck.
 */

export interface RoleBadgeColors {
  backgroundColor: string;
  color: string;
}

export const roleBadgeColors = (role?: string): RoleBadgeColors => {
  switch (role) {
    case 'admin':
      return { backgroundColor: 'var(--c-warning-soft)', color: 'var(--c-warning-strong)' };
    case 'teamleiter':
      return { backgroundColor: 'var(--c-success-soft)', color: 'var(--c-success-strong)' };
    default:
      return { backgroundColor: 'var(--c-accent-soft)', color: 'var(--c-accent-strong)' };
  }
};

export const ROLE_NAMES: { [key: string]: string } = {
  admin: 'Admin',
  teamleiter: 'Teamleiter',
  staff: 'Mitarbeiter',
};

/** Tooltip: Rolle und Herkunft der Zuweisung in einem Satz. */
export const assignmentTitle = (role: string | undefined, viaSeries: boolean): string => {
  const herkunft = viaSeries ? 'über die Serie zugewiesen' : 'einzeln zugewiesen';
  const rolle = ROLE_NAMES[role || ''] ;
  return rolle ? `${rolle} · ${herkunft}` : herkunft;
};

/* ------------------------------------------------------------------------
 * Rolle IN EINER VERANSTALTUNG
 *
 * Innerhalb einer Veranstaltung zaehlt nicht das Konto, sondern die
 * Zustaendigkeit hier: leitet jemand, oder packt er mit an? Ein Admin kann
 * in einer fremden Freizeit einfacher Mitarbeiter sein.
 *
 * Das lag vorher an zwei Stellen verschieden: der Pool faerbte nach der
 * Rolle in der Veranstaltung, die Zuweisungs-Badges an den Aufgaben noch
 * nach der Konto-Rolle. Derselbe Admin war im Pool blau und an der Aufgabe
 * gelb. Deshalb steht beides jetzt hier.
 * ---------------------------------------------------------------------- */

export interface Leitung {
  id: number;
  is_primary?: boolean;
}

export type EventRolle = 'leitung' | 'co-leitung' | null;

export const eventRolleVon = (
  userId: number | undefined | null,
  leitung: Leitung[] | undefined
): EventRolle => {
  if (!userId) return null;
  const eintrag = leitung?.find(l => l.id === userId);
  if (!eintrag) return null;
  return eintrag.is_primary ? 'leitung' : 'co-leitung';
};

/** Leitung und Co-Leitung gruen, alle anderen im Akzentton. */
export const eventBadgeColors = (rolle: EventRolle): RoleBadgeColors =>
  rolle
    ? { backgroundColor: 'var(--c-success-soft)', color: 'var(--c-success-strong)' }
    : { backgroundColor: 'var(--c-accent-soft)', color: 'var(--c-accent-strong)' };

const EVENT_ROLLE_NAMEN: Record<Exclude<EventRolle, null>, string> = {
  leitung: 'Leitung dieser Veranstaltung',
  'co-leitung': 'Co-Leitung dieser Veranstaltung',
};

/** Tooltip fuer einen Namen im Pool: Zustaendigkeit hier, dann das Konto. */
export const eventBadgeTitle = (rolle: EventRolle, kontoRolle?: string): string | undefined => {
  const konto = ROLE_NAMES[kontoRolle || ''];
  if (!rolle) return konto || undefined;
  return konto ? `${EVENT_ROLLE_NAMEN[rolle]} · ${konto}` : EVENT_ROLLE_NAMEN[rolle];
};

/** Tooltip fuer eine Zuweisung: Zustaendigkeit, Konto und Herkunft. */
export const eventAssignmentTitle = (
  rolle: EventRolle,
  kontoRolle: string | undefined,
  viaSeries: boolean
): string => {
  const herkunft = viaSeries ? 'über die Serie zugewiesen' : 'einzeln zugewiesen';
  const wer = eventBadgeTitle(rolle, kontoRolle);
  return wer ? `${wer} · ${herkunft}` : herkunft;
};
