import client from './client';

export interface User {
  id: number;
  name: string;
  role: string;
  created_at?: string;
}

export const usersApi = {
  getAll: async (): Promise<User[]> => {
    const response = await client.get('/users');
    return response.data;
  },

  update: async (id: number, data: { name?: string; password?: string; role?: string }) => {
    const response = await client.put(`/users/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await client.delete(`/users/${id}`);
    return response.data;
  },

  bulkDelete: async (ids: number[]) => {
    const response = await client.post('/users/bulk-delete', { ids });
    return response.data;
  },

  exportCSV: async (ids?: number[]) => {
    const response = await client.post('/users/export-csv', { ids }, { responseType: 'blob' });
    return response.data;
  },

  importCSV: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await client.post('/users/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  assignToInstance: async (instanceId: number, userIds: number[]) => {
    const response = await client.post(`/users/instance/${instanceId}/staff`, { user_ids: userIds });
    return response.data;
  },

  getInstanceStaff: async (instanceId: number): Promise<User[]> => {
    const response = await client.get(`/users/instance/${instanceId}/staff`);
    return response.data;
  },

  removeFromInstance: async (instanceId: number, userId: number) => {
    const response = await client.delete(`/users/instance/${instanceId}/staff/${userId}`);
    return response.data;
  },
};
