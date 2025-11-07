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
};
