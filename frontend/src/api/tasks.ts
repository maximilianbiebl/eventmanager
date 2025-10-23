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
}

export interface TaskAssignment extends Task {
  assignment_id: number;
  completed: boolean;
  completed_at?: string;
  status: string;
  event_name: string;
  instance_start_date: string;
  instance_number?: number;
  event_instance_id?: number;
  user_name?: string;
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

  complete: async (assignmentId: number) => {
    const response = await client.put(`/tasks/complete/${assignmentId}`);
    return response.data;
  },

  updateReminder: async (assignmentId: number, reminderMinutes: number) => {
    const response = await client.put(`/tasks/assignment/${assignmentId}/reminder`, { reminder_minutes: reminderMinutes });
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

  updateStatus: async (taskId: number, status: string) => {
    const response = await client.put(`/tasks/${taskId}/status`, { status });
    return response.data;
  },
};
