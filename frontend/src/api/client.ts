import axios from 'axios';
import { getToken, clearAuth } from '../utils/authStorage';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL: API_URL,
});

// Request Interceptor für Auth Token
client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/*
 * 401 bedeutet normalerweise: die Anmeldung ist abgelaufen - dann raus und
 * zurueck zum Login.
 *
 * NICHT beim Anmelden selbst. Dort heisst 401 "Name oder Passwort falsch",
 * und das Neuladen der Seite hat bisher die Fehlermeldung samt eingegebenem
 * Namen weggeworfen, bevor man sie lesen konnte. Wer sich vertippt hat, sah
 * einfach wieder das leere Formular.
 */
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const istAnmeldung = url.includes('/auth/login');

    if (error.response?.status === 401 && !istAnmeldung) {
      clearAuth();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
