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
   * Registriert einen neuen Signal-Account (für Linking)
   * Gibt den Link-URI zurück für QR-Code Generation
   */
  async registerAccount(accountNumber: string): Promise<string> {
    if (!this.enabled) {
      throw new Error('Signal notifications are disabled');
    }

    try {
      // Registriere Account für Linking (als Secondary Device)
      const response = await axios.post(
        `${this.apiUrl}/v1/qrcodelink`,
        { device_name: `EventManager-${accountNumber}` },
        { params: { account: accountNumber } }
      );

      return response.data.url || response.data;
    } catch (error: any) {
      console.error('Signal register error:', error.response?.data || error.message);
      throw new Error('Failed to register Signal account');
    }
  }

  /**
   * Prüft ob ein Account erfolgreich gelinkt wurde
   */
  async checkAccountLinked(accountNumber: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const response = await axios.get(
        `${this.apiUrl}/v1/accounts/${accountNumber}`
      );

      return response.status === 200 && response.data !== null;
    } catch (error) {
      return false;
    }
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
