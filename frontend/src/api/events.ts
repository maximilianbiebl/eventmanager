import client from './client';

export interface Event {
  id: number;
  name: string;
  description?: string;
  start_date: string;
  days: number;
  created_by: number;
  created_at: string;
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
};
