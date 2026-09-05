import client from './client';

/*
 * Aufgabengruppen - Zwischenüberschriften über zusammengehörenden Aufgaben.
 *
 * "Frühstück" mit "Essensausgabe" und "Tische wischen", je mit eigenen
 * Leuten. Die Uhrzeit ist optional: eine reine Überschrift wie "Küche"
 * braucht keine.
 *
 * Die Route heißt aus historischen Gründen noch /program - die Tabelle
 * program_items lag ungenutzt herum und passt genau; Aufgaben zeigen mit
 * program_item_id schon darauf.
 */
export interface TaskGroup {
  id: number;
  event_id: number;
  day_number: number;
  /** Optional - eine Überschrift ohne feste Zeit ist erlaubt. */
  time?: string | null;
  title: string;
  description?: string;
  sort_order?: number;
  /** Wie viele Aufgaben in der Gruppe stecken (nur beim Abruf gefüllt). */
  task_count?: number | string;
  /** Farbname - siehe utils/gruppenFarben. null heißt: keine Farbe. */
  color?: string | null;
  /** Serie der Gruppe. Eine eigene Serie an der Aufgabe geht vor. */
  series_id?: number | null;
  series_name?: string | null;
}

/** Alter Name, solange noch Stellen darauf verweisen. */
export type ProgramItem = TaskGroup;

export const programApi = {
  /** Gruppe eine Stelle nach oben - innerhalb ihres Tages. */
  moveUp: async (id: number) => (await client.put(`/program/${id}/move-up`)).data,
  /** Gruppe eine Stelle nach unten - innerhalb ihres Tages. */
  moveDown: async (id: number) => (await client.put(`/program/${id}/move-down`)).data,

  getByEvent: async (eventId: number): Promise<TaskGroup[]> => {
    const response = await client.get(`/program/event/${eventId}`);
    return response.data;
  },

  create: async (data: {
    event_id: number;
    day_number: number;
    title: string;
    time?: string | null;
    description?: string;
    color?: string | null;
    series_id?: number | null;
  }): Promise<TaskGroup> => {
    const response = await client.post('/program', data);
    return response.data;
  },

  update: async (id: number, data: Partial<TaskGroup>): Promise<TaskGroup> => {
    const response = await client.put(`/program/${id}`, data);
    return response.data;
  },

  /**
   * Welche Aufgaben zur Gruppe gehören - die vollständige Liste. Was fehlt,
   * fällt heraus; Neues kommt hinein, auch aus einer anderen Gruppe.
   * Aufgaben fremder Tage weist der Server ab (`uebersprungen`).
   */
  setzeAufgaben: async (id: number, taskIds: number[]): Promise<{
    task_count: number; uebersprungen: number; message: string;
  }> => {
    const response = await client.put(`/program/${id}/tasks`, { task_ids: taskIds });
    return response.data;
  },

  /** Kopie auf einen Zieltag. Die Kopie ist eigenständig. */
  duplizieren: async (id: number, daten: {
    day_number: number;
    mit_aufgaben?: boolean;
    mit_zuweisungen?: boolean;
  }): Promise<{ gruppe: TaskGroup; kopierteAufgaben: number; kopierteZuweisungen: number; message: string }> => {
    const response = await client.post(`/program/${id}/duplicate`, daten);
    return response.data;
  },

  /** Löscht nur die Überschrift - die Aufgaben bleiben und sind danach ungruppiert. */
  delete: async (id: number) => {
    const response = await client.delete(`/program/${id}`);
    return response.data;
  },
};
