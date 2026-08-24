import React, { useState, useEffect } from 'react';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
import { User } from '../../api/users';
import client from '../../api/client';
import { Toast } from '../Toast';

interface Task {
  id: number;
  title: string;
  day_number: number;
  series_id: number | null;
}

interface Props {
  eventId: number;
  onClose: () => void;
  onSeriesCreated?: () => void;
}

export const TaskSeriesModal: React.FC<Props> = ({ eventId, onClose, onSeriesCreated }) => {
  const [series, setSeries] = useState<TaskSeries[]>([]);
  const [eventStaff, setEventStaff] = useState<User[]>([]);
  const [eventTasks, setEventTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [newSeriesDescription, setNewSeriesDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [expandedSeriesId, setExpandedSeriesId] = useState<number | null>(null);
  const [seriesMembers, setSeriesMembers] = useState<{ [key: number]: any[] }>({});
  const [seriesTasks, setSeriesTasks] = useState<{ [key: number]: Task[] }>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [editingSeriesId, setEditingSeriesId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSelectedMembers, setEditSelectedMembers] = useState<number[]>([]);
  const [editSelectedTasks, setEditSelectedTasks] = useState<number[]>([]);

  useEffect(() => {
    loadData();
  }, [eventId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [seriesData, eventStaffData, allUsersData, tasksData] = await Promise.all([
        taskSeriesApi.getByEvent(eventId),
        client.get(`/users/event/${eventId}/staff`).then(res => res.data).catch(() => []),
        client.get('/users').then(res => res.data),
        client.get(`/tasks/event/${eventId}`).then(res => res.data).catch(() => []),
      ]);

      // Combine event staff with admins and teamleiters (who are automatically in the pool)
      const eventStaffIds = new Set(eventStaffData.map((u: User) => u.id));
      const availableStaff = allUsersData.filter((u: User) =>
        eventStaffIds.has(u.id) || u.role === 'admin' || u.role === 'teamleiter' || u.role === 'co_teamleiter'
      );

      setSeries(seriesData);
      setEventStaff(availableStaff);
      setEventTasks(tasksData);
    } catch (error) {
      console.error('Load series data error:', error);
      setToast({ message: 'Fehler beim Laden der Serien', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSeries = async () => {
    if (!newSeriesName.trim()) {
      setToast({ message: 'Bitte einen Namen eingeben', type: 'error' });
      return;
    }

    try {
      const newSeries = await taskSeriesApi.create({
        event_id: eventId,
        name: newSeriesName,
        description: newSeriesDescription || undefined,
        member_ids: selectedMembers.length > 0 ? selectedMembers : undefined,
      });

      // Link selected tasks to the new series
      if (selectedTasks.length > 0) {
        await Promise.all(
          selectedTasks.map(taskId =>
            client.put(`/tasks/${taskId}`, { series_id: newSeries.id })
          )
        );
      }

      setNewSeriesName('');
      setNewSeriesDescription('');
      setSelectedMembers([]);
      setSelectedTasks([]);
      setShowCreateForm(false);
      await loadData();
      if (onSeriesCreated) {
        onSeriesCreated();
      }
      setToast({ message: 'Serie erfolgreich erstellt', type: 'success' });
    } catch (error) {
      console.error('Create series error:', error);
      setToast({ message: 'Fehler beim Erstellen der Serie', type: 'error' });
    }
  };

  const handleDeleteSeries = async (seriesId: number) => {
    if (!confirm('Serie wirklich löschen? Aufgaben werden nicht gelöscht, nur die Serie-Zuordnung.')) {
      return;
    }

    try {
      await taskSeriesApi.delete(seriesId);
      await loadData();
      if (onSeriesCreated) {
        onSeriesCreated();
      }
      setToast({ message: 'Serie gelöscht', type: 'success' });
    } catch (error) {
      console.error('Delete series error:', error);
      setToast({ message: 'Fehler beim Löschen', type: 'error' });
    }
  };

  const handleToggleExpand = async (seriesId: number) => {
    if (expandedSeriesId === seriesId) {
      setExpandedSeriesId(null);
    } else {
      setExpandedSeriesId(seriesId);
      // Load members and tasks using getById which returns everything
      if (!seriesMembers[seriesId] || !seriesTasks[seriesId]) {
        try {
          console.log('Loading series details for:', seriesId);
          const details = await taskSeriesApi.getById(seriesId);
          console.log('Series details received:', details);
          console.log('Members:', details.members);
          console.log('Tasks:', details.tasks);
          setSeriesMembers(prev => ({ ...prev, [seriesId]: details.members || [] }));
          setSeriesTasks(prev => ({ ...prev, [seriesId]: (details.tasks || []).map(t => ({ ...t, series_id: seriesId })) }));
        } catch (err) {
          console.error('Load series details error:', err);
          // Set empty arrays to show "keine" message
          setSeriesMembers(prev => ({ ...prev, [seriesId]: [] }));
          setSeriesTasks(prev => ({ ...prev, [seriesId]: [] }));
        }
      }
    }
  };

  const handleToggleMember = (userId: number) => {
    setSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleTask = (taskId: number) => {
    setSelectedTasks(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const handleStartEdit = async (s: TaskSeries) => {
    setEditingSeriesId(s.id);
    setEditName(s.name);
    setEditDescription(s.description || '');

    // Load current members and tasks for this series
    try {
      const details = await taskSeriesApi.getById(s.id);
      setEditSelectedMembers(details.members?.map(m => m.id) || []);
      setEditSelectedTasks(details.tasks?.map(t => t.id) || []);
    } catch (err) {
      setEditSelectedMembers([]);
      setEditSelectedTasks([]);
    }
  };

  const handleCancelEdit = () => {
    setEditingSeriesId(null);
    setEditName('');
    setEditDescription('');
    setEditSelectedMembers([]);
    setEditSelectedTasks([]);
  };

  const handleSaveEdit = async () => {
    if (!editingSeriesId || !editName.trim()) {
      setToast({ message: 'Bitte einen Namen eingeben', type: 'error' });
      return;
    }

    try {
      // Update series name/description
      await taskSeriesApi.update(editingSeriesId, {
        name: editName,
        description: editDescription || undefined,
      });

      // Get current members and tasks
      const details = await taskSeriesApi.getById(editingSeriesId);
      const currentMemberIds = details.members?.map(m => m.id) || [];
      const currentTaskIds = details.tasks?.map(t => t.id) || [];

      // Add new members
      const membersToAdd = editSelectedMembers.filter(id => !currentMemberIds.includes(id));
      if (membersToAdd.length > 0) {
        await taskSeriesApi.addMembers(editingSeriesId, membersToAdd);
      }

      // Remove old members
      const membersToRemove = currentMemberIds.filter(id => !editSelectedMembers.includes(id));
      for (const userId of membersToRemove) {
        await taskSeriesApi.removeMember(editingSeriesId, userId);
      }

      // Update tasks - add series_id to new tasks
      const tasksToAdd = editSelectedTasks.filter(id => !currentTaskIds.includes(id));
      for (const taskId of tasksToAdd) {
        await client.put(`/tasks/${taskId}`, { series_id: editingSeriesId });
      }

      // Remove series_id from tasks no longer in series
      const tasksToRemove = currentTaskIds.filter(id => !editSelectedTasks.includes(id));
      for (const taskId of tasksToRemove) {
        await client.put(`/tasks/${taskId}`, { series_id: null });
      }

      // Clear edit state and reload
      handleCancelEdit();
      // Clear cached data so it reloads
      setSeriesMembers(prev => {
        const newState = { ...prev };
        delete newState[editingSeriesId];
        return newState;
      });
      setSeriesTasks(prev => {
        const newState = { ...prev };
        delete newState[editingSeriesId];
        return newState;
      });
      await loadData();
      if (onSeriesCreated) {
        onSeriesCreated();
      }
      setToast({ message: 'Serie aktualisiert', type: 'success' });
    } catch (error) {
      console.error('Save edit error:', error);
      setToast({ message: 'Fehler beim Speichern', type: 'error' });
    }
  };

  const handleToggleEditMember = (userId: number) => {
    setEditSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleEditTask = (taskId: number) => {
    setEditSelectedTasks(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
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
                Neue Serie erstellen
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
                <div style={styles.formGroup}>
                  <label style={styles.label}>Aufgaben verknüpfen (optional)</label>
                  {eventTasks.filter(t => !t.series_id).length === 0 ? (
                    <p style={styles.hint}>Keine unverknüpften Aufgaben vorhanden</p>
                  ) : (
                    <div style={styles.membersList}>
                      {eventTasks
                        .filter(t => !t.series_id)
                        .map((task) => (
                          <label key={task.id} style={styles.memberCheckbox}>
                            <input
                              type="checkbox"
                              checked={selectedTasks.includes(task.id)}
                              onChange={() => handleToggleTask(task.id)}
                              style={styles.checkbox}
                            />
                            <span>Tag {task.day_number}: {task.title}</span>
                          </label>
                        ))}
                    </div>
                  )}
                </div>
                <div style={styles.formButtons}>
                  <button onClick={() => { setShowCreateForm(false); setSelectedTasks([]); setSelectedMembers([]); }} style={styles.cancelButton}>
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
                    {editingSeriesId === s.id ? (
                      <div style={styles.createForm}>
                        <h3 style={styles.formTitle}>Serie bearbeiten</h3>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Name der Serie *</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={styles.input}
                          />
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Beschreibung (optional)</label>
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={2}
                            style={styles.textarea}
                          />
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Team-Mitglieder</label>
                          <div style={styles.membersList}>
                            {eventStaff.map((staff) => (
                              <label key={staff.id} style={styles.memberCheckbox}>
                                <input
                                  type="checkbox"
                                  checked={editSelectedMembers.includes(staff.id)}
                                  onChange={() => handleToggleEditMember(staff.id)}
                                  style={styles.checkbox}
                                />
                                <span>{staff.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Verknüpfte Aufgaben</label>
                          <div style={styles.membersList}>
                            {eventTasks.map((task) => (
                              <label key={task.id} style={styles.memberCheckbox}>
                                <input
                                  type="checkbox"
                                  checked={editSelectedTasks.includes(task.id)}
                                  onChange={() => handleToggleEditTask(task.id)}
                                  style={styles.checkbox}
                                />
                                <span>Tag {task.day_number}: {task.title}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div style={styles.formButtons}>
                          <button onClick={handleCancelEdit} style={styles.cancelButton}>
                            Abbrechen
                          </button>
                          <button onClick={handleSaveEdit} style={styles.submitButton}>
                            Speichern
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
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
                                handleStartEdit(s);
                              }}
                              style={styles.editButton}
                            >
                              Bearbeiten
                            </button>
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
                            <div style={styles.membersSection}>
                              <strong>Verknüpfte Aufgaben:</strong>
                              {seriesTasks[s.id] && seriesTasks[s.id].length > 0 ? (
                                <ul style={styles.memberList}>
                                  {seriesTasks[s.id].map((task) => (
                                    <li key={task.id}>Tag {task.day_number}: {task.title}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p style={styles.hint}>Keine Aufgaben verknüpft</p>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="app-modal-actions" style={styles.footer}>
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
