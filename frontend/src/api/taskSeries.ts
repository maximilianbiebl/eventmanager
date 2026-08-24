import client from './client';

export interface TaskSeries {
  id: number;
  event_id: number;
  name: string;
  description?: string;
  task_count?: number;
  member_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskSeriesDetails extends TaskSeries {
  members: Array<{
    id: number;
    name: string;
  }>;
  tasks: Array<{
    id: number;
    title: string;
    day_number: number;
  }>;
}

export interface CreateTaskSeriesData {
  event_id: number;
  name: string;
  description?: string;
  member_ids?: number[];
}

export const taskSeriesApi = {
  getByEvent: async (eventId: number): Promise<TaskSeries[]> => {
    const response = await client.get(`/tasks/task-series/event/${eventId}`);
    return response.data;
  },

  getById: async (seriesId: number): Promise<TaskSeriesDetails> => {
    const response = await client.get(`/tasks/task-series/${seriesId}`);
    return response.data;
  },

  create: async (data: CreateTaskSeriesData): Promise<TaskSeries> => {
    const response = await client.post('/tasks/task-series', data);
    return response.data;
  },

  update: async (seriesId: number, data: { name: string; description?: string }): Promise<TaskSeries> => {
    const response = await client.put(`/tasks/task-series/${seriesId}`, data);
    return response.data;
  },

  /**
   * Was mit den Aufgaben der Serie geschieht:
   *   keep         - Aufgaben und Zuweisungen bleiben
   *   unassign     - Aufgaben bleiben, Zuweisungen der Mitglieder fallen weg
   *   delete_tasks - Aufgaben werden mitgelöscht
   */
  delete: async (seriesId: number, mode: 'keep' | 'unassign' | 'delete_tasks' = 'keep'): Promise<void> => {
    await client.delete(`/tasks/task-series/${seriesId}?mode=${mode}`);
  },

  getMembers: async (seriesId: number): Promise<Array<{ id: number; name: string; role: string }>> => {
    const response = await client.get(`/tasks/task-series/${seriesId}/members`);
    return response.data;
  },

  addMembers: async (seriesId: number, userIds: number[]): Promise<{ added: number }> => {
    const response = await client.post(`/tasks/task-series/${seriesId}/members`, { user_ids: userIds });
    return response.data;
  },

  removeMember: async (seriesId: number, userId: number): Promise<void> => {
    await client.delete(`/tasks/task-series/${seriesId}/members/${userId}`);
  },

  assignToInstance: async (seriesId: number, instanceId: number): Promise<{ assigned: number }> => {
    const response = await client.post(`/tasks/task-series/${seriesId}/assign-to-instance`, { event_instance_id: instanceId });
    return response.data;
  },
};
