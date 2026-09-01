import { TaskAssignment } from '../api/tasks';

/*
 * Offline-Betrieb im Mitarbeiterbereich.
 *
 * Zwei Dinge:
 *   1. Der zuletzt geladene Aufgabenstand wird gespeichert, damit man ihn
 *      ohne Netz noch sieht - mit dem Zeitpunkt, damit klar ist, wie alt er ist.
 *   2. Statusaenderungen ohne Netz wandern in eine Warteschlange und werden
 *      gesendet, sobald wieder Verbindung besteht.
 *
 * Bewusst im localStorage und nicht im Service-Worker-Cache: es gibt genau
 * einen Ort fuer den Stand, sonst koennten zwei Speicher verschiedene
 * Wahrheiten behaupten.
 *
 * Was NICHT geht und auch nicht vorgetaeuscht wird: das Anmelden braucht
 * Netz, und der Admin-Bereich arbeitet weiter nur online.
 */

const TASKS_KEY = 'offline:myTasks';
const QUEUE_KEY = 'offline:queue';

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------- Aufgaben

interface CachedTasks {
  tasks: TaskAssignment[];
  savedAt: number;
}

export const cacheTasks = (tasks: TaskAssignment[]): void => {
  safe(() => localStorage.setItem(TASKS_KEY, JSON.stringify({ tasks, savedAt: Date.now() })), undefined);
};

export const readCachedTasks = (): CachedTasks | null =>
  safe(() => {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.tasks) ? parsed : null;
  }, null);

export const clearCachedTasks = (): void => {
  safe(() => localStorage.removeItem(TASKS_KEY), undefined);
};

// ------------------------------------------------------------ Warteschlange

export type QueuedAction =
  | { kind: 'complete'; assignmentId: number; taskId: number; queuedAt: number }
  | { kind: 'completePublic'; taskId: number; queuedAt: number }
  | { kind: 'status'; taskId: number; status: string; queuedAt: number };

export const readQueue = (): QueuedAction[] =>
  safe(() => {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }, []);

const writeQueue = (queue: QueuedAction[]): void => {
  safe(() => localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)), undefined);
};

/*
 * Neue Aenderung anstellen. Aeltere Eintraege zur selben Aufgabe fliegen
 * raus: es zaehlt, was zuletzt gewollt war. Sonst wuerde beim Senden erst
 * "In Arbeit" und danach nochmal "Nicht gestartet" ankommen, obwohl man
 * sich zwischendurch umentschieden hat.
 */
export const enqueue = (action: QueuedAction): void => {
  const queue = readQueue().filter(a => a.taskId !== action.taskId);
  queue.push(action);
  writeQueue(queue);
};

export const queueLength = (): number => readQueue().length;

/** Aufgaben-IDs mit ausstehender Aenderung - fuer den Hinweis auf der Karte. */
export const pendingTaskIds = (): Set<number> => new Set(readQueue().map(a => a.taskId));

/*
 * Warteschlange abarbeiten. Der Reihe nach, damit die Reihenfolge erhalten
 * bleibt. Ein Eintrag, den der Server ablehnt (die Aufgabe wurde geloescht,
 * die Zuweisung entfernt), wird verworfen statt endlos wiederholt - sonst
 * blockiert er alles Nachfolgende dauerhaft.
 */
export const flushQueue = async (senders: {
  complete: (assignmentId: number) => Promise<unknown>;
  completePublic: (taskId: number) => Promise<unknown>;
  status: (taskId: number, status: string) => Promise<unknown>;
}): Promise<{ gesendet: number; verworfen: number }> => {
  let queue = readQueue();
  let gesendet = 0;
  let verworfen = 0;

  while (queue.length > 0) {
    const action = queue[0];
    try {
      if (action.kind === 'complete') await senders.complete(action.assignmentId);
      else if (action.kind === 'completePublic') await senders.completePublic(action.taskId);
      else await senders.status(action.taskId, action.status);
      gesendet++;
    } catch (error: any) {
      // Ohne Antwort ist das Netz weg - dann spaeter erneut versuchen und
      // die Warteschlange unangetastet lassen.
      if (!error?.response) break;
      console.warn('Offline-Änderung verworfen:', action, error.response.status);
      verworfen++;
    }
    queue = queue.slice(1);
    writeQueue(queue);
  }

  return { gesendet, verworfen };
};

export const clearQueue = (): void => {
  safe(() => localStorage.removeItem(QUEUE_KEY), undefined);
};

/** Fehler ohne Server-Antwort = Netzproblem, nicht Ablehnung. */
export const istNetzfehler = (error: any): boolean => !error?.response;
