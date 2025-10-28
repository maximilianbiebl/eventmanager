import React, { useState, useEffect } from 'react';
import client from '../../api/client';

interface TaskAssignment {
  id: number;
  title: string;
  description?: string;
  day_number: number;
  scheduled_time?: string;
  start_time?: string;
  end_time?: string;
  status: string;
  is_public: boolean;
  assignment_id?: number;
  user_id?: number;
  user_name?: string;
  completed?: boolean;
}

interface Props {
  eventInstanceId: number;
  onEditTask: (taskId: number) => void;
  onAssignTask: (taskId: number) => void;
  eventDays?: number; // Anzahl der Tage im Event
}

const STATUS_COLORS: { [key: string]: string } = {
  not_started: '#6b7280',
  in_progress: '#3b82f6',
  completed: '#10b981',
  overdue: '#ef4444',
};

const STATUS_LABELS: { [key: string]: string } = {
  not_started: 'Nicht gestartet',
  in_progress: 'In Arbeit',
  completed: 'Erledigt',
  overdue: 'Überfällig',
};

export const TaskTableView: React.FC<Props> = ({ eventInstanceId, onEditTask, onAssignTask, eventDays }) => {
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'start' | 'end'>('start');

  useEffect(() => {
    loadAssignments();
  }, [eventInstanceId]);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      const response = await client.get(`/tasks/instance/${eventInstanceId}/assignments`);
      setAssignments(response.data);
    } catch (error) {
      console.error('Load assignments error:', error);
      setError('Fehler beim Laden der Aufgaben');
    } finally {
      setLoading(false);
    }
  };

  const handleDayChange = async (day: number | 'all') => {
    setSelectedDay(day);
    await loadAssignments(); // Reload data when switching days
  };

  // Gruppiere Assignments nach Task ID
  const groupedTasks = assignments.reduce((acc, assignment) => {
    if (!acc[assignment.id]) {
      acc[assignment.id] = {
        task: assignment,
        assignedUsers: [],
      };
    }
    if (assignment.user_name) {
      acc[assignment.id].assignedUsers.push({
        name: assignment.user_name,
        completed: assignment.completed || false,
      });
    }
    return acc;
  }, {} as { [key: number]: { task: TaskAssignment; assignedUsers: { name: string; completed: boolean }[] } });

  const tasks = Object.values(groupedTasks);

  // Filter nach Status und Tag
  let filteredTasks = statusFilter === 'all'
    ? tasks
    : tasks.filter(t => t.task.status === statusFilter);

  // Filter nach Tag
  if (selectedDay !== 'all') {
    filteredTasks = filteredTasks.filter(t => t.task.day_number === selectedDay);
  }

  // Sortierung
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortBy === 'start') {
      // Bei Start-Sortierung: Tasks ohne Startzeit zuerst, dann nach Startzeit
      const hasStartA = !!a.task.start_time;
      const hasStartB = !!b.task.start_time;

      if (!hasStartA && !hasStartB) {
        // Beide ohne Startzeit: nach scheduled_time sortieren
        const timeA = a.task.scheduled_time || '23:59';
        const timeB = b.task.scheduled_time || '23:59';
        return timeA.localeCompare(timeB);
      }
      if (!hasStartA) return -1; // A hat keine Startzeit, kommt zuerst
      if (!hasStartB) return 1;  // B hat keine Startzeit, kommt zuerst

      // Beide haben Startzeit: normal sortieren
      return a.task.start_time!.localeCompare(b.task.start_time!);
    } else if (sortBy === 'end') {
      // Bei End-Sortierung: Tasks ohne Endzeit am Ende
      const endA = a.task.end_time || '23:59';
      const endB = b.task.end_time || '23:59';
      return endA.localeCompare(endB);
    } else {
      // Standard (time): scheduled_time oder start_time
      const timeA = a.task.scheduled_time || a.task.start_time || '23:59';
      const timeB = b.task.scheduled_time || b.task.start_time || '23:59';
      return timeA.localeCompare(timeB);
    }
  });

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    try {
      await client.put(`/tasks/${taskId}`, { status: newStatus });
      await loadAssignments();
    } catch (error) {
      console.error('Change status error:', error);
      setError('Fehler beim Ändern des Status');
    }
  };

  if (loading) {
    return <div style={styles.loading}>Lade Aufgaben...</div>;
  }

  if (error) {
    return <div style={styles.error}>{error}</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Aufgaben-Übersicht</h3>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="all">Alle</option>
            <option value="not_started">Nicht gestartet</option>
            <option value="in_progress">In Arbeit</option>
            <option value="completed">Erledigt</option>
            <option value="overdue">Überfällig</option>
          </select>

          <label style={styles.filterLabel}>Sortierung:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'time' | 'start' | 'end')}
            style={styles.filterSelect}
          >
            <option value="time">Nach geplanter Zeit</option>
            <option value="start">Nach Startzeit (ohne zuerst)</option>
            <option value="end">Nach Fälligkeit (Endzeit)</option>
          </select>
        </div>
      </div>

      {/* Tag-Tabs */}
      {eventDays && eventDays > 1 && (
        <div style={styles.dayTabs}>
          <button
            onClick={() => handleDayChange('all')}
            style={selectedDay === 'all' ? styles.dayTabActive : styles.dayTab}
          >
            Alle Tage
          </button>
          {Array.from({ length: eventDays }, (_, i) => i + 1).map((day) => (
            <button
              key={day}
              onClick={() => handleDayChange(day)}
              style={selectedDay === day ? styles.dayTabActive : styles.dayTab}
            >
              Tag {day}
            </button>
          ))}
        </div>
      )}

      {sortedTasks.length === 0 ? (
        <div style={styles.noTasks}>
          {statusFilter === 'all'
            ? 'Keine Aufgaben vorhanden'
            : `Keine Aufgaben mit Status "${STATUS_LABELS[statusFilter]}"`}
        </div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.headerRow}>
                <th style={styles.th}>Tag</th>
                <th style={styles.th}>Aufgabe</th>
                <th style={styles.th}>Geplante Zeit</th>
                <th style={styles.th}>Startzeit</th>
                <th style={styles.th}>Endzeit</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Zugewiesen an</th>
                <th style={styles.th}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map(({ task, assignedUsers }) => (
                <tr key={task.id} style={styles.row}>
                  <td style={styles.td}>Tag {task.day_number}</td>
                  <td style={styles.td}>
                    <div style={styles.taskTitle}>
                      {task.title}
                      {task.is_public && (
                        <span style={styles.publicBadge}>Öffentlich</span>
                      )}
                    </div>
                    {task.description && (
                      <div style={styles.taskDescription}>{task.description}</div>
                    )}
                  </td>
                  <td style={styles.td}>{task.scheduled_time || '-'}</td>
                  <td style={styles.td}>{task.start_time || '-'}</td>
                  <td style={styles.td}>{task.end_time || '-'}</td>
                  <td style={styles.td}>
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(task.id, e.target.value)}
                      style={{
                        ...styles.statusSelect,
                        backgroundColor: STATUS_COLORS[task.status] || '#6b7280',
                      }}
                    >
                      <option value="not_started">Nicht gestartet</option>
                      <option value="in_progress">In Arbeit</option>
                      <option value="completed">Erledigt</option>
                      <option value="overdue">Überfällig</option>
                    </select>
                  </td>
                  <td style={styles.td}>
                    {assignedUsers.length === 0 ? (
                      <span style={styles.noAssignments}>Nicht zugewiesen</span>
                    ) : (
                      <div style={styles.usersList}>
                        {assignedUsers.map((user, idx) => (
                          <span key={idx} style={styles.userBadge}>
                            {user.name}
                            {user.completed && (
                              <span style={styles.completedIcon}>✓</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button
                        onClick={() => onEditTask(task.id)}
                        style={styles.editButton}
                        title="Aufgabe bearbeiten"
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => onAssignTask(task.id)}
                        style={styles.assignButton}
                        title="Mitarbeiter zuweisen"
                      >
                        Zuweisen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  filterLabel: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#6b7280',
  },
  filterSelect: {
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '0.875rem',
  },
  loading: {
    padding: '2rem',
    textAlign: 'center',
    color: '#6b7280',
  },
  error: {
    padding: '1rem',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: '4px',
  },
  noTasks: {
    padding: '2rem',
    textAlign: 'center',
    color: '#6b7280',
  },
  tableWrapper: {
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  headerRow: {
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
  },
  th: {
    padding: '0.75rem',
    textAlign: 'left',
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#374151',
  },
  row: {
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '0.75rem',
    fontSize: '0.875rem',
    color: '#1f2937',
  },
  taskTitle: {
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  taskDescription: {
    fontSize: '0.75rem',
    color: '#6b7280',
    marginTop: '0.25rem',
  },
  publicBadge: {
    fontSize: '0.7rem',
    padding: '0.125rem 0.5rem',
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    borderRadius: '9999px',
    fontWeight: '500',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '500',
    color: 'white',
  },
  statusSelect: {
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '500',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  },
  noAssignments: {
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  usersList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
  },
  userBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.25rem 0.5rem',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    fontSize: '0.75rem',
  },
  completedIcon: {
    color: '#10b981',
    fontWeight: 'bold',
  },
  actions: {
    display: 'flex',
    gap: '0.5rem',
  },
  editButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: '#f59e0b',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  assignButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: '#4f46e5',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  dayTabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '0.5rem',
    overflowX: 'auto',
  },
  dayTab: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    whiteSpace: 'nowrap' as const,
  },
  dayTabActive: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    color: '#4f46e5',
    border: 'none',
    borderBottom: '2px solid #4f46e5',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '600',
    whiteSpace: 'nowrap' as const,
  },
};
