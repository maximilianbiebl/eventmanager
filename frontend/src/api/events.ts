import client from './client';

export interface Event {
  id: number;
  name: string;
  description?: string;
  start_date: string;
  days: number;
  created_by: number;
  is_template: boolean;
  is_template_suggestion: boolean;
  created_at: string;
  creator_name?: string;
  /**
   * Man ist als Co-Teamleitung eingetragen, hat die Veranstaltung aber nicht
   * angelegt. Nur in der Liste der Teamleitung gesetzt.
   */
  ist_mitleitung?: boolean;
}

export interface EventInstance {
  id: number;
  event_id: number;
  instance_number: number;
  start_date: string;
}

export interface CreateEventData {
  name: string;
  description?: string;
  start_date: string;
  days: number;
  instance_count: number;
  is_template?: boolean;
}

export const eventsApi = {
  getAll: async (): Promise<Event[]> => {
    const response = await client.get('/events');
    return response.data;
  },

  getById: async (id: number) => {
    const response = await client.get(`/events/${id}`);
    return response.data;
  },

  create: async (data: CreateEventData) => {
    const response = await client.post('/events', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Event>) => {
    const response = await client.put(`/events/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await client.delete(`/events/${id}`);
    return response.data;
  },

  duplicate: async (id: number, data: { name?: string; start_date?: string; instance_count?: number }) => {
    const response = await client.post(`/events/${id}/duplicate`, data);
    return response.data;
  },

  toggleTemplate: async (id: number, isTemplate: boolean) => {
    const response = await client.put(`/events/${id}/toggle-template`, { is_template: isTemplate });
    return response.data;
  },

  createFromTemplate: async (id: number, data: { name: string; start_date: string; instance_count: number }) => {
    const response = await client.post(`/events/${id}/create-from-template`, data);
    return response.data;
  },

  copyToTemplate: async (id: number) => {
    const response = await client.post(`/events/${id}/copy-to-template`);
    return response.data;
  },

  suggestAsTemplate: async (id: number) => {
    const response = await client.put(`/events/${id}/suggest-as-template`);
    return response.data;
  },

  approveSuggestion: async (id: number) => {
    const response = await client.post(`/events/${id}/approve-suggestion`);
    return response.data;
  },

  bulkDelete: async (ids: number[]) => {
    const response = await client.post('/events/bulk-delete', { ids });
    return response.data;
  },

  bulkApproveSuggestions: async (ids: number[]) => {
    const response = await client.post('/events/bulk-approve-suggestions', { ids });
    return response.data;
  },

  exportCSV: async (ids?: number[], withTasks?: boolean) => {
    const response = await client.post('/events/export-csv', { ids, withTasks }, { responseType: 'blob' });
    return response.data;
  },

  importCSV: async (file: File, asTemplate?: boolean, tasksFile?: File) => {
    const formData = new FormData();
    formData.append('file', file);
    if (tasksFile) {
      formData.append('tasksFile', tasksFile);
    }
    const url = asTemplate ? '/events/import-csv?asTemplate=true' : '/events/import-csv';
    const response = await client.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
};
