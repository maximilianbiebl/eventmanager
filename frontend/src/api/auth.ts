import client from './client';

export interface LoginData {
  name: string;
  password: string;
  /** "Eingeloggt bleiben" - laengere Gueltigkeit des Tokens */
  remember?: boolean;
}

export interface User {
  id: number;
  name: string;
  role: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export const authApi = {
  login: async (data: LoginData): Promise<LoginResponse> => {
    const response = await client.post('/auth/login', data);
    return response.data;
  },

  register: async (data: { name: string; password: string; role?: string }) => {
    const response = await client.post('/auth/register', data);
    return response.data;
  },

  resetPassword: async (userId: number, newPassword: string) => {
    const response = await client.put(`/auth/admin/reset-password/${userId}`, { newPassword });
    return response.data;
  },
};
