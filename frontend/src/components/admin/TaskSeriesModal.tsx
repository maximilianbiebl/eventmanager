import React, { useState } from 'react';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
import { Toast } from '../Toast';
import { GruppenPanel } from './GruppenPanel';
import { SerienPanel } from './SerienPanel';

interface Props {
  eventId: number;
  onClose: () => void;
  onSeriesCreated?: () => void;
  /** Für den Reiter "Aufgabengruppen" - wie viele Tage die Veranstaltung hat. */
  eventDays?: number;
  /** Wird gerufen, wenn sich an den Gruppen etwas geändert hat. */
  onGruppenGeaendert?: () => void;
}

export const TaskSeriesModal: React.FC<Props> = ({
  eventId, onClose, onSeriesCreated, eventDays = 1, onGruppenGeaendert,
}) => {
  /*
   * Zwei Reiter statt zweier Knöpfe in der Werkzeugleiste. Bewusst keine
   * Auswahlseite davor: ein Zwischenschritt kostet jeden Aufruf einen Klick,
   * und wer sich vertut, muss zurück.
   */
  const [reiter, setReiter] = useState<'serien' | 'gruppen'>('serien');
  /** Hochzaehlen laesst die Serienliste neu laden - etwa nach dem Loeschen. */
  const [serienStand, setSerienStand] = useState(0);
  const [deleteCandidate, setDeleteCandidate] = useState<TaskSeries | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  /*
   * Löschen ist nicht eine Entscheidung, sondern zwei: die Serie geht weg -
   * aber was passiert mit ihren Aufgaben und deren Zuweisungen? Deshalb ein
   * Dialog statt einer Rückfrage mit Ja/Nein.
   */
  const handleDeleteSeries = (series: TaskSeries) => {
    setDeleteCandidate(series);
  };

  const runDeleteSeries = async (mode: 'keep' | 'unassign' | 'delete_tasks') => {
    if (!deleteCandidate) return;
    try {
      await taskSeriesApi.delete(deleteCandidate.id, mode);
      setDeleteCandidate(null);
      setSerienStand((n) => n + 1);
      if (onSeriesCreated) {
        onSeriesCreated();
      }
      const done = {
        keep: 'Serie gelöscht, Aufgaben unverändert',
        unassign: 'Serie gelöscht, Zuweisungen aufgehoben',
        delete_tasks: 'Serie und Aufgaben gelöscht',
      }[mode];
      setToast({ message: done, type: 'success' });
    } catch (error) {
      console.error('Delete series error:', error);
      setToast({ message: 'Fehler beim Löschen', type: 'error' });
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="app-modal-overlay" style={styles.overlay} onClick={handleOverlayClick}>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className="app-modal" style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Serien &amp; Gruppen</h2>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        <div style={styles.reiterLeiste}>
          {([['serien', 'Serien'], ['gruppen', 'Aufgabengruppen']] as const).map(([wert, text]) => (
            <button
              key={wert}
              type="button"
              onClick={() => setReiter(wert)}
              style={{ ...styles.reiter, ...(reiter === wert ? styles.reiterAktiv : {}) }}
            >
              {text}
            </button>
          ))}
        </div>

        {reiter === 'gruppen' ? (
          <GruppenPanel eventId={eventId} eventDays={eventDays} onGeaendert={onGruppenGeaendert} />
        ) : (
          <SerienPanel
            eventId={eventId}
            onGeaendert={onSeriesCreated}
            onLoeschen={handleDeleteSeries}
            neuLaden={serienStand}
          />
        )}

        <div className="app-modal-actions" style={styles.footer}>
          <button onClick={onClose} style={styles.footerButton}>
            Schließen
          </button>
        </div>
      </div>

      {deleteCandidate && (
        <DeleteSeriesModal
          series={deleteCandidate}
          onClose={() => setDeleteCandidate(null)}
          onConfirm={runDeleteSeries}
        />
      )}
    </div>
  );
};

/*
 * Beim Löschen einer Serie ist die Serie selbst der harmlose Teil - die
 * Frage ist, was mit ihren Aufgaben und deren Zuweisungen passiert. Drei
 * Wege, von harmlos nach endgültig sortiert.
 */
interface DeleteSeriesModalProps {
  series: TaskSeries;
  onClose: () => void;
  onConfirm: (mode: 'keep' | 'unassign' | 'delete_tasks') => void | Promise<void>;
}

const DeleteSeriesModal: React.FC<DeleteSeriesModalProps> = ({ series, onClose, onConfirm }) => {
  const [mode, setMode] = useState<'keep' | 'unassign' | 'delete_tasks'>('keep');
  const [busy, setBusy] = useState(false);

  const taskCount = series.task_count || 0;
  const memberCount = series.member_count || 0;
  const tasksLabel = `${taskCount} Aufgabe${taskCount !== 1 ? 'n' : ''}`;

  const options: { value: typeof mode; title: string; hint: string }[] = [
    {
      value: 'keep',
      title: 'Nur die Serie auflösen',
      hint: `${tasksLabel} bleiben bestehen, die Zuweisungen ebenfalls - ab dann als normale Einzelzuweisungen.`,
    },
    {
      value: 'unassign',
      title: 'Zuweisungen aufheben',
      hint: `${tasksLabel} bleiben bestehen, verschwinden aber bei den ${memberCount} Mitgliedern und können neu vergeben werden.`,
    },
    {
      value: 'delete_tasks',
      title: 'Aufgaben mitlöschen',
      hint: `${tasksLabel} werden gelöscht. Das lässt sich nicht rückgängig machen.`,
    },
  ];

  const run = async () => {
    if (mode === 'delete_tasks' && !confirm(`${tasksLabel} endgültig löschen?`)) return;
    setBusy(true);
    try {
      await onConfirm(mode);
    } finally {
      setBusy(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="app-modal-overlay" style={{ ...styles.overlay, zIndex: 1002 }} onClick={handleOverlayClick}>
      <div className="app-modal" style={{ ...styles.modal, maxWidth: '540px' }}>
        <h2 style={styles.title}>Serie „{series.name}" löschen</h2>

        <p style={styles.deleteIntro}>
          {taskCount === 0
            ? 'Zu dieser Serie gehören keine Aufgaben.'
            : `Zu dieser Serie gehören ${tasksLabel}. Was soll damit geschehen?`}
        </p>

        {taskCount > 0 && (
          <div style={styles.optionList}>
            {options.map(o => (
              <label
                key={o.value}
                style={{
                  ...styles.option,
                  borderColor: mode === o.value ? 'var(--c-accent)' : 'var(--c-border)',
                  backgroundColor: mode === o.value ? 'var(--c-accent-soft)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="delete-series-mode"
                  checked={mode === o.value}
                  onChange={() => setMode(o.value)}
                  style={styles.optionRadio}
                />
                <span>
                  <span style={styles.optionTitle}>{o.title}</span>
                  <span style={styles.optionHint}>{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="app-modal-actions" style={styles.footer}>
          <button onClick={onClose} style={styles.footerButton} disabled={busy}>
            Abbrechen
          </button>
          <button onClick={run} style={styles.confirmDeleteButton} disabled={busy}>
            Serie löschen
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  deleteIntro: {
    marginBottom: '1rem',
    color: 'var(--c-text-muted)',
  },
  optionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  option: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.75rem',
    border: '1px solid var(--c-border)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, background-color 0.15s ease',
  },
  optionRadio: {
    width: '18px',
    height: '18px',
    marginTop: '0.125rem',
    flex: '0 0 auto',
    cursor: 'pointer',
  },
  optionTitle: {
    display: 'block',
    fontWeight: 600,
    fontSize: '0.9375rem',
    marginBottom: '0.125rem',
  },
  optionHint: {
    display: 'block',
    fontSize: '0.8125rem',
    color: 'var(--c-text-muted)',
    lineHeight: 1.4,
  },
  confirmDeleteButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: 'var(--c-danger)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.9375rem',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
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
    maxWidth: '700px',
    width: '90%',
    maxHeight: '85vh',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  reiterLeiste: {
    display: 'flex',
    gap: '0.25rem',
    borderBottom: '1px solid var(--c-border)',
    marginBottom: '1rem',
  },
  reiter: {
    padding: '0.5rem 0.875rem',
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-1px',
    cursor: 'pointer',
  },
  reiterAktiv: {
    color: 'var(--c-accent-text)',
    borderBottomColor: 'var(--c-accent)',
    fontWeight: 600,
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    margin: 0,
    color: 'var(--c-text)',
  },
  closeButton: {
    padding: '0.25rem 0.5rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text-muted)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1.5rem',
    lineHeight: 1,
  },
  description: {
    color: 'var(--c-text-muted)',
    fontSize: '0.875rem',
    marginBottom: '1.5rem',
  },
  loading: {
    padding: '2rem',
    textAlign: 'center',
    color: 'var(--c-text-muted)',
  },
  createButton: {
    padding: '0.75rem 1.25rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '500',
    marginBottom: '1.5rem',
    transition: 'background-color 0.2s',
  },
  createForm: {
    padding: '1.5rem',
    backgroundColor: 'var(--c-surface-muted)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '6px',
    marginBottom: '1.5rem',
  },
  formTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: 'var(--c-text)',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: 'var(--c-text)',
  },
  input: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    fontSize: '1rem',
    color: 'var(--c-text)',
  },
  textarea: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    fontSize: '1rem',
    color: 'var(--c-text)',
    resize: 'vertical',
  },
  membersList: {
    maxHeight: '150px',
    overflow: 'auto',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    padding: '0.5rem',
  },
  memberCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    cursor: 'pointer',
    color: 'var(--c-text)',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  hint: {
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
    fontStyle: 'italic',
  },
  formButtons: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
    marginTop: '1rem',
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
  submitButton: {
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
  emptyState: {
    textAlign: 'center',
    padding: '2rem',
    color: 'var(--c-text-muted)',
  },
  seriesList: {
    marginTop: '1.5rem',
  },
  sectionTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: 'var(--c-text)',
  },
  seriesCard: {
    border: '1px solid var(--c-border)',
    borderRadius: '6px',
    marginBottom: '0.75rem',
    overflow: 'hidden',
  },
  seriesHeader: {
    padding: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    backgroundColor: 'var(--c-surface-muted)',
  },
  seriesInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  seriesName: {
    fontWeight: '600',
    color: 'var(--c-text)',
  },
  seriesMeta: {
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
  },
  seriesActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  editButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-text-muted)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  deleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-danger)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  expandIcon: {
    color: 'var(--c-text-muted)',
    fontSize: '0.875rem',
  },
  seriesDetails: {
    padding: '1rem',
    borderTop: '1px solid var(--c-border)',
    backgroundColor: 'var(--c-surface)',
  },
  seriesDescription: {
    marginBottom: '1rem',
    color: 'var(--c-text-muted)',
  },
  membersSection: {
    marginTop: '0.75rem',
  },
  memberList: {
    marginTop: '0.5rem',
    marginLeft: '1.5rem',
    color: 'var(--c-text-muted)',
  },
  footer: {
    marginTop: '1.5rem',
    paddingTop: '1rem',
    borderTop: '1px solid var(--c-border)',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  footerButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: 'var(--c-surface-muted)',
    color: 'var(--c-text)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
};
