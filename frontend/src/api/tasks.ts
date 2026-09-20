import client from './client';

export interface Task {
  id: number;
  event_id: number;
  program_item_id?: number;
  day_number: number;
  title: string;
  description?: string;
  scheduled_time?: string;
  start_time?: string;
  end_time?: string;
  reminder_minutes: number;
  is_public: boolean;
  status: string;
  is_active?: boolean;
  sort_order?: number;
  series_id?: number;
  /*
   * Personalbedarf - wie viele Leute es fuer diese Aufgabe braucht.
   *
   * Unverbindlich: mehr oder weniger sind erlaubt, nichts wird geprueft
   * oder blockiert. NULL/undefined heisst "keine Angabe" und ist etwas
   * anderes als 0.
   *
   * Die Aufteilung nach weiblich/maennlich haengt an der AUFGABE, nicht an
   * Personen - in den Profilen wird kein Geschlecht gefuehrt. Sie ist ein
   * Hinweis fuer den, der einteilt.
   */
  needed_staff?: number | null;
  needed_female?: number | null;
  needed_male?: number | null;
  /**
   * Hakt sich zum Ende ihres Zeitfensters selbst ab und meldet sich dabei
   * nicht - fuer Aufgaben, die mit ihrem Zeitpunkt erledigt sind
   * ("Nachtruhe", "Bus faehrt"). Massgeblich ist die Endzeit, sonst die
   * Startzeit, sonst die geplante Zeit.
   */
  auto_complete?: boolean;
  /**
   * Interne Notiz der Leitung ("Filter der Maschine ist hin"). Nur in der
   * Verwaltung; der Server liefert sie im Mitarbeiterbereich gar nicht erst
   * mit. null/undefined heißt: keine Notiz.
   */
  note?: string | null;
}

export interface TaskAssignment extends Task {
  /**
   * Aufgabengruppe, in der die Aufgabe steht - als Name, Zeit und
   * Reihenfolge. Der Mitarbeiterbereich baut daraus dieselben
   * Zwischenüberschriften wie die Verwaltung.
   */
  group_name?: string | null;
  group_time?: string | null;
  /** Farbname der Gruppe - siehe utils/gruppenFarben. */
  group_color?: string | null;
  group_sort_order?: number | null;
  assignment_id: number;
  completed: boolean;
  completed_at?: string;
  /** Eigener fester Erinnerungszeitpunkt (einmalig) - siehe api.setzeErinnerung. */
  reminder_at?: string | null;
  /** Was an der eigenen Zuweisung steht; null heisst "wie an der Aufgabe". */
  assignment_reminder_minutes?: number | null;
  status: string;
  event_name: string;
  instance_start_date: string;
  instance_number?: number;
  event_instance_id?: number;
  user_name?: string;
  /** Rolle des zugewiesenen Nutzers - der Server liefert sie als user_role mit */
  user_role?: string;
  /**
   * Namen der ANDEREN auf diese Aufgabe eingeteilten Personen - ohne die
   * eigene. Zeigt im Mitarbeiterbereich, mit wem man zusammen dran ist.
   */
  mitarbeiter?: string[];
}

export interface CreateTaskData {
  event_id: number;
  program_item_id?: number;
  day_number: number;
  title: string;
  description?: string;
  scheduled_time?: string;
  start_time?: string;
  end_time?: string;
  reminder_minutes?: number;
  is_public?: boolean;
  status?: string;
  series_id?: number;
  needed_staff?: number | null;
  needed_female?: number | null;
  needed_male?: number | null;
  auto_complete?: boolean;
}

/** Eine Zeile der Handreihenfolge - Gruppe oder Aufgabe mit ihrem Rang. */
export interface Rangzeile {
  art: 'gruppe' | 'aufgabe';
  id: number;
  rang: number;
}

export interface VerschiebeAntwort {
  message: string;
  /**
   * Hat sich wirklich etwas bewegt? Am Rand des Tages passiert nichts -
   * die Aufgabe wechselt nicht den Tag. Ohne diese Angabe meldete die
   * Oberflaeche auch dann "verschoben".
   */
  bewegt?: boolean;
  reihenfolge?: Rangzeile[];
}

export const tasksApi = {
  getByEvent: async (eventId: number): Promise<Task[]> => {
    const response = await client.get(`/tasks/event/${eventId}`);
    return response.data;
  },

  getMyTasks: async (instanceId?: number): Promise<TaskAssignment[]> => {
    const url = instanceId ? `/tasks/my-tasks/${instanceId}` : '/tasks/my-tasks';
    const response = await client.get(url);
    return response.data;
  },

  create: async (data: CreateTaskData) => {
    const response = await client.post('/tasks', data);
    return response.data;
  },

  assign: async (data: { task_id: number; event_instance_id: number; user_ids: number[]; reminder_minutes?: number }) => {
    const response = await client.post('/tasks/assign', data);
    return response.data;
  },

  complete: async (assignmentId: number, ageMs = 0) => {
    const response = await client.put(`/tasks/complete/${assignmentId}`, { age_ms: ageMs });
    return response.data;
  },

  completePublic: async (taskId: number, ageMs = 0) => {
    const response = await client.put(`/tasks/${taskId}/complete-public`, { age_ms: ageMs });
    return response.data;
  },

  updateReminder: async (assignmentId: number, reminderMinutes: number) => {
    const response = await client.put(`/tasks/assignment/${assignmentId}/reminder`, { reminder_minutes: reminderMinutes });
    return response.data;
  },

  /*
   * Eigene Erinnerung - vier Arten:
   *   vorher : X Minuten vor der Aufgabe (bleibt stehen)
   *   in     : X Minuten ab jetzt (einmalig)
   *   um     : fester Zeitpunkt (einmalig), als ISO-Zeichenkette
   *   keine  : aus
   * Siehe backend/src/routes/tasks.ts.
   */
  setzeErinnerung: async (
    assignmentId: number,
    daten: { art: 'vorher' | 'in' | 'um' | 'keine'; minuten?: number; zeitpunkt?: string }
  ): Promise<{ reminder_minutes: number | null; reminder_at: string | null }> => {
    const response = await client.put(`/tasks/assignment/${assignmentId}/erinnerung`, daten);
    return response.data;
  },

  update: async (id: number, data: Partial<Task>) => {
    const response = await client.put(`/tasks/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await client.delete(`/tasks/${id}`);
    return response.data;
  },

  getStatus: async (instanceId: number) => {
    const response = await client.get(`/tasks/status/${instanceId}`);
    return response.data;
  },

  /**
   * @param ageMs Wie lange die Änderung her ist. Offline getroffene
   *   Änderungen kommen verspätet an; der Server erkennt daran, ob
   *   inzwischen jemand anders einen neueren Stand gesetzt hat. Bewusst die
   *   Dauer und nicht die Uhrzeit - so spielt eine falsch gehende Uhr auf
   *   dem Gerät keine Rolle.
   */
  updateStatus: async (taskId: number, status: string, ageMs = 0) => {
    const response = await client.put(`/tasks/${taskId}/status`, { status, age_ms: ageMs });
    return response.data;
  },

  activate: async (taskId: number) => {
    const response = await client.put(`/tasks/${taskId}/activate`);
    return response.data;
  },

  deactivate: async (taskId: number) => {
    const response = await client.put(`/tasks/${taskId}/deactivate`);
    return response.data;
  },

  /*
   * Verschieben gibt die NEUE Reihenfolge zurueck: fuer eine lose Aufgabe
   * die des ganzen Tages (Gruppen und lose Aufgaben), fuer eine Aufgabe in
   * einer Gruppe die ihrer Gruppe. Damit zeigt die Liste den Zug sofort,
   * ohne alles nachzuladen.
   */
  moveUp: async (taskId: number): Promise<VerschiebeAntwort> => {
    const response = await client.put(`/tasks/${taskId}/move-up`);
    return response.data;
  },

  moveDown: async (taskId: number): Promise<VerschiebeAntwort> => {
    const response = await client.put(`/tasks/${taskId}/move-down`);
    return response.data;
  },

  /*
   * Notiz der Leitung an einer Aufgabe.
   *
   * Eigener Aufruf statt eines Feldes im Bearbeiten-Dialog: eine Notiz ist
   * ein Zuruf zwischendurch. Leerer Text löscht sie; die Antwort trägt den
   * gespeicherten Stand, damit die Zeile ihn übernehmen kann.
   */
  setzeNotiz: async (taskId: number, note: string): Promise<{ id: number; note: string | null }> => {
    const response = await client.patch(`/tasks/${taskId}/note`, { note });
    return response.data;
  },

  bulkDelete: async (eventId: number, taskIds: number[]) => {
    const response = await client.post(`/tasks/event/${eventId}/bulk-delete`, { task_ids: taskIds });
    return response.data;
  },

  bulkAssign: async (eventInstanceId: number, taskIds: number[], userIds: number[]) => {
    const response = await client.post(`/tasks/instance/${eventInstanceId}/bulk-assign`, {
      task_ids: taskIds,
      user_ids: userIds,
    });
    return response.data;
  },

  exportCSV: async (eventId: number, taskIds?: number[]) => {
    const response = await client.post(`/tasks/event/${eventId}/export-csv`, { task_ids: taskIds }, { responseType: 'blob' });
    return response.data;
  },

  importCSV: async (eventId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await client.post(`/tasks/event/${eventId}/import-csv`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
};
