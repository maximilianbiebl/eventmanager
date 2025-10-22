import React, { useState, useEffect } from 'react';
import { usersApi, User } from '../../api/users';
import client from '../../api/client';

interface Props {
  eventId: number;
}

interface EventStaff extends User {
  isInPool?: boolean;
  taskCount?: number;
}

export const EventStaffPool: React.FC<Props> = ({ eventId }) => {
  const [allStaff, setAllStaff] = useState<EventStaff[]>([]);
  const [eventStaff, setEventStaff] = useState<EventStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadData();
  }, [eventId]);

  const loadData = async () => {
    try {
      setLoading(true);
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
      setLoading(false);
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
              <div style={styles.staffInfo}>
                <span style={styles.staffName}>{staff.name}</span>
                <div style={styles.staffMeta}>
                  <span style={styles.staffBadge}>Mitarbeiter</span>
                  <span style={styles.taskCount}>
                    📋 {staff.taskCount || 0} Aufgabe{(staff.taskCount || 0) !== 1 ? 'n' : ''}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleRemoveStaff(staff.id)}
                style={styles.removeButton}
                title="Aus Pool entfernen"
              >
                ✕
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
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '0.75rem',
  },
  staffCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
  },
  staffInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  staffName: {
    fontWeight: '500',
    color: '#1f2937',
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
