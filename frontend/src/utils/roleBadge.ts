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
