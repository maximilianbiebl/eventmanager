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

  const handleExport = async () => {
    if (exportType === 'selected' && selectedIds.length === 0) {
      alert('Bitte mindestens ein Element auswählen');
      return;
    }

    try {
      setLoading(true);
      const idsToExport = exportType === 'selected' ? selectedIds : undefined;

      let blob: Blob;
      if (type === 'users') {
        blob = await usersApi.exportCSV(idsToExport);
      } else if (type === 'events') {
        blob = await eventsApi.exportCSV(idsToExport);
      } else if (type === 'tasks' && eventId) {
        blob = await tasksApi.exportCSV(eventId, idsToExport);
      } else {
        throw new Error('Invalid export type');
      }

      // Download file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      onSuccess();
    } catch (error) {
      console.error('Export error:', error);
      alert('Fehler beim Exportieren');
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
    maxWidth: '500px',
    width: '90%',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: '#1f2937',
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
    border: '1px solid #e5e7eb',
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
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  exportButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
};
