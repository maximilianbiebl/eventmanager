import client from './client';

export interface SignalSettings {
  signal_enabled: boolean;
  signal_phone_number: string;
  web_push_enabled: boolean;
}

export interface SignalStatus {
  linked: boolean;
  accountNumber?: string;
  linkedAt?: string;
}

export interface SignalSetupResponse {
  qrCode: string;
  linkUri: string;
  accountNumber: string;
  message: string;
}

export const signalApi = {
  // Teamleiter/Admin: Signal-Account einrichten
  setup: async (): Promise<SignalSetupResponse> => {
    const response = await client.post('/signal/setup');
    return response.data;
  },

  // Teamleiter/Admin: Prüfe ob Account gelinkt ist
  checkLink: async (): Promise<{ linked: boolean; accountNumber?: string }> => {
    const response = await client.get('/signal/check-link');
    return response.data;
  },

  // Teamleiter/Admin: Hole aktuellen Status
  getStatus: async (): Promise<SignalStatus> => {
    const response = await client.get('/signal/status');
    return response.data;
  },

  // Teamleiter/Admin: Trenne Verbindung
  unlink: async (): Promise<{ message: string }> => {
    const response = await client.post('/signal/unlink');
    return response.data;
  },

  // Teamleiter/Admin: Sende Test-Nachricht
  sendTest: async (toNumber: string): Promise<{ message: string }> => {
    const response = await client.post('/signal/test', { toNumber });
    return response.data;
  },

  // Alle User: Hole Benachrichtigungs-Einstellungen
  getSettings: async (): Promise<SignalSettings> => {
    const response = await client.get('/signal/settings');
    return response.data;
  },

  // Alle User: Aktualisiere Benachrichtigungs-Einstellungen
  updateSettings: async (settings: SignalSettings): Promise<{ message: string }> => {
    const response = await client.put('/signal/settings', settings);
    return response.data;
  },
};
