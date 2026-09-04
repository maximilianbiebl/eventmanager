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
}

/** Alter Name, solange noch Stellen darauf verweisen. */
export type ProgramItem = TaskGroup;

export const programApi = {
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
  }): Promise<TaskGroup> => {
    const response = await client.post('/program', data);
    return response.data;
  },

  update: async (id: number, data: Partial<TaskGroup>): Promise<TaskGroup> => {
    const response = await client.put(`/program/${id}`, data);
    return response.data;
  },

  /** Löscht nur die Überschrift - die Aufgaben bleiben und sind danach ungruppiert. */
  delete: async (id: number) => {
    const response = await client.delete(`/program/${id}`);
    return response.data;
  },
};
