import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Lade Konfiguration
const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../../../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const SIGNAL_API_URL = process.env.SIGNAL_API_URL || config.signal?.apiUrl || 'http://signal-cli:8080';
const SIGNAL_ENABLED = config.signal?.enabled !== false;

interface SignalAccount {
  number: string;
  deviceId?: string;
}

/**
 * Signal-CLI REST API Service
 */
class SignalService {
  private apiUrl: string;
  private enabled: boolean;

  constructor() {
    this.apiUrl = SIGNAL_API_URL;
    this.enabled = SIGNAL_ENABLED;
  }

  /**
   * Prüft ob Signal-CLI erreichbar ist
   */
  async checkHealth(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      // /v1/health existiert nicht, verwende /v1/about stattdessen
      const response = await axios.get(`${this.apiUrl}/v1/about`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      console.error('Signal-CLI health check failed:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Registriert einen neuen Signal-Account (für Linking)
   * Gibt den Link-URI zurück für QR-Code Generation
   */
  async registerAccount(accountNumber: string): Promise<string> {
    if (!this.enabled) {
      throw new Error('Signal notifications are disabled in config');
    }

    try {
      // Prüfe ob Signal-CLI erreichbar ist
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        throw new Error(`Signal-CLI service is not reachable at ${this.apiUrl}. Please ensure the signal-cli container is running.`);
      }

      console.log(`Attempting to register Signal account: ${accountNumber}`);

      // Registriere Account für Linking (als Secondary Device)
      // API verwendet GET und gibt PNG-Bild zurück!
      const response = await axios.get(
        `${this.apiUrl}/v1/qrcodelink`,
        {
          params: { device_name: `EventManager-${accountNumber}` },
          timeout: 15000,
          responseType: 'arraybuffer'  // Bild als Binary empfangen
        }
      );

      // Konvertiere PNG zu Base64 Data URL
      const base64Image = Buffer.from(response.data, 'binary').toString('base64');
      const dataUrl = `data:image/png;base64,${base64Image}`;

      console.log(`Signal account registration successful for ${accountNumber}`);
      return dataUrl;  // Gib Data URL zurück statt sgnl:// Link
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.error('Signal register error: Connection refused to Signal-CLI');
        throw new Error(`Cannot connect to Signal-CLI at ${this.apiUrl}. Please check if the signal-cli container is running.`);
      }

      if (error.code === 'ETIMEDOUT') {
        console.error('Signal register error: Connection timeout');
        throw new Error('Signal-CLI request timed out. The service may be overloaded or not responding.');
      }

      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      console.error('Signal register error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });

      throw new Error(`Signal setup failed: ${errorMsg}`);
    }
  }

  /**
   * Holt die echte Telefonnummer des gelinkten Accounts
   * Gibt null zurück wenn kein Account gelinkt ist
   */
  async getLinkedAccountNumber(): Promise<string | null> {
    if (!this.enabled) return null;

    try {
      // Liste alle registrierten Accounts
      // Längerer Timeout weil Signal-CLI manchmal langsam ist
      const response = await axios.get(`${this.apiUrl}/v1/accounts`, {
        timeout: 30000  // 30 Sekunden
      });

      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        // Gib die erste registrierte Telefonnummer zurück
        const firstAccount = response.data[0];
        console.log('Linked Signal account found:', firstAccount);
        return firstAccount;
      }

      return null;
    } catch (error: any) {
      console.error('Get linked account error:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Prüft ob ein Account erfolgreich gelinkt wurde
   */
  async checkAccountLinked(accountNumber: string): Promise<boolean> {
    const linkedNumber = await this.getLinkedAccountNumber();
    return linkedNumber !== null;
  }

  /**
   * Sendet eine Signal-Nachricht
   */
  async sendMessage(fromNumber: string, toNumber: string, message: string): Promise<boolean> {
    if (!this.enabled) {
      console.log('Signal disabled, skipping message send');
      return false;
    }

    try {
      await axios.post(
        `${this.apiUrl}/v2/send`,
        {
          message: message,
          number: fromNumber,
          recipients: [toNumber]
        }
      );

      console.log(`Signal message sent from ${fromNumber} to ${toNumber}`);
      return true;
    } catch (error: any) {
      console.error('Signal send error:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Trennt einen gelinkten Account
   */
  async unlinkAccount(accountNumber: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      await axios.delete(`${this.apiUrl}/v1/accounts/${accountNumber}`);
      console.log(`Signal account ${accountNumber} unlinked`);
      return true;
    } catch (error: any) {
      console.error('Signal unlink error:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Generiert eine Test-Nachricht zum Testen der Verbindung
   */
  async sendTestMessage(fromNumber: string, toNumber: string): Promise<boolean> {
    return this.sendMessage(
      fromNumber,
      toNumber,
      '✅ Event Manager Signal-Benachrichtigungen sind aktiv!'
    );
  }
}

export const signalService = new SignalService();
