import React, { useState, useEffect } from 'react';
import client from '../../api/client';
import { tasksApi } from '../../api/tasks';
import responsiveStyles from './TaskTableView.module.css';

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
  is_active?: boolean;
  sort_order?: number;
}

interface Props {
  eventInstanceId: number;
  onEditTask: (taskId: number) => void;
  onAssignTask: (taskId: number) => void;
  eventDays?: number; // Anzahl der Tage im Event
  selectedDay?: number | 'all'; // Ausgewählter Tag von außen
  onSelectedDayChange?: (day: number | 'all') => void; // Callback für Tag-Änderung
  instanceStartDate?: string; // Startdatum der Event-Instanz
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

export const TaskTableView: React.FC<Props> = ({
  eventInstanceId,
  onEditTask,
  onAssignTask,
  eventDays,
  selectedDay: externalSelectedDay,
  onSelectedDayChange,
  instanceStartDate
}) => {
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [internalSelectedDay, setInternalSelectedDay] = useState<number | 'all'>('all');
  const [sortColumn, setSortColumn] = useState<string>('manual');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Use external selectedDay if provided, otherwise use internal state
  const selectedDay = externalSelectedDay !== undefined ? externalSelectedDay : internalSelectedDay;
  const setSelectedDay = (day: number | 'all') => {
    if (onSelectedDayChange) {
      onSelectedDayChange(day);
    } else {
      setInternalSelectedDay(day);
    }
  };

  useEffect(() => {
    loadAssignments();
  }, [eventInstanceId]);

  const loadAssignments = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const response = await client.get(`/tasks/instance/${eventInstanceId}/assignments`);
      setAssignments(response.data);
    } catch (error) {
      console.error('Load assignments error:', error);
      setError('Fehler beim Laden der Aufgaben');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleDayChange = (day: number | 'all') => {
    setSelectedDay(day);
    // No need to reload data, just filter client-side
  };

  const handleUnassign = async (assignmentId: number, userName: string) => {
    if (!window.confirm(`Möchten Sie die Zuweisung von "${userName}" wirklich entfernen?`)) {
      return;
    }

    try {
      await client.delete(`/tasks/assignment/${assignmentId}`);
      await loadAssignments(); // Reload to show updated assignments
    } catch (error) {
      console.error('Unassign error:', error);
      alert('Fehler beim Entfernen der Zuweisung');
    }
  };

  const handleToggleActive = async (taskId: number, taskTitle: string, currentlyActive: boolean) => {
    const action = currentlyActive ? 'deaktivieren' : 'aktivieren';
    const actionPast = currentlyActive ? 'deaktiviert' : 'aktiviert';

    if (!window.confirm(`Möchten Sie die Aufgabe "${taskTitle}" wirklich ${action}?`)) {
      return;
    }

    try {
      if (currentlyActive) {
        await tasksApi.deactivate(taskId);
      } else {
        await tasksApi.activate(taskId);
      }
      setSuccessMessage(`Aufgabe wurde ${actionPast}`);
      setTimeout(() => setSuccessMessage(''), 3000);
      await loadAssignments();
    } catch (error) {
      console.error('Toggle active error:', error);
      alert(`Fehler beim ${action.slice(0, -2)}en der Aufgabe`);
    }
  };

  const handleMoveUp = async (taskId: number) => {
    try {
      await tasksApi.moveUp(taskId);
      setSuccessMessage('Aufgabe wurde nach oben verschoben');
      setTimeout(() => setSuccessMessage(''), 3000);
      await loadAssignments(false); // Reload without loading spinner
    } catch (error: any) {
      console.error('Move up error:', error);
      if (error.response?.status === 400) {
        alert('Aufgabe ist bereits an erster Position');
      } else {
        alert('Fehler beim Verschieben der Aufgabe');
      }
    }
  };

  const handleMoveDown = async (taskId: number) => {
    try {
      await tasksApi.moveDown(taskId);
      setSuccessMessage('Aufgabe wurde nach unten verschoben');
      setTimeout(() => setSuccessMessage(''), 3000);
      await loadAssignments(false); // Reload without loading spinner
    } catch (error: any) {
      console.error('Move down error:', error);
      if (error.response?.status === 400) {
        alert('Aufgabe ist bereits an letzter Position');
      } else {
        alert('Fehler beim Verschieben der Aufgabe');
      }
    }
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
        assignmentId: assignment.assignment_id,
        userId: assignment.user_id,
      });
    }
    return acc;
  }, {} as { [key: number]: { task: TaskAssignment; assignedUsers: { name: string; completed: boolean; assignmentId?: number; userId?: number }[] } });

  const tasks = Object.values(groupedTasks);

  // Filter nach Status und Tag
  let filteredTasks = statusFilter === 'all'
    ? tasks
    : tasks.filter(t => t.task.status === statusFilter);

  // Filter nach Tag
  if (selectedDay !== 'all') {
    filteredTasks = filteredTasks.filter(t => t.task.day_number === selectedDay);
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sortierung
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    let compareResult = 0;

    switch (sortColumn) {
      case 'manual':
        const sortOrderA = a.task.sort_order ?? 999999;
        const sortOrderB = b.task.sort_order ?? 999999;
        compareResult = sortOrderA - sortOrderB;
        break;
      case 'day':
        compareResult = a.task.day_number - b.task.day_number;
        break;
      case 'date':
        if (instanceStartDate) {
          const dateA = new Date(instanceStartDate);
          dateA.setDate(dateA.getDate() + a.task.day_number - 1);
          const dateB = new Date(instanceStartDate);
          dateB.setDate(dateB.getDate() + b.task.day_number - 1);
          compareResult = dateA.getTime() - dateB.getTime();
        }
        break;
      case 'title':
        compareResult = a.task.title.localeCompare(b.task.title);
        break;
      case 'scheduled':
        const schedA = a.task.scheduled_time || '99:99';
        const schedB = b.task.scheduled_time || '99:99';
        compareResult = schedA.localeCompare(schedB);
        break;
      case 'start':
        const startA = a.task.start_time || '99:99';
        const startB = b.task.start_time || '99:99';
        compareResult = startA.localeCompare(startB);
        break;
      case 'end':
        const endA = a.task.end_time || '99:99';
        const endB = b.task.end_time || '99:99';
        compareResult = endA.localeCompare(endB);
        break;
      case 'status':
        compareResult = a.task.status.localeCompare(b.task.status);
        break;
      default:
        compareResult = 0;
    }

    return sortDirection === 'asc' ? compareResult : -compareResult;
  });

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    try {
      await client.put(`/tasks/${taskId}`, { status: newStatus });
      setSuccessMessage(`Status wurde auf "${STATUS_LABELS[newStatus]}" geändert`);
      setTimeout(() => setSuccessMessage(''), 3000);
      await loadAssignments();
    } catch (error) {
      console.error('Change status error:', error);
      setError('Fehler beim Ändern des Status');
    }
  };

  const getTaskDate = (dayNumber: number) => {
    if (!instanceStartDate) return '-';
    const startDate = new Date(instanceStartDate);
    startDate.setDate(startDate.getDate() + dayNumber - 1);
    return startDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return ' ↕';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  if (loading) {
    return <div style={styles.loading}>Lade Aufgaben...</div>;
  }

  if (error) {
    return <div style={styles.error}>{error}</div>;
  }

  return (
    <div style={styles.container} className={responsiveStyles.container}>
      {successMessage && (
        <div style={styles.successBanner} className={responsiveStyles.successBanner}>{successMessage}</div>
      )}
      <div style={styles.header} className={responsiveStyles.header}>
        <h3 style={styles.title} className={responsiveStyles.title}>Aufgaben-Übersicht</h3>
        <div style={styles.filterGroup} className={responsiveStyles.filterGroup}>
          <label style={styles.filterLabel} className={responsiveStyles.filterLabel}>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
            className={responsiveStyles.filterSelect}
          >
            <option value="all">Alle</option>
            <option value="not_started">Nicht gestartet</option>
            <option value="in_progress">In Arbeit</option>
            <option value="completed">Erledigt</option>
            <option value="overdue">Überfällig</option>
          </select>
          <span style={{ fontSize: '0.875rem', color: '#6b7280', marginLeft: '1rem' }} className={responsiveStyles.sortIndicator}>
            {sortColumn === 'manual' ? '📌 Manuelle Sortierung aktiv' : '⚠️ Spalten-Sortierung aktiv'}
            {sortColumn !== 'manual' && (
              <button
                onClick={() => setSortColumn('manual')}
                style={{ marginLeft: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                Zurück zu manueller Sortierung
              </button>
            )}
          </span>
        </div>
      </div>

      {/* Tag-Tabs */}
      {eventDays && eventDays > 1 && (
        <div style={styles.dayTabs} className={responsiveStyles.dayTabs}>
          <button
            onClick={() => handleDayChange('all')}
            style={selectedDay === 'all' ? styles.dayTabActive : styles.dayTab}
            className={selectedDay === 'all' ? responsiveStyles.dayTabActive : responsiveStyles.dayTab}
          >
            Alle Tage
          </button>
          {Array.from({ length: eventDays }, (_, i) => i + 1).map((day) => (
            <button
              key={day}
              onClick={() => handleDayChange(day)}
              style={selectedDay === day ? styles.dayTabActive : styles.dayTab}
              className={selectedDay === day ? responsiveStyles.dayTabActive : responsiveStyles.dayTab}
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
        <div style={styles.tableWrapper} className={responsiveStyles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.headerRow}>
                <th
                  style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('day')}
                  className={responsiveStyles.hideOnMobile}
                >
                  Tag{getSortIcon('day')}
                </th>
                <th
                  style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('date')}
                  className={responsiveStyles.hideOnMobile}
                >
                  Datum{getSortIcon('date')}
                </th>
                <th
                  style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('title')}
                >
                  Aufgabe{getSortIcon('title')}
                </th>
                <th
                  style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('scheduled')}
                  className={responsiveStyles.hideOnTablet}
                >
                  Geplante Zeit{getSortIcon('scheduled')}
                </th>
                <th
                  style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('start')}
                  className={responsiveStyles.hideOnTablet}
                >
                  Startzeit{getSortIcon('start')}
                </th>
                <th
                  style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('end')}
                  className={responsiveStyles.hideOnTablet}
                >
                  Endzeit{getSortIcon('end')}
                </th>
                <th
                  style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('status')}
                >
                  Status{getSortIcon('status')}
                </th>
                <th style={styles.th} className={responsiveStyles.hideOnMobile}>Zugewiesen an</th>
                <th style={styles.th}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map(({ task, assignedUsers }) => (
                <tr key={task.id} style={styles.row}>
                  <td style={styles.td} className={responsiveStyles.hideOnMobile}>Tag {task.day_number}</td>
                  <td style={styles.td} className={responsiveStyles.hideOnMobile}>{getTaskDate(task.day_number)}</td>
                  <td style={styles.td}>
                    <div style={styles.taskTitle} className={responsiveStyles.taskTitle}>
                      {task.title}
                      {task.is_public && (
                        <span style={styles.publicBadge} className={responsiveStyles.publicBadge}>Öffentlich</span>
                      )}
                    </div>
                    {task.description && (
                      <div style={styles.taskDescription} className={responsiveStyles.taskDescription}>{task.description}</div>
                    )}
                  </td>
                  <td style={styles.td} className={responsiveStyles.hideOnTablet}>{task.scheduled_time || '-'}</td>
                  <td style={styles.td} className={responsiveStyles.hideOnTablet}>{task.start_time || '-'}</td>
                  <td style={styles.td} className={responsiveStyles.hideOnTablet}>{task.end_time || '-'}</td>
                  <td style={styles.td}>
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(task.id, e.target.value)}
                      style={{
                        ...styles.statusSelect,
                        backgroundColor: STATUS_COLORS[task.status] || '#6b7280',
                      }}
                      className={responsiveStyles.statusSelect}
                    >
                      <option value="not_started">Nicht gestartet</option>
                      <option value="in_progress">In Arbeit</option>
                      <option value="completed">Erledigt</option>
                      <option value="overdue">Überfällig</option>
                    </select>
                  </td>
                  <td style={styles.td} className={responsiveStyles.hideOnMobile}>
                    {assignedUsers.length === 0 ? (
                      <span style={styles.noAssignments}>Nicht zugewiesen</span>
                    ) : (
                      <div style={styles.usersList} className={responsiveStyles.usersList}>
                        {assignedUsers.map((user, idx) => (
                          <span key={idx} style={styles.userBadge} className={responsiveStyles.userBadge}>
                            {user.name}
                            {user.completed && (
                              <span style={styles.completedIcon}>✓</span>
                            )}
                            {user.assignmentId && (
                              <button
                                onClick={() => handleUnassign(user.assignmentId!, user.name)}
                                style={styles.unassignButton}
                                className={responsiveStyles.unassignButton}
                                title="Zuweisung entfernen"
                              >
                                ✕
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actions} className={responsiveStyles.actions}>
                      <button
                        onClick={() => onEditTask(task.id)}
                        style={styles.editButton}
                        title="Aufgabe bearbeiten"
                      >
                        ✏️ Bearbeiten
                      </button>
                      <button
                        onClick={() => onAssignTask(task.id)}
                        style={styles.assignButton}
                        title="Mitarbeiter zuweisen"
                      >
                        👥 Zuweisen
                      </button>
                      <button
                        onClick={() => handleToggleActive(task.id, task.title, task.is_active !== false)}
                        style={task.is_active === false ? styles.activateButton : styles.deactivateButton}
                        title={task.is_active === false ? "Aufgabe aktivieren" : "Aufgabe deaktivieren"}
                      >
                        {task.is_active === false ? '✅ Aktivieren' : '🚫 Deaktivieren'}
                      </button>
                      <div style={{marginLeft: 'auto', display: 'flex', gap: '0.25rem'}}>
                        <button
                          onClick={() => handleMoveUp(task.id)}
                          style={styles.moveButton}
                          className={responsiveStyles.moveButton}
                          title="Aufgabe nach oben verschieben"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleMoveDown(task.id)}
                          style={styles.moveButton}
                          className={responsiveStyles.moveButton}
                          title="Aufgabe nach unten verschieben"
                        >
                          ▼
                        </button>
                      </div>
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
  successBanner: {
    padding: '1rem',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    borderRadius: '4px',
    marginBottom: '1rem',
    textAlign: 'center',
    fontWeight: '500',
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
  unassignButton: {
    marginLeft: '0.25rem',
    padding: '0.125rem 0.25rem',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    fontSize: '0.7rem',
    cursor: 'pointer',
    fontWeight: 'bold',
    lineHeight: '1',
    transition: 'background-color 0.2s',
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
  deleteButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  deactivateButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: '#f59e0b',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  activateButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  moveButton: {
    padding: '0.25rem 0.375rem',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: 'normal',
    lineHeight: '1',
    transition: 'all 0.2s',
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
