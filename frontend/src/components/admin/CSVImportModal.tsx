import React, { useState } from 'react';
import { usersApi } from '../../api/users';
import { eventsApi } from '../../api/events';
import { tasksApi } from '../../api/tasks';
import { useAuth } from '../../context/AuthContext';

interface Props {
  type: 'users' | 'events' | 'tasks';
  onClose: () => void;
  onSuccess: (result: any) => void;
  eventId?: number; // For tasks import
}

/*
 * Dieselbe Trennlogik wie im Server: an Kommas trennen, aber
 * Anfuehrungszeichen beachten. Sonst zeigt die Vorschau etwas anderes an,
 * als beim Import tatsaechlich ankommt.
 */
const parseCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
};

/*
 * Die erwarteten Spalten je Import-Art. Die Namen stammen aus den
 * Import-Routen des Servers - wer sie hier aendert, muss dort nachziehen.
 */
const FORMATS: {
  [key in 'users' | 'events' | 'tasks']: {
    header: string;
    columns: { name: string; required: boolean; hint: string }[];
    note: string;
  };
} = {
  users: {
    header: 'name,role,password',
    columns: [
      { name: 'name', required: true, hint: 'Anmeldename, auch mit Leerzeichen ("Max Mustermann")' },
      { name: 'role', required: false, hint: 'admin, teamleiter oder staff - leer bedeutet staff' },
      { name: 'password', required: false, hint: 'mindestens 6 Zeichen; leer = wird zufällig erzeugt' },
    ],
    note: 'Bereits vorhandene Namen werden übersprungen, deren Passwörter bleiben unverändert. Die Zugangsdaten werden nach dem Import einmalig angezeigt.',
  },
  events: {
    header: 'name,description,start_date,days',
    columns: [
      { name: 'name', required: true, hint: 'Name der Veranstaltung' },
      { name: 'description', required: false, hint: 'Beschreibung' },
      { name: 'start_date', required: false, hint: 'Startdatum als JJJJ-MM-TT, z. B. 2026-09-01' },
      { name: 'days', required: false, hint: 'Anzahl Tage, leer bedeutet 1' },
    ],
    note: 'Als Vorlage importierte Veranstaltungen bekommen kein Startdatum.',
  },
  tasks: {
    header: 'title,description,day_number,scheduled_time,start_time,end_time,is_public',
    columns: [
      { name: 'title', required: true, hint: 'Titel der Aufgabe' },
      { name: 'description', required: false, hint: 'Beschreibung' },
      { name: 'day_number', required: false, hint: 'Veranstaltungstag als Zahl, leer bedeutet 1' },
      { name: 'scheduled_time', required: false, hint: 'geplante Zeit als HH:MM' },
      { name: 'start_time', required: false, hint: 'Startzeit als HH:MM' },
      { name: 'end_time', required: false, hint: 'Endzeit als HH:MM' },
      { name: 'is_public', required: false, hint: 'true oder false' },
    ],
    note: 'Felder mit Komma bitte in Anführungszeichen setzen: "Aufbau, Halle 2".',
  },
};

interface Credential {
  name: string;
  password: string;
  generated: boolean;
}

interface ImportPreview {
  total: number;
  items: any[];
  errors: string[];
}

export const CSVImportModal: React.FC<Props> = ({ type, onClose, onSuccess, eventId }) => {
  const { isAdmin } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [tasksFile, setTasksFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [importAsTemplate, setImportAsTemplate] = useState(false);
  // Wird nach dem Import EINMAL gezeigt und nirgends gespeichert
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [importSummary, setImportSummary] = useState<any>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    // Parse CSV for preview
    try {
      const text = (await selectedFile.text()).replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length === 0) {
        alert('CSV-Datei ist leer');
        return;
      }

      const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
      const items = lines.slice(1).map((line, idx) => {
        const values = parseCsvLine(line);
        const item: any = { _index: idx };
        headers.forEach((header, i) => {
          item[header] = values[i];
        });
        return item;
      });

      setPreview({
        total: items.length,
        items,
        errors: [],
      });
      setSelectedItems(items.map((_, idx) => idx));
    } catch (error) {
      console.error('Parse error:', error);
      alert('Fehler beim Lesen der CSV-Datei');
    }
  };

  const handleToggleItem = (index: number) => {
    setSelectedItems(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleSelectAll = () => {
    if (selectedItems.length === preview?.items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(preview?.items.map((_, idx) => idx) || []);
    }
  };

  const handleImport = async () => {
    if (!file || !preview) {
      alert('Bitte Datei auswählen');
      return;
    }

    if (selectedItems.length === 0) {
      alert('Bitte mindestens ein Element auswählen');
      return;
    }

    try {
      setLoading(true);

      // Create filtered CSV with only selected items
      const text = (await file.text()).replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const headerLine = lines[0];
      const selectedLines = [headerLine];

      // Add only selected items (selectedItems contains indices)
      lines.slice(1).forEach((line, idx) => {
        if (selectedItems.includes(idx)) {
          selectedLines.push(line);
        }
      });

      const filteredCsv = selectedLines.join('\n');
      const filteredFile = new File([filteredCsv], file.name, { type: 'text/csv' });

      let result;
      if (type === 'users') {
        result = await usersApi.importCSV(filteredFile);
      } else if (type === 'events') {
        result = await eventsApi.importCSV(filteredFile, importAsTemplate, tasksFile || undefined);
      } else if (type === 'tasks' && eventId) {
        result = await tasksApi.importCSV(eventId, filteredFile);
      } else {
        throw new Error('Invalid import type');
      }

      if (type === 'users' && result.credentials?.length) {
        // Zugangsdaten stehen nur in dieser Antwort - erst schliessen, wenn
        // sie abgeholt sind. Deshalb kein alert und kein sofortiges onSuccess.
        setCredentials(result.credentials);
        setImportSummary(result);
        return;
      }

      const message = result.imported
        ? `Erfolgreich importiert: ${result.imported} Events${result.tasksImported ? ` und ${result.tasksImported} Aufgaben` : ''}`
        : 'Import abgeschlossen';
      alert(message);
      onSuccess(result);
    } catch (error: any) {
      console.error('Import error:', error);
      alert(error.response?.data?.error || 'Fehler beim Importieren');
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getTitleText = () => {
    if (type === 'users') return 'Mitarbeiter importieren';
    if (type === 'events') return 'Events importieren';
    if (type === 'tasks') return 'Aufgaben importieren';
    return 'Importieren';
  };

  const copyHeader = async () => {
    try {
      await navigator.clipboard.writeText(FORMATS[type].header);
      alert('Kopfzeile kopiert');
    } catch {
      alert('Kopieren nicht möglich - bitte von Hand übernehmen');
    }
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    const text = credentials.map(c => `${c.name}\t${c.password}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert('Zugangsdaten in die Zwischenablage kopiert');
    } catch {
      alert('Kopieren nicht möglich - bitte die Liste von Hand übernehmen');
    }
  };

  const downloadCredentials = () => {
    if (!credentials) return;
    const csvField = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = ['name,password', ...credentials.map(c => `${csvField(c.name)},${csvField(c.password)}`)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zugangsdaten.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  /*
   * Nach dem Import: die Zugangsdaten stehen NUR hier. Wird dieser Dialog
   * geschlossen, sind die zufaellig erzeugten Passwoerter nicht wieder
   * herstellbar - gespeichert ist nur der Hash. Deshalb ein eigener Schritt
   * mit ausdruecklichem Schliessen statt einer beilaeufigen Meldung.
   */
  if (credentials) {
    const erzeugt = credentials.filter(c => c.generated).length;
    return (
      <div className="app-modal-overlay" style={styles.overlay}>
        <div className="app-modal" style={styles.modal}>
          <h2 style={styles.title}>Zugangsdaten</h2>

          <p style={styles.credHint}>
            {credentials.length === 1
              ? '1 Konto wurde angelegt.'
              : `${credentials.length} Konten wurden angelegt.`}
            {erzeugt > 0 && ' Die erzeugten Passwörter sind nur hier zu sehen - danach nicht mehr.'}
          </p>

          <div style={styles.credList}>
            {credentials.map((c, idx) => (
              <div key={idx} style={styles.credRow}>
                <span style={styles.credName}>{c.name}</span>
                <code style={styles.credPassword}>{c.password}</code>
                {!c.generated && <span style={styles.credOwn}>aus der Datei</span>}
              </div>
            ))}
          </div>

          {importSummary?.skipped > 0 && (
            <p style={styles.credNote}>
              {importSummary.skipped} bereits vorhandene {importSummary.skipped === 1 ? 'Person wurde' : 'Personen wurden'} übersprungen -
              deren Passwörter bleiben unverändert.
            </p>
          )}

          {importSummary?.rejected?.length > 0 && (
            <div style={styles.credNote}>
              <strong>Nicht angelegt:</strong>
              <ul style={styles.credRejected}>
                {importSummary.rejected.map((r: any, idx: number) => (
                  <li key={idx}>{r.name} - {r.reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="app-modal-actions" style={styles.buttons}>
            <button onClick={copyCredentials} style={styles.cancelButton}>
              Kopieren
            </button>
            <button onClick={downloadCredentials} style={styles.cancelButton}>
              Als CSV speichern
            </button>
            <button
              onClick={() => { onSuccess(importSummary); }}
              style={styles.importButton}
            >
              Fertig
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-modal-overlay" style={styles.overlay} onClick={handleOverlayClick}>
      <div className="app-modal" style={styles.modal}>
        <h2 style={styles.title}>{getTitleText()}</h2>

        <div style={styles.uploadSection}>
          <label style={styles.fileLabel}>
            {type === 'events' ? 'Events CSV-Datei:' : 'CSV-Datei:'}
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={styles.fileInput}
          />
          {file && <p style={styles.fileName}>{file.name}</p>}
        </div>

        {/*
          Welche Spalten erwartet werden, stand bisher nirgends - man musste
          es raten oder erst exportieren. Kopfzeile zum Kopieren, damit man
          direkt loslegen kann.
        */}
        <div style={styles.formatBox}>
          <div style={styles.formatHeader}>
            <span style={styles.formatTitle}>Erwartete Spalten</span>
            <button type="button" onClick={copyHeader} style={styles.formatCopy}>
              Kopfzeile kopieren
            </button>
          </div>
          <code style={styles.formatCode}>{FORMATS[type].header}</code>
          <ul style={styles.formatList}>
            {FORMATS[type].columns.map(col => (
              <li key={col.name} style={styles.formatItem}>
                <code style={styles.formatName}>{col.name}</code>
                <span style={styles.formatDesc}>
                  {col.required ? '' : '(optional) '}{col.hint}
                </span>
              </li>
            ))}
          </ul>
          <p style={styles.formatNote}>{FORMATS[type].note}</p>
        </div>

        {type === 'events' && (
          <div style={styles.uploadSection}>
            <label style={styles.fileLabel}>
              Aufgaben CSV-Datei (optional):
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setTasksFile(e.target.files?.[0] || null)}
              style={styles.fileInput}
            />
            {tasksFile && <p style={styles.fileName}>{tasksFile.name}</p>}
            <p style={styles.helperText}>
              Importiert Aufgaben für die Events (event_id muss mit der Event-ID übereinstimmen)
            </p>
          </div>
        )}

        {type === 'events' && isAdmin && (
          <label style={styles.templateOption}>
            <input
              type="checkbox"
              checked={importAsTemplate}
              onChange={(e) => setImportAsTemplate(e.target.checked)}
              style={styles.checkbox}
            />
            <span>Als Vorlage importieren (ohne Startdatum)</span>
          </label>
        )}

        {preview && (
          <>
            <div style={styles.previewHeader}>
              <h3 style={styles.previewTitle}>
                Vorschau ({preview.total} Einträge gefunden)
              </h3>
              <button onClick={handleSelectAll} style={styles.selectAllButton}>
                {selectedItems.length === preview.items.length ? 'Alle abwählen' : 'Alle auswählen'}
              </button>
            </div>

            <div style={styles.previewList}>
              {preview.items.map((item, idx) => (
                <label key={idx} style={styles.previewItem}>
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(idx)}
                    onChange={() => handleToggleItem(idx)}
                    style={styles.checkbox}
                  />
                  <span style={styles.previewText}>
                    {type === 'users' && `${item.name} (${item.role})`}
                    {type === 'events' && `${item.name} - ${item.days} Tage`}
                    {type === 'tasks' && `${item.title} - Tag ${item.day_number}`}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="app-modal-actions" style={styles.buttons}>
          <button onClick={onClose} style={styles.cancelButton} disabled={loading}>
            Abbrechen
          </button>
          <button
            onClick={handleImport}
            style={styles.importButton}
            disabled={loading || !file || selectedItems.length === 0}
          >
            {loading ? 'Importiere...' : `${selectedItems.length} Einträge importieren`}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  formatBox: {
    marginBottom: '1.5rem',
    padding: '0.875rem',
    backgroundColor: 'var(--c-surface-muted)',
    border: '1px solid var(--c-border)',
    borderRadius: '6px',
  },
  formatHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  formatTitle: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--c-text)',
  },
  formatCopy: {
    padding: '0.25rem 0.625rem',
    backgroundColor: 'var(--c-surface)',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  formatCode: {
    display: 'block',
    padding: '0.375rem 0.5rem',
    marginBottom: '0.625rem',
    backgroundColor: 'var(--c-surface)',
    border: '1px solid var(--c-border)',
    borderRadius: '4px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.75rem',
    color: 'var(--c-text)',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
  },
  formatList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  formatItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
    fontSize: '0.75rem',
    flexWrap: 'wrap',
  },
  formatName: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontWeight: 600,
    color: 'var(--c-accent-text)',
  },
  formatDesc: {
    color: 'var(--c-text-muted)',
  },
  formatNote: {
    marginTop: '0.625rem',
    fontSize: '0.75rem',
    color: 'var(--c-text-muted)',
  },
  credHint: {
    marginBottom: '1rem',
    color: 'var(--c-text-muted)',
  },
  credList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.75rem',
    marginBottom: '1rem',
    maxHeight: '16rem',
    overflowY: 'auto',
    backgroundColor: 'var(--c-surface-muted)',
    borderRadius: '6px',
  },
  credRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
    fontSize: '0.875rem',
  },
  credName: {
    flex: '1 1 auto',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  credPassword: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontWeight: 600,
    color: 'var(--c-text)',
  },
  credOwn: {
    fontSize: '0.75rem',
    color: 'var(--c-text-subtle)',
  },
  credNote: {
    marginBottom: '1rem',
    fontSize: '0.8125rem',
    color: 'var(--c-text-muted)',
  },
  credRejected: {
    margin: '0.25rem 0 0 1rem',
    padding: 0,
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'var(--c-overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'var(--c-surface)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: 'var(--c-text)',
  },
  uploadSection: {
    marginBottom: '1.5rem',
  },
  fileLabel: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: 'var(--c-text)',
    marginBottom: '0.5rem',
  },
  fileInput: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
  },
  fileName: {
    marginTop: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
  },
  helperText: {
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--c-text-muted)',
    fontStyle: 'italic',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  previewTitle: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: 'var(--c-text)',
    margin: 0,
  },
  selectAllButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    color: 'var(--c-text)',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  previewList: {
    maxHeight: '300px',
    overflow: 'auto',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    padding: '0.5rem',
    marginBottom: '1.5rem',
  },
  previewItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem',
    cursor: 'pointer',
    borderBottom: '1px solid var(--c-surface-muted)',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  previewText: {
    fontSize: '0.875rem',
    color: 'var(--c-text)',
  },
  buttons: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  importButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  templateOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--c-accent-soft)',
    border: '1px solid var(--c-accent-soft)',
    borderRadius: '4px',
    marginBottom: '1rem',
    cursor: 'pointer',
    color: 'var(--c-text)',
  },
};
