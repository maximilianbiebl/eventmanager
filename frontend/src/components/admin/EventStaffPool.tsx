import React, { useState, useEffect } from 'react';
import { usersApi, User } from '../../api/users';
import client from '../../api/client';

interface Props {
  eventId: number;
  reloadTrigger?: number; // Trigger für SSE-Updates
}

interface EventStaff extends User {
  isInPool?: boolean;
  taskCount?: number;
}

interface StaffTask {
  id: number;
  title: string;
  status: string;
  day_number: number;
  assignment_id: number;
  event_name: string;
  instance_number: number;
}

export const EventStaffPool: React.FC<Props> = ({ eventId, reloadTrigger }) => {
  const [allStaff, setAllStaff] = useState<EventStaff[]>([]);
  const [eventStaff, setEventStaff] = useState<EventStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStaffForTasks, setSelectedStaffForTasks] = useState<EventStaff | null>(null);
  const [staffTasks, setStaffTasks] = useState<StaffTask[]>([]);

  useEffect(() => {
    loadData();
  }, [eventId]);

  // React to SSE updates from parent component
  useEffect(() => {
    if (reloadTrigger !== undefined && reloadTrigger > 0) {
      loadData(false);
    }
  }, [reloadTrigger]);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const [allUsers, eventUsers, assignments] = await Promise.all([
        usersApi.getAll(),
        client.get(`/users/event/${eventId}/staff`).then(res => res.data),
        client.get(`/tasks/event/${eventId}/all-assignments`).then(res => res.data).catch(() => []),
      ]);

      // Zähle Task-Zuweisungen pro User
      const taskCounts: { [userId: number]: number } = {};
      assignments.forEach((assignment: any) => {
        if (assignment.user_id) {
          taskCounts[assignment.user_id] = (taskCounts[assignment.user_id] || 0) + 1;
        }
      });

      // Nur Mitarbeiter anzeigen
      const staffOnly = allUsers.filter(u => u.role === 'staff');

      // Markiere welche bereits im Pool sind und füge Task-Count hinzu
      const eventStaffIds = new Set(eventUsers.map((u: User) => u.id));
      const staffWithPoolStatus = staffOnly.map(staff => ({
        ...staff,
        isInPool: eventStaffIds.has(staff.id),
        taskCount: taskCounts[staff.id] || 0,
      }));

      // Event-Staff mit Task-Counts
      const eventStaffWithCounts = eventUsers.map((staff: User) => ({
        ...staff,
        taskCount: taskCounts[staff.id] || 0,
      }));

      setAllStaff(staffWithPoolStatus);
      setEventStaff(eventStaffWithCounts);
    } catch (error) {
      console.error('Load staff pool error:', error);
      setError('Fehler beim Laden der Mitarbeiter');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleAddStaff = async (userIds: number[]) => {
    try {
      await client.post(`/users/event/${eventId}/staff`, { user_ids: userIds });
      await loadData();
      setShowAddModal(false);
    } catch (error: any) {
      console.error('Add staff error:', error);
      setError(error.response?.data?.error || 'Fehler beim Hinzufügen');
    }
  };

  const handleRemoveStaff = async (userId: number) => {
    if (!confirm('Mitarbeiter aus dem Event-Pool entfernen?')) {
      return;
    }

    try {
      await client.delete(`/users/event/${eventId}/staff/${userId}`);
      await loadData();
    } catch (error: any) {
      console.error('Remove staff error:', error);
      setError(error.response?.data?.error || 'Fehler beim Entfernen');
    }
  };

  const handleShowTasks = async (staff: EventStaff) => {
    try {
      const response = await client.get(`/tasks/event/${eventId}/user/${staff.id}/assignments`);
      setStaffTasks(response.data);
      setSelectedStaffForTasks(staff);
    } catch (error) {
      console.error('Load staff tasks error:', error);
      setError('Fehler beim Laden der Aufgaben');
    }
  };

  const handleUnassignTask = async (assignmentId: number) => {
    if (!confirm('Möchten Sie diese Zuweisung wirklich entfernen?')) {
      return;
    }

    try {
      await client.delete(`/tasks/assignment/${assignmentId}`);
      // Refresh both task list and staff data
      if (selectedStaffForTasks) {
        await handleShowTasks(selectedStaffForTasks);
      }
      await loadData();
    } catch (error) {
      console.error('Unassign task error:', error);
      setError('Fehler beim Entfernen der Zuweisung');
    }
  };

  if (loading) {
    return <div style={styles.loading}>Lade Mitarbeiter...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Event-Mitarbeiter Pool</h3>
          <p style={styles.subtitle}>
            Nur diese Mitarbeiter können Aufgaben für dieses Event zugewiesen werden
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} style={styles.addButton}>
          + Mitarbeiter hinzufügen
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {eventStaff.length === 0 ? (
        <div style={styles.emptyState}>
          <p>Noch keine Mitarbeiter im Pool.</p>
          <p style={styles.emptyHint}>
            Füge Mitarbeiter hinzu, um sie später Aufgaben zuweisen zu können.
          </p>
        </div>
      ) : (
        <div style={styles.staffGrid}>
          {eventStaff.map((staff) => (
            <div key={staff.id} style={styles.staffCard}>
              <div style={styles.staffEllipse}>
                <span style={styles.staffName}>{staff.name}</span>
                <button
                  onClick={() => handleRemoveStaff(staff.id)}
                  style={styles.removeButtonEllipse}
                  title="Aus Pool entfernen"
                >
                  ✕
                </button>
              </div>
              <button
                onClick={() => handleShowTasks(staff)}
                style={{
                  ...styles.taskCount,
                  cursor: staff.taskCount ? 'pointer' : 'default',
                  textDecoration: staff.taskCount ? 'underline' : 'none',
                }}
                disabled={!staff.taskCount}
                title={staff.taskCount ? 'Aufgaben anzeigen' : ''}
              >
                {staff.taskCount || 0} Aufgabe{(staff.taskCount || 0) !== 1 ? 'n' : ''}
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddStaffModal
          availableStaff={allStaff.filter(s => !s.isInPool)}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddStaff}
        />
      )}

      {selectedStaffForTasks && (
        <TaskListModal
          staff={selectedStaffForTasks}
          tasks={staffTasks}
          onClose={() => {
            setSelectedStaffForTasks(null);
            setStaffTasks([]);
          }}
          onUnassign={handleUnassignTask}
        />
      )}
    </div>
  );
};

interface AddStaffModalProps {
  availableStaff: User[];
  onClose: () => void;
  onAdd: (userIds: number[]) => void;
}

const AddStaffModal: React.FC<AddStaffModalProps> = ({ availableStaff, onClose, onAdd }) => {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const handleToggle = (userId: number) => {
    setSelectedIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = () => {
    if (selectedIds.length === 0) {
      alert('Bitte mindestens einen Mitarbeiter auswählen');
      return;
    }
    onAdd(selectedIds);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal}>
        <h2 style={styles.modalTitle}>Mitarbeiter hinzufügen</h2>

        {availableStaff.length === 0 ? (
          <p style={styles.noStaff}>Alle Mitarbeiter sind bereits im Pool.</p>
        ) : (
          <div style={styles.staffList}>
            {availableStaff.map((staff) => (
              <label key={staff.id} style={styles.staffCheckbox}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(staff.id)}
                  onChange={() => handleToggle(staff.id)}
                  style={styles.checkbox}
                />
                <span>{staff.name}</span>
              </label>
            ))}
          </div>
        )}

        <div style={styles.modalButtons}>
          <button onClick={onClose} style={styles.cancelButton}>
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            style={styles.submitButton}
            disabled={selectedIds.length === 0}
          >
            {selectedIds.length > 0
              ? `${selectedIds.length} Mitarbeiter hinzufügen`
              : 'Mitarbeiter hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface TaskListModalProps {
  staff: EventStaff;
  tasks: StaffTask[];
  onClose: () => void;
  onUnassign: (assignmentId: number) => void;
}

const TaskListModal: React.FC<TaskListModalProps> = ({ staff, tasks, onClose, onUnassign }) => {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      not_started: '#6b7280',
      in_progress: '#3b82f6',
      completed: '#10b981',
      overdue: '#ef4444',
    };
    return colors[status] || '#6b7280';
  };

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      not_started: 'Nicht gestartet',
      in_progress: 'In Arbeit',
      completed: 'Erledigt',
      overdue: 'Überfällig',
    };
    return labels[status] || status;
  };

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={{...styles.modal, maxWidth: '700px', maxHeight: '80vh', overflow: 'auto'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
          <h2 style={styles.modalTitle}>Aufgaben von {staff.name}</h2>
          <button onClick={onClose} style={{...styles.removeButton, position: 'static'}}>✕</button>
        </div>

        {tasks.length === 0 ? (
          <p style={styles.noStaff}>Diesem Mitarbeiter sind keine Aufgaben zugewiesen.</p>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
            {tasks.map((task) => (
              <div key={task.assignment_id} style={{
                padding: '1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
              }}>
                <div style={{flex: 1}}>
                  <div style={{fontWeight: '600', marginBottom: '0.25rem'}}>{task.title}</div>
                  <div style={{fontSize: '0.875rem', color: '#6b7280'}}>
                    {task.event_name} #{task.instance_number} - Tag {task.day_number}
                  </div>
                  <div style={{marginTop: '0.5rem'}}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.625rem',
                      backgroundColor: getStatusColor(task.status),
                      color: 'white',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                    }}>
                      {getStatusLabel(task.status)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onUnassign(task.assignment_id)}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                  }}
                  title="Zuweisung entfernen"
                >
                  ✕ Entfernen
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end'}}>
          <button onClick={onClose} style={styles.cancelButton}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '1.5rem',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '0.25rem',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#6b7280',
    margin: 0,
  },
  addButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  loading: {
    padding: '2rem',
    textAlign: 'center',
    color: '#6b7280',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: '4px',
    marginBottom: '1rem',
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem 1rem',
    color: '#6b7280',
  },
  emptyHint: {
    fontSize: '0.875rem',
    marginTop: '0.5rem',
  },
  staffGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  staffCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.125rem',
  },
  staffEllipse: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.25rem 0.5rem',
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
    border: 'none',
    borderRadius: '9999px',
    position: 'relative',
  },
  staffInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  staffName: {
    fontWeight: '500',
    color: '#3730a3',
    fontSize: '0.75rem',
  },
  staffMeta: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
  },
  staffBadge: {
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  taskCount: {
    fontSize: '0.75rem',
    color: '#4f46e5',
    fontWeight: '500',
    backgroundColor: 'transparent',
    border: 'none',
    padding: '0.125rem 0.25rem',
  },
  removeButton: {
    padding: '0.25rem 0.5rem',
    backgroundColor: 'transparent',
    color: '#ef4444',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1.25rem',
    lineHeight: 1,
  },
  removeButtonEllipse: {
    padding: '0',
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    color: '#ef4444',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.75rem',
    lineHeight: 1,
    borderRadius: '50%',
    transition: 'background-color 0.2s',
  },
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
    maxHeight: '80vh',
    overflow: 'auto',
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: '#1f2937',
  },
  noStaff: {
    textAlign: 'center',
    padding: '2rem',
    color: '#6b7280',
  },
  staffList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    maxHeight: '400px',
    overflow: 'auto',
  },
  staffCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  modalButtons: {
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
};
