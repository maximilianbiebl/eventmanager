import client from './client';

export interface ProgramItem {
  id: number;
  event_id: number;
  day_number: number;
  time: string;
  title: string;
  description?: string;
}

export const programApi = {
  getByEvent: async (eventId: number): Promise<ProgramItem[]> => {
    const response = await client.get(`/program/event/${eventId}`);
    return response.data;
  },

  create: async (data: Omit<ProgramItem, 'id'>) => {
    const response = await client.post('/program', data);
    return response.data;
  },

  update: async (id: number, data: Partial<ProgramItem>) => {
    const response = await client.put(`/program/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await client.delete(`/program/${id}`);
    return response.data;
  },
};
