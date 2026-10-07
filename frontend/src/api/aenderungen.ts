import client from './client';

/** Ein Eintrag im Aenderungsprotokoll der Leitung (backend utils/protokoll). */
export interface Aenderung {
  id: number;
  user_name: string;
  zeit: string;
  art: string;
  text: string;
  task_id?: number | null;
}

export interface NeueAenderungen {
  seit: string | null;
  gesamt: number;
  mehr?: boolean;
  veranstaltungen: { event_id: number; event_name: string; eintraege: Aenderung[] }[];
}

export const aenderungenApi = {
  /** Verlauf einer Veranstaltung, neueste zuerst. `vor` = aelter als dieser Eintrag. */
  verlauf: async (eventId: number, vor?: number): Promise<{ eintraege: Aenderung[]; mehr: boolean }> => {
    const response = await client.get(`/aenderungen/event/${eventId}`, { params: vor ? { vor } : {} });
    return response.data;
  },
  /** Was andere seit meinem letzten Besuch an meinen Veranstaltungen geaendert haben. */
  neu: async (): Promise<NeueAenderungen> => (await client.get('/aenderungen/neu')).data,
  /** "Ich bin da" - Grundlage fuer "seit deinem letzten Besuch". */
  aktiv: async (): Promise<void> => { await client.post('/aenderungen/aktiv'); },
};
