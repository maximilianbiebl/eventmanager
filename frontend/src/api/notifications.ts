import client from './client';

export const notificationsApi = {
  getVapidPublicKey: async (): Promise<string> => {
    const response = await client.get('/notifications/vapid-public-key');
    return response.data.publicKey;
  },

  subscribe: async (subscription: PushSubscription) => {
    const response = await client.post('/notifications/subscribe', subscription.toJSON());
    return response.data;
  },

  unsubscribe: async (endpoint: string) => {
    const response = await client.post('/notifications/unsubscribe', { endpoint });
    return response.data;
  },

  sendTest: async () => {
    const response = await client.post('/notifications/test');
    return response.data;
  },
};
