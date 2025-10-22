import client from './client';

export interface LoginData {
  name: string;
  password: string;
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
};
