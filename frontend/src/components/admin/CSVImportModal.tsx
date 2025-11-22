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

interface ImportPreview {
  total: number;
  items: any[];
  errors: string[];
}

export const CSVImportModal: React.FC<Props> = ({ type, onClose, onSuccess, eventId }) => {
  const { isAdmin } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [importAsTemplate, setImportAsTemplate] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    // Parse CSV for preview
    try {
      const text = await selectedFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        alert('CSV-Datei ist leer');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const items = lines.slice(1).map((line, idx) => {
        const values = line.split(',').map(v => v.trim());
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
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
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
        result = await eventsApi.importCSV(filteredFile, importAsTemplate);
      } else if (type === 'tasks' && eventId) {
        result = await tasksApi.importCSV(eventId, filteredFile);
      } else {
        throw new Error('Invalid import type');
      }

      alert(`Erfolgreich importiert: ${result.imported || 0} Einträge`);
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

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal}>
        <h2 style={styles.title}>{getTitleText()}</h2>

        <div style={styles.uploadSection}>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={styles.fileInput}
          />
          {file && <p style={styles.fileName}>{file.name}</p>}
        </div>

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

        <div style={styles.buttons}>
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
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
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
    color: '#1f2937',
  },
  uploadSection: {
    marginBottom: '1.5rem',
  },
  fileInput: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
  },
  fileName: {
    marginTop: '0.5rem',
    fontSize: '0.875rem',
    color: '#6b7280',
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
    color: '#374151',
    margin: 0,
  },
  selectAllButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  previewList: {
    maxHeight: '300px',
    overflow: 'auto',
    border: '1px solid #e5e7eb',
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
    borderBottom: '1px solid #f3f4f6',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  previewText: {
    fontSize: '0.875rem',
    color: '#374151',
  },
  buttons: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  importButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#8b5cf6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  templateOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    backgroundColor: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '4px',
    marginBottom: '1rem',
    cursor: 'pointer',
  },
};
