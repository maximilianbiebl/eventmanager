import React, { useState, useEffect } from 'react';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
import { User } from '../../api/users';
import client from '../../api/client';

interface Props {
  eventId: number;
  onClose: () => void;
  onSeriesCreated?: () => void;
}

export const TaskSeriesModal: React.FC<Props> = ({ eventId, onClose, onSeriesCreated }) => {
  const [series, setSeries] = useState<TaskSeries[]>([]);
  const [eventStaff, setEventStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [newSeriesDescription, setNewSeriesDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [expandedSeriesId, setExpandedSeriesId] = useState<number | null>(null);
  const [seriesMembers, setSeriesMembers] = useState<{ [key: number]: any[] }>({});

  useEffect(() => {
    loadData();
  }, [eventId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [seriesData, eventStaffData, allUsersData] = await Promise.all([
        taskSeriesApi.getByEvent(eventId),
        client.get(`/users/event/${eventId}/staff`).then(res => res.data).catch(() => []),
        client.get('/users').then(res => res.data),
      ]);

      // Combine event staff with admins and teamleiters (who are automatically in the pool)
      const eventStaffIds = new Set(eventStaffData.map((u: User) => u.id));
      const availableStaff = allUsersData.filter((u: User) =>
        eventStaffIds.has(u.id) || u.role === 'admin' || u.role === 'teamleiter' || u.role === 'co_teamleiter'
      );

      setSeries(seriesData);
      setEventStaff(availableStaff);
    } catch (error) {
      console.error('Load series data error:', error);
      alert('Fehler beim Laden der Serien');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSeries = async () => {
    if (!newSeriesName.trim()) {
      alert('Bitte einen Namen eingeben');
      return;
    }

    try {
      await taskSeriesApi.create({
        event_id: eventId,
        name: newSeriesName,
        description: newSeriesDescription || undefined,
        member_ids: selectedMembers.length > 0 ? selectedMembers : undefined,
      });

      setNewSeriesName('');
      setNewSeriesDescription('');
      setSelectedMembers([]);
      setShowCreateForm(false);
      await loadData();
      if (onSeriesCreated) {
        onSeriesCreated();
      }
      alert('Serie erfolgreich erstellt');
    } catch (error) {
      console.error('Create series error:', error);
      alert('Fehler beim Erstellen der Serie');
    }
  };

  const handleDeleteSeries = async (seriesId: number) => {
    if (!confirm('Serie wirklich löschen? Aufgaben werden nicht gelöscht, nur die Serie-Zuordnung.')) {
      return;
    }

    try {
      await taskSeriesApi.delete(seriesId);
      await loadData();
      alert('Serie gelöscht');
    } catch (error) {
      console.error('Delete series error:', error);
      alert('Fehler beim Löschen');
    }
  };

  const handleToggleExpand = async (seriesId: number) => {
    if (expandedSeriesId === seriesId) {
      setExpandedSeriesId(null);
    } else {
      setExpandedSeriesId(seriesId);
      if (!seriesMembers[seriesId]) {
        try {
          const members = await taskSeriesApi.getMembers(seriesId);
          setSeriesMembers(prev => ({ ...prev, [seriesId]: members }));
        } catch (error) {
          console.error('Load series members error:', error);
        }
      }
    }
  };

  const handleToggleMember = (userId: number) => {
    setSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Aufgaben-Serien verwalten</h2>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        <p style={styles.description}>
          Erstellen Sie Serien für wiederkehrende Aufgaben. Alle Aufgaben einer Serie können
          einem gemeinsamen Team zugewiesen werden.
        </p>

        {loading ? (
          <div style={styles.loading}>Lade Serien...</div>
        ) : (
          <>
            {!showCreateForm ? (
              <button onClick={() => setShowCreateForm(true)} style={styles.createButton}>
                + Neue Serie erstellen
              </button>
            ) : (
              <div style={styles.createForm}>
                <h3 style={styles.formTitle}>Neue Serie erstellen</h3>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Name der Serie *</label>
                  <input
                    type="text"
                    value={newSeriesName}
                    onChange={(e) => setNewSeriesName(e.target.value)}
                    placeholder="z.B. Setup Team, Breakdown Team"
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Beschreibung (optional)</label>
                  <textarea
                    value={newSeriesDescription}
                    onChange={(e) => setNewSeriesDescription(e.target.value)}
                    rows={2}
                    style={styles.textarea}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Team-Mitglieder (optional)</label>
                  {eventStaff.length === 0 ? (
                    <p style={styles.hint}>Noch keine Mitarbeiter im Event-Pool</p>
                  ) : (
                    <div style={styles.membersList}>
                      {eventStaff.map((staff) => (
                        <label key={staff.id} style={styles.memberCheckbox}>
                          <input
                            type="checkbox"
                            checked={selectedMembers.includes(staff.id)}
                            onChange={() => handleToggleMember(staff.id)}
                            style={styles.checkbox}
                          />
                          <span>{staff.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div style={styles.formButtons}>
                  <button onClick={() => setShowCreateForm(false)} style={styles.cancelButton}>
                    Abbrechen
                  </button>
                  <button onClick={handleCreateSeries} style={styles.submitButton}>
                    Serie erstellen
                  </button>
                </div>
              </div>
            )}

            {series.length === 0 ? (
              <div style={styles.emptyState}>
                <p>Noch keine Serien erstellt.</p>
                <p style={styles.hint}>Erstellen Sie Serien für wiederkehrende Aufgaben wie Setup, Breakdown, etc.</p>
              </div>
            ) : (
              <div style={styles.seriesList}>
                <h3 style={styles.sectionTitle}>Bestehende Serien</h3>
                {series.map((s) => (
                  <div key={s.id} style={styles.seriesCard}>
                    <div style={styles.seriesHeader} onClick={() => handleToggleExpand(s.id)}>
                      <div style={styles.seriesInfo}>
                        <span style={styles.seriesName}>{s.name}</span>
                        <span style={styles.seriesMeta}>
                          {s.task_count || 0} Aufgabe(n) · {s.member_count || 0} Mitglied(er)
                        </span>
                      </div>
                      <div style={styles.seriesActions}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSeries(s.id);
                          }}
                          style={styles.deleteButton}
                        >
                          Löschen
                        </button>
                        <span style={styles.expandIcon}>
                          {expandedSeriesId === s.id ? '▼' : '▶'}
                        </span>
                      </div>
                    </div>
                    {expandedSeriesId === s.id && (
                      <div style={styles.seriesDetails}>
                        {s.description && (
                          <p style={styles.seriesDescription}>{s.description}</p>
                        )}
                        <div style={styles.membersSection}>
                          <strong>Team-Mitglieder:</strong>
                          {seriesMembers[s.id] && seriesMembers[s.id].length > 0 ? (
                            <ul style={styles.memberList}>
                              {seriesMembers[s.id].map((member) => (
                                <li key={member.id}>{member.name}</li>
                              ))}
                            </ul>
                          ) : (
                            <p style={styles.hint}>Keine Mitglieder zugewiesen</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.footerButton}>
            Schließen
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
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    margin: 0,
    color: '#1f2937',
  },
  closeButton: {
    padding: '0.25rem 0.5rem',
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1.5rem',
    lineHeight: 1,
  },
  description: {
    color: '#6b7280',
    fontSize: '0.875rem',
    marginBottom: '1.5rem',
  },
  loading: {
    padding: '2rem',
    textAlign: 'center',
    color: '#6b7280',
  },
  createButton: {
    padding: '0.75rem 1.25rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '500',
    marginBottom: '1.5rem',
  },
  createForm: {
    padding: '1.5rem',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    marginBottom: '1.5rem',
  },
  formTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: '#1f2937',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '1rem',
  },
  textarea: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '1rem',
    resize: 'vertical',
  },
  membersList: {
    maxHeight: '150px',
    overflow: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    padding: '0.5rem',
  },
  memberCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  hint: {
    fontSize: '0.875rem',
    color: '#6b7280',
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
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  submitButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  emptyState: {
    textAlign: 'center',
    padding: '2rem',
    color: '#6b7280',
  },
  seriesList: {
    marginTop: '1.5rem',
  },
  sectionTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: '#1f2937',
  },
  seriesCard: {
    border: '1px solid #e5e7eb',
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
    backgroundColor: '#f9fafb',
  },
  seriesInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  seriesName: {
    fontWeight: '600',
    color: '#1f2937',
  },
  seriesMeta: {
    fontSize: '0.875rem',
    color: '#6b7280',
  },
  seriesActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  deleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  expandIcon: {
    color: '#6b7280',
    fontSize: '0.875rem',
  },
  seriesDetails: {
    padding: '1rem',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: 'white',
  },
  seriesDescription: {
    marginBottom: '1rem',
    color: '#4b5563',
  },
  membersSection: {
    marginTop: '0.75rem',
  },
  memberList: {
    marginTop: '0.5rem',
    marginLeft: '1.5rem',
    color: '#4b5563',
  },
  footer: {
    marginTop: '1.5rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  footerButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
};
