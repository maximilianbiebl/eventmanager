import React, { useState } from 'react';
import { usersApi } from '../../api/users';
import { eventsApi } from '../../api/events';
import { tasksApi } from '../../api/tasks';

interface Props {
  type: 'users' | 'events' | 'tasks';
  items: any[];
  selectedIds: number[];
  onClose: () => void;
  onSuccess: () => void;
  eventId?: number; // For tasks export
}

export const CSVExportModal: React.FC<Props> = ({ type, items, selectedIds, onClose, onSuccess, eventId }) => {
  const [exportType, setExportType] = useState<'all' | 'selected'>('all');
  const [loading, setLoading] = useState(false);
  const [includeTasks, setIncludeTasks] = useState(false);

  const handleExport = async () => {
    if (exportType === 'selected' && selectedIds.length === 0) {
      alert('Bitte mindestens ein Element auswählen');
      return;
    }

    try {
      setLoading(true);
      const idsToExport = exportType === 'selected' ? selectedIds : undefined;

      if (type === 'users') {
        const blob = await usersApi.exportCSV(idsToExport);
        const filename = `users_${new Date().toISOString().split('T')[0]}.csv`;
        downloadBlob(blob, filename);
      } else if (type === 'events') {
        const response = await eventsApi.exportCSV(idsToExport, includeTasks);

        // Check if response is multi-csv format (for events with tasks)
        if (includeTasks && response instanceof Blob) {
          // Try to parse as JSON to check if it's multi-csv
          const text = await response.text();
          try {
            const json = JSON.parse(text);
            if (json.type === 'multi-csv' && json.files) {
              // Download each file
              json.files.forEach((file: any) => {
                const blob = new Blob([file.content], { type: file.mimeType });
                downloadBlob(blob, file.name);
              });
            } else {
              // Fallback to regular download
              const blob = new Blob([text], { type: 'application/json' });
              downloadBlob(blob, `events_full_${new Date().toISOString().split('T')[0]}.json`);
            }
          } catch {
            // Not JSON, treat as regular blob
            downloadBlob(response, `events_${new Date().toISOString().split('T')[0]}.csv`);
          }
        } else {
          // Regular CSV export
          const filename = `events_${new Date().toISOString().split('T')[0]}.csv`;
          downloadBlob(response, filename);
        }
      } else if (type === 'tasks' && eventId) {
        const blob = await tasksApi.exportCSV(eventId, idsToExport);
        const filename = `tasks_${new Date().toISOString().split('T')[0]}.csv`;
        downloadBlob(blob, filename);
      } else {
        throw new Error('Invalid export type');
      }

      onSuccess();
    } catch (error) {
      console.error('Export error:', error);
      alert('Fehler beim Exportieren');
    } finally {
      setLoading(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getTitleText = () => {
    if (type === 'users') return 'Mitarbeiter exportieren';
    if (type === 'events') return 'Events exportieren';
    if (type === 'tasks') return 'Aufgaben exportieren';
    return 'Exportieren';
  };

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal}>
        <h2 style={styles.title}>{getTitleText()}</h2>

        <div style={styles.options}>
          <label style={styles.option}>
            <input
              type="radio"
              value="all"
              checked={exportType === 'all'}
              onChange={(e) => setExportType(e.target.value as 'all')}
              style={styles.radio}
            />
            <span>
              Alle exportieren ({items.length} {type === 'users' ? 'Mitarbeiter' : type === 'events' ? 'Events' : 'Aufgaben'})
            </span>
          </label>

          <label style={styles.option}>
            <input
              type="radio"
              value="selected"
              checked={exportType === 'selected'}
              onChange={(e) => setExportType(e.target.value as 'selected')}
              style={styles.radio}
            />
            <span>
              Nur ausgewählte exportieren ({selectedIds.length} ausgewählt)
            </span>
          </label>
        </div>

        {type === 'events' && (
          <label style={styles.fullExportOption}>
            <input
              type="checkbox"
              checked={includeTasks}
              onChange={(e) => setIncludeTasks(e.target.checked)}
              style={styles.checkbox}
            />
            <div>
              <span style={{ fontWeight: '500' }}>Mit Aufgaben exportieren</span>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                Exportiert Events und Aufgaben als zwei separate CSV-Dateien
              </p>
            </div>
          </label>
        )}

        <div style={styles.buttons}>
          <button onClick={onClose} style={styles.cancelButton} disabled={loading}>
            Abbrechen
          </button>
          <button onClick={handleExport} style={styles.exportButton} disabled={loading}>
            {loading ? 'Exportiere...' : 'Exportieren'}
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
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#FFFFFF',
    border: '1px solid #CBD5E1',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '500px',
    width: '90%',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: '#1E293B',
  },
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginBottom: '2rem',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    border: '1px solid #CBD5E1',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  radio: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  buttons: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: 'transparent',
    color: '#1E293B',
    border: '1px solid #CBD5E1',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  exportButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#1E40AF',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  fullExportOption: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    backgroundColor: '#EFF6FF',
    border: '1px solid #DBEAFE',
    borderRadius: '4px',
    marginBottom: '1.5rem',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    marginTop: '2px',
  },
};
