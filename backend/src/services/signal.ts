import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Lade Konfiguration
const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../../../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const SIGNAL_API_URL = process.env.SIGNAL_API_URL || config.signal?.apiUrl || 'http://signal-cli:8080';
const SIGNAL_ENABLED = config.signal?.enabled !== false;

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
   * Alle Konten, die signal-cli gerade als gueltig fuehrt.
   *
   * Ein Konto, dessen Kopplung am Handy entfernt wurde, fuehrt signal-cli
   * zwar noch auf der Platte, laesst es hier aber weg ("Ignoring ...: User
   * is not registered"). Damit ist diese Liste der Pruefstein, ob eine
   * Kopplung noch steht.
   *
   * null = signal-cli nicht erreichbar. Das ist etwas anderes als eine
   * leere Liste und darf NICHT als "getrennt" gewertet werden.
   */
  async getAccounts(): Promise<string[] | null> {
    if (!this.enabled) return null;
    try {
      // Im normalen Modus startet signal-cli fuer jede Anfrage neu - das
      // dauert ein paar Sekunden.
      const response = await axios.get(`${this.apiUrl}/v1/accounts`, { timeout: 30000 });
      return Array.isArray(response.data) ? response.data.map(String) : [];
    } catch (error: any) {
      console.error('Signal accounts error:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * QR-Code fuer das Koppeln als weiteres Geraet.
   *
   * Gibt ausserdem die Konten zurueck, die VOR dem Koppeln schon da waren.
   * Neu gekoppelt ist dann genau das Konto, das danach dazukommt - vorher
   * wurde einfach das erste Konto in signal-cli genommen, egal wem es
   * gehoert.
   */
  async startLink(): Promise<{ qrCode: string; vorher: string[] }> {
    if (!this.enabled) {
      throw new Error('Signal ist in der Konfiguration abgeschaltet');
    }

    const vorher = await this.getAccounts();
    if (vorher === null) {
      throw new Error(`Signal-Dienst unter ${this.apiUrl} nicht erreichbar. Laeuft der Container signal-cli?`);
    }

    try {
      const response = await axios.get(`${this.apiUrl}/v1/qrcodelink`, {
        // So steht das Geraet in Signal unter "Verknuepfte Geraete".
        params: { device_name: 'Event Manager' },
        timeout: 30000,
        responseType: 'arraybuffer',
      });
      const qrCode = `data:image/png;base64,${Buffer.from(response.data, 'binary').toString('base64')}`;
      console.log('Signal: QR-Code zum Koppeln erzeugt');
      return { qrCode, vorher };
    } catch (error: any) {
      const daten = error.response?.data;
      const text = daten ? Buffer.from(daten).toString('utf-8') : error.message;
      console.error('Signal QR-Code error:', text);
      throw new Error(`QR-Code konnte nicht erzeugt werden: ${text}`);
    }
  }

  /**
   * Lokale Daten eines Kontos in signal-cli loeschen.
   *
   * Ein gekoppeltes Geraet kann sich nicht selbst aus dem Handy austragen -
   * das geht nur am Handy unter "Verknuepfte Geraete". Hier verschwindet nur
   * die Kopie in signal-cli.
   *
   * auchWennGueltig=false: signal-cli verweigert das Loeschen, solange das
   * Konto noch gueltig ist. So raeumt man gefahrlos alte Reste weg.
   */
  async loescheLokaleDaten(nummer: string, auchWennGueltig: boolean): Promise<boolean> {
    if (!this.enabled || !nummer || nummer.startsWith('+temp')) return false;
    try {
      await axios.delete(`${this.apiUrl}/v1/devices/${encodeURIComponent(nummer)}/local-data`, {
        data: { ignore_registered: auchWennGueltig },
        timeout: 30000,
      });
      console.log(`Signal: lokale Daten von ${nummer} geloescht`);
      return true;
    } catch (error: any) {
      console.error('Signal local-data error:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Lebenszeichen fuer ein gekoppeltes Konto: neue Nachrichten abholen.
   *
   * Signal entkoppelt verknuepfte Geraete, die sich lange nicht melden
   * (rund 30 Tage). Im normalen Modus meldet sich signal-cli nur, wenn
   * jemand etwas von ihm will - zwischen zwei Freizeiten also womoeglich
   * wochenlang gar nicht. Genau so ging die Kopplung verloren.
   *
   * Das Abholen zaehlt als Aktivitaet. Es nimmt dem Handy nichts weg (jedes
   * Geraet bekommt seine eigene Kopie) und verschickt keine Lesebestaetigung.
   *
   * Rueckgabe: true = Konto antwortet, false = nicht mehr registriert,
   * null = Dienst nicht erreichbar (dann ist ueber die Kopplung nichts gesagt).
   */
  async lebenszeichen(nummer: string): Promise<boolean | null> {
    if (!this.enabled) return null;
    try {
      await axios.get(`${this.apiUrl}/v1/receive/${encodeURIComponent(nummer)}`, {
        params: {
          timeout: 5,
          ignore_attachments: true,
          ignore_stories: true,
          send_read_receipts: false,
          max_messages: 500,
        },
        timeout: 60000,
      });
      return true;
    } catch (error: any) {
      const text = JSON.stringify(error.response?.data || error.message || '');
      if (/not registered/i.test(text)) return false;
      console.error(`Signal Lebenszeichen ${nummer}:`, text);
      return null;
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
      const daten = error.response?.data;
      console.error('Signal send error:', daten || error.message);
      /*
       * "User <Absender> is not registered": die Kopplung des Absenders ist
       * weg (am Handy entfernt). Das sofort festhalten, nicht erst bei der
       * naechsten Pruefung - siehe signalKopplung.
       */
      const text = typeof daten?.error === 'string' ? daten.error : '';
      if (text.includes(`User ${fromNumber} is not registered`) && this.beiVerlorenerKopplung) {
        await this.beiVerlorenerKopplung(fromNumber).catch(() => undefined);
      }
      return false;
    }
  }

  /** Wird von signalKopplung gesetzt - vermeidet eine Ringabhaengigkeit. */
  beiVerlorenerKopplung: ((nummer: string) => Promise<void>) | null = null;

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
