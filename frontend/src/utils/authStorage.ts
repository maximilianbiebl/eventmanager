/*
 * Wo Anmeldedaten liegen.
 *
 * "Eingeloggt bleiben" entscheidet zwischen zwei Speichern:
 *   localStorage   - ueberdauert das Schliessen der App (Voreinstellung,
 *                    entspricht dem bisherigen Verhalten)
 *   sessionStorage - gilt nur fuer diese Sitzung, beim Schliessen weg
 *
 * Beides an einer Stelle, weil den Token bisher vier Dateien direkt aus
 * localStorage gelesen haben - eine davon zu vergessen faellt erst auf,
 * wenn sich jemand nicht abmelden kann.
 */

const TOKEN = 'token';
const USER = 'user';

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    // Privater Modus o.ae. - dann eben ohne Speicher
    return fallback;
  }
};

/** Token aus beiden Speichern, dauerhaft hat Vorrang. */
export const getToken = (): string | null =>
  safe(() => localStorage.getItem(TOKEN) ?? sessionStorage.getItem(TOKEN), null);

export const getStoredUser = (): string | null =>
  safe(() => localStorage.getItem(USER) ?? sessionStorage.getItem(USER), null);

export const storeAuth = (token: string, user: unknown, remember: boolean): void => {
  safe(() => {
    // Erst beide leeren, sonst bleibt beim Wechsel des Modus ein alter
    // Token im anderen Speicher liegen und gewinnt beim naechsten Start.
    clearAuth();
    const store = remember ? localStorage : sessionStorage;
    store.setItem(TOKEN, token);
    store.setItem(USER, JSON.stringify(user));
  }, undefined);
};

export const clearAuth = (): void => {
  safe(() => {
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(USER);
    sessionStorage.removeItem(TOKEN);
    sessionStorage.removeItem(USER);
  }, undefined);
};

/** Merkt sich nur den Haken selbst, damit er beim naechsten Mal stimmt. */
export const getRememberPreference = (): boolean =>
  safe(() => localStorage.getItem('rememberMe') !== 'false', true);

export const setRememberPreference = (remember: boolean): void => {
  safe(() => localStorage.setItem('rememberMe', String(remember)), undefined);
};
