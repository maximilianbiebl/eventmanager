import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import client from '../../api/client';
import { tasksApi } from '../../api/tasks';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
import { useSSE } from '../../hooks/useSSE';
import responsiveStyles from './TaskTableView.module.css';
import { Toast } from '../Toast';
import { CSVExportModal } from './CSVExportModal';
import { CSVImportModal } from './CSVImportModal';
import { StatusFilter } from './StatusFilter';
import { StatusCell } from './StatusCell';

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
  series_id?: number;
}

interface Props {
  eventInstanceId: number;
  onEditTask: (taskId: number) => void;
  onAssignTask: (taskId: number) => void;
  eventDays?: number; // Anzahl der Tage im Event
  selectedDay?: number | 'all'; // Ausgewählter Tag von außen
  onSelectedDayChange?: (day: number | 'all') => void; // Callback für Tag-Änderung
  instanceStartDate?: string; // Startdatum der Event-Instanz
  manualRefreshTrigger?: number;
  readOnly?: boolean;
  eventId?: number; // Needed for CSV export/import
}

const STATUS_COLORS: { [key: string]: string } = {
  not_started: 'var(--c-text-muted)',
  in_progress: 'var(--c-accent)',
  completed: 'var(--c-success)',
  overdue: 'var(--c-danger)',
};

const STATUS_LABELS: { [key: string]: string } = {
  not_started: 'Nicht gestartet',
  in_progress: 'In Arbeit',
  completed: 'Erledigt',
  overdue: 'Überfällig',
};

export interface TaskTableViewHandle {
  openImport: () => void;
  openExport: () => void;
}

export const TaskTableView = forwardRef<TaskTableViewHandle, Props>(({
  eventInstanceId,
  onEditTask,
  onAssignTask,
  eventDays,
  selectedDay: externalSelectedDay,
  onSelectedDayChange,
  instanceStartDate,
  manualRefreshTrigger,
  readOnly = false,
  eventId,
}, ref) => {
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [internalSelectedDay, setInternalSelectedDay] = useState<number | 'all'>('all');
  const [sortColumn, setSortColumn] = useState<string>('manual');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [descriptionModal, setDescriptionModal] = useState<{ title: string; description: string } | null>(null);
  const pendingActionsRef = React.useRef<number>(0);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [taskSeries, setTaskSeries] = useState<TaskSeries[]>([]);
  const [seriesMembers, setSeriesMembers] = useState<{ [seriesId: number]: { id: number; name: string }[] }>({});

  useImperativeHandle(ref, () => ({
    openImport: () => setShowImportModal(true),
    openExport: () => setShowExportModal(true),
  }));

  // Use external selectedDay if provided, otherwise use internal state
  const selectedDay = externalSelectedDay !== undefined ? externalSelectedDay : internalSelectedDay;
  const setSelectedDay = (day: number | 'all') => {
    if (onSelectedDayChange) {
      onSelectedDayChange(day);
    } else {
      setInternalSelectedDay(day);
    }
  };

  // SSE for real-time updates
  useSSE({
    enabled: true,
    onTaskUpdate: (data) => {
      console.log('SSE: TaskTableView update received', data);

      // Ignore SSE updates while actions are pending (to prevent overwriting optimistic updates)
      if (pendingActionsRef.current > 0) {
        console.log(`SSE: Ignoring update (${pendingActionsRef.current} actions pending)`);
        return;
      }

      loadAssignments(false);
    },
    onConnected: () => {
      console.log('SSE: TaskTableView connected');
    },
    onError: (error) => {
      console.error('SSE: TaskTableView error', error);
    }
  });

  useEffect(() => {
    loadAssignments(false); // Load silently on mount - parent already shows loading
    loadSeries(); // Load series data
  }, [eventInstanceId, eventId]);

  // React to manual refresh from parent
  useEffect(() => {
    if (manualRefreshTrigger !== undefined && manualRefreshTrigger > 0) {
      loadAssignments(false);
      loadSeries();
    }
  }, [manualRefreshTrigger]);

  const isTaskOverdue = (task: TaskAssignment): boolean => {
    if (!task.end_time || task.status === 'completed') return false;

    // Vorlagen oder Events ohne Startdatum sind nie überfällig
    if (!instanceStartDate) return false;
    const taskDate = new Date(instanceStartDate);
    if (isNaN(taskDate.getTime()) || taskDate.getFullYear() < 2000) return false;

    const now = new Date();
    taskDate.setDate(taskDate.getDate() + task.day_number - 1);

    // Parse end time (format: "HH:MM")
    const [hours, minutes] = task.end_time.split(':').map(Number);
    taskDate.setHours(hours, minutes, 0, 0);

    return now > taskDate;
  };

  /*
   * Der tatsächliche Zustand einer Aufgabe. Eine nicht gestartete Aufgabe,
   * deren Endzeit vorbei ist, IST überfällig - vorher hat nur die Farbe das
   * gezeigt, während der Filter sie weiter unter "Nicht gestartet" führte.
   * Beides leitet sich jetzt aus derselben Funktion ab.
   */
  const effectiveStatus = (task: TaskAssignment): string =>
    isTaskOverdue(task) ? 'overdue' : task.status;


  const loadAssignments = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const response = await client.get(`/tasks/instance/${eventInstanceId}/assignments`);
      const data = response.data;

      setAssignments(data);
    } catch (error) {
      console.error('Load assignments error:', error);
      setError('Fehler beim Laden der Aufgaben');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const loadSeries = async () => {
    if (!eventId) return;
    try {
      const seriesData = await taskSeriesApi.getByEvent(eventId);
      setTaskSeries(seriesData);

      // Load members for each series
      const membersMap: { [seriesId: number]: { id: number; name: string }[] } = {};
      await Promise.all(
        seriesData.map(async (s) => {
          try {
            const details = await taskSeriesApi.getById(s.id);
            membersMap[s.id] = details.members || [];
          } catch (err) {
            membersMap[s.id] = [];
          }
        })
      );
      setSeriesMembers(membersMap);
    } catch (error) {
      console.error('Load series error:', error);
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

  const handleMoveUp = async (taskId: number) => {
    pendingActionsRef.current++; // Increment pending actions counter
    try {
      // Optimistic update: Swap sort_order values (not array positions!)
      const currentAssignmentIndex = assignments.findIndex(a => a.id === taskId);
      if (currentAssignmentIndex > 0) {
        const newAssignments = [...assignments];
        const currentAssignment = newAssignments[currentAssignmentIndex];
        const aboveAssignment = newAssignments[currentAssignmentIndex - 1];

        // Swap sort_order values
        const tempOrder = currentAssignment.sort_order;
        currentAssignment.sort_order = aboveAssignment.sort_order;
        aboveAssignment.sort_order = tempOrder;

        setAssignments(newAssignments);
      }

      await tasksApi.moveUp(taskId);
      setSuccessMessage('Aufgabe wurde nach oben verschoben');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      console.error('Move up error:', error);
      loadAssignments(false);
      if (error.response?.status === 400) {
        alert('Aufgabe ist bereits an erster Position');
      } else {
        alert('Fehler beim Verschieben der Aufgabe');
      }
    } finally {
      pendingActionsRef.current--; // Decrement when done
      // SSE updates will now be processed if no more actions are pending
      if (pendingActionsRef.current === 0) {
        // Small delay to ensure server has processed all updates
        setTimeout(() => loadAssignments(false), 50);
      }
    }
  };

  const handleMoveDown = async (taskId: number) => {
    pendingActionsRef.current++; // Increment pending actions counter
    try {
      // Optimistic update: Swap sort_order values (not array positions!)
      const currentAssignmentIndex = assignments.findIndex(a => a.id === taskId);
      if (currentAssignmentIndex < assignments.length - 1 && currentAssignmentIndex !== -1) {
        const newAssignments = [...assignments];
        const currentAssignment = newAssignments[currentAssignmentIndex];
        const belowAssignment = newAssignments[currentAssignmentIndex + 1];

        // Swap sort_order values
        const tempOrder = currentAssignment.sort_order;
        currentAssignment.sort_order = belowAssignment.sort_order;
        belowAssignment.sort_order = tempOrder;

        setAssignments(newAssignments);
      }

      await tasksApi.moveDown(taskId);
      setSuccessMessage('Aufgabe wurde nach unten verschoben');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      console.error('Move down error:', error);
      loadAssignments(false);
      if (error.response?.status === 400) {
        alert('Aufgabe ist bereits an letzter Position');
      } else {
        alert('Fehler beim Verschieben der Aufgabe');
      }
    } finally {
      pendingActionsRef.current--; // Decrement when done
      // SSE updates will now be processed if no more actions are pending
      if (pendingActionsRef.current === 0) {
        // Small delay to ensure server has processed all updates
        setTimeout(() => loadAssignments(false), 50);
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
    : tasks.filter(t => effectiveStatus(t.task) === statusFilter);

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
        // Sort by day first, then by sort_order within each day
        const dayCompare = a.task.day_number - b.task.day_number;
        if (dayCompare !== 0) {
          compareResult = dayCompare;
        } else {
          const sortOrderA = a.task.sort_order ?? 999999;
          const sortOrderB = b.task.sort_order ?? 999999;
          compareResult = sortOrderA - sortOrderB;
        }
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
        const schedA = a.task.scheduled_time || '00:00';
        const schedB = b.task.scheduled_time || '00:00';
        compareResult = schedA.localeCompare(schedB);
        break;
      case 'start':
        const startA = a.task.start_time || '00:00';
        const startB = b.task.start_time || '00:00';
        compareResult = startA.localeCompare(startB);
        break;
      case 'end':
        const endA = a.task.end_time || '00:00';
        const endB = b.task.end_time || '00:00';
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
    pendingActionsRef.current++; // Increment pending actions counter
    try {
      // Optimistic update
      setAssignments(prevAssignments =>
        prevAssignments.map(a =>
          a.id === taskId ? { ...a, status: newStatus } : a
        )
      );

      await client.put(`/tasks/${taskId}`, { status: newStatus });
      setSuccessMessage(`Status wurde auf "${STATUS_LABELS[newStatus]}" geändert`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Change status error:', error);
      // Reload to revert optimistic update
      loadAssignments(false);
      setError('Fehler beim Ändern des Status');
    } finally {
      pendingActionsRef.current--; // Decrement when done
      if (pendingActionsRef.current === 0) {
        setTimeout(() => loadAssignments(false), 50);
      }
    }
  };

  const getTaskDate = (dayNumber: number) => {
    if (!instanceStartDate) return '-';
    const startDate = new Date(instanceStartDate);
    startDate.setDate(startDate.getDate() + dayNumber - 1);
    return startDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  };

  const getTaskStatusColor = (task: TaskAssignment): string =>
    STATUS_COLORS[effectiveStatus(task)] || 'var(--c-text-muted)';

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return ' ↕';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const handleToggleSelectTask = (taskId: number) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSelectAllTasks = () => {
    if (selectedTaskIds.length === sortedTasks.length) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(sortedTasks.map(t => t.task.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTaskIds.length === 0 || !eventId) {
      alert('Bitte mindestens eine Aufgabe auswählen');
      return;
    }

    if (!confirm(`${selectedTaskIds.length} Aufgaben wirklich löschen?`)) return;

    pendingActionsRef.current++;
    try {
      await tasksApi.bulkDelete(eventId, selectedTaskIds);
      setSelectedTaskIds([]);
      setSuccessMessage(`${selectedTaskIds.length} Aufgaben gelöscht`);
      setTimeout(() => setSuccessMessage(''), 3000);
      await loadAssignments(false);
    } catch (error) {
      console.error('Bulk delete error:', error);
      alert('Fehler beim Löschen');
      await loadAssignments(false);
    } finally {
      pendingActionsRef.current--;
    }
  };

  const handleExportSuccess = () => {
    setShowExportModal(false);
  };

  const handleImportSuccess = async () => {
    setShowImportModal(false);
    await loadAssignments(false);
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
        <Toast message={successMessage} onClose={() => setSuccessMessage('')} />
      )}
      {/* Eigene Überschrift entfernt: "Aufgaben" steht bereits darüber.
          Die CSV-Auslöser liegen jetzt dort in der Überschriftenzeile und
          rufen die Modals über die Ref auf - so bleibt die Auswahl beim
          Export erhalten. */}

      {selectedTaskIds.length > 0 && !readOnly && (
        <div style={styles.bulkActions}>
          <span style={styles.bulkActionsText}>{selectedTaskIds.length} ausgewählt</span>
          <button onClick={handleBulkDelete} style={styles.bulkDeleteButton}>
            Ausgewählte löschen
          </button>
          <button onClick={() => setSelectedTaskIds([])} style={styles.bulkCancelButton}>
            Auswahl aufheben
          </button>
        </div>
      )}

      {showExportModal && eventId && (
        <CSVExportModal
          type="tasks"
          items={sortedTasks.map(t => t.task)}
          selectedIds={selectedTaskIds}
          onClose={() => setShowExportModal(false)}
          onSuccess={handleExportSuccess}
          eventId={eventId}
        />
      )}

      {showImportModal && eventId && (
        <CSVImportModal
          type="tasks"
          onClose={() => setShowImportModal(false)}
          onSuccess={handleImportSuccess}
          eventId={eventId}
        />
      )}

      {/* Gemeinsame Werkzeugleiste (styles/toolbar.css) - die Listenansicht
          benutzt exakt dieselben Klassen, damit beide gleich aussehen. */}
      <div className="tv-toolbar">
        {eventDays && eventDays > 1 && (
          <div className="tv-group">
            <span className="tv-label">Tage</span>
            <button
              onClick={() => handleDayChange('all')}
              className={selectedDay === 'all' ? 'tv-chip-active' : 'tv-chip'}
              type="button"
            >
              Alle
            </button>
            {Array.from({ length: eventDays }, (_, i) => i + 1).map((day) => (
              <button
                key={day}
                onClick={() => handleDayChange(day)}
                className={selectedDay === day ? 'tv-chip-active' : 'tv-chip'}
                type="button"
              >
                {day}
              </button>
            ))}
          </div>
        )}

        <div className="tv-group">
          <span className="tv-label">Status</span>
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        </div>

        {sortColumn !== 'manual' && (
          <button
            onClick={() => setSortColumn('manual')}
            className="tv-reset"
            title="Zurück zur manuellen Reihenfolge"
            type="button"
          >
            Sortierung zurücksetzen
          </button>
        )}
      </div>

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
                <th style={styles.th}>
                  <input
                    type="checkbox"
                    checked={selectedTaskIds.length === sortedTasks.length && sortedTasks.length > 0}
                    onChange={handleSelectAllTasks}
                    style={styles.checkbox}
                    title="Alle auswählen für Export"
                  />
                </th>
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
                >
                  Geplante Zeit{getSortIcon('scheduled')}
                </th>
                <th
                  style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('start')}
                >
                  Startzeit{getSortIcon('start')}
                </th>
                <th
                  style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('end')}
                >
                  Endzeit{getSortIcon('end')}
                </th>
                <th
                  style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('status')}
                >
                  Status{getSortIcon('status')}
                </th>
                <th style={styles.th}>Zugewiesen an</th>
                <th style={styles.th}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map(({ task, assignedUsers }) => (
                <tr key={task.id} style={{...styles.row, ...(selectedTaskIds.includes(task.id) ? styles.selectedRow : {})}}>
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.includes(task.id)}
                      onChange={() => handleToggleSelectTask(task.id)}
                      style={styles.checkbox}
                    />
                  </td>
                  <td style={styles.td} className={responsiveStyles.hideOnMobile}>Tag {task.day_number}</td>
                  <td style={styles.td} className={responsiveStyles.hideOnMobile}>{getTaskDate(task.day_number)}</td>
                  <td style={styles.td}>
                    <div style={styles.taskTitle} className={responsiveStyles.taskTitle}>
                      {task.title}
                      {task.is_public && (
                        <span style={styles.publicBadge} className={responsiveStyles.publicBadge}>Öffentlich</span>
                      )}
                      {task.is_active === false && (
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '0.125rem 0.5rem',
                          backgroundColor: 'var(--c-danger-soft)',
                          color: 'var(--c-danger-strong)',
                          borderRadius: '9999px',
                          fontWeight: '500',
                          marginLeft: '0.5rem'
                        }}>Deaktiviert</span>
                      )}
                      {task.series_id && taskSeries.find(s => s.id === task.series_id) && (
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '0.125rem 0.5rem',
                          backgroundColor: assignedUsers.length > 0 ? 'var(--c-border)' : 'var(--c-accent-soft)',
                          color: assignedUsers.length > 0 ? 'var(--c-text-muted)' : 'var(--c-accent-text)',
                          borderRadius: '9999px',
                          fontWeight: '500',
                          marginLeft: '0.5rem',
                          opacity: assignedUsers.length > 0 ? 0.7 : 1
                        }} title={assignedUsers.length > 0 ? 'Individuelle Zuweisung überschreibt Serien-Team' : 'Serien-Team zugewiesen'}>{taskSeries.find(s => s.id === task.series_id)?.name}</span>
                      )}
                    </div>
                    {task.description && (
                      <div style={styles.taskDescription} className={responsiveStyles.taskDescription}>
                        {task.description.length > 30 ? (
                          <>
                            {task.description.substring(0, 30)}...
                            <button
                              onClick={() => setDescriptionModal({ title: task.title, description: task.description! })}
                              style={{
                                marginLeft: '0.5rem',
                                padding: '0.25rem 0.5rem',
                                fontSize: '0.7rem',
                                backgroundColor: 'var(--c-accent-soft)',
                                border: 'none',
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                color: 'var(--c-accent-strong)',
                                fontWeight: '500',
                                display: 'inline-block',
                                verticalAlign: 'baseline'
                              }}
                            >
                              mehr
                            </button>
                          </>
                        ) : (
                          task.description
                        )}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}>{task.scheduled_time ? task.scheduled_time.slice(0, 5) : '-'}</td>
                  <td style={styles.td}>{task.start_time ? task.start_time.slice(0, 5) : '-'}</td>
                  <td style={styles.td}>{task.end_time ? task.end_time.slice(0, 5) : '-'}</td>
                  <td style={styles.td}>
                    <StatusCell
                      value={task.status}
                      label={STATUS_LABELS[effectiveStatus(task)] || task.status}
                      color={getTaskStatusColor(task)}
                      disabled={readOnly}
                      onChange={(v) => handleStatusChange(task.id, v)}
                    />
                  </td>
                  <td style={styles.td}>
                    {assignedUsers.length === 0 ? (
                      // Check if task has series members to show
                      task.series_id && seriesMembers[task.series_id]?.length > 0 ? (
                        <div style={styles.usersList} className={responsiveStyles.usersList}>
                          {seriesMembers[task.series_id].map((member, idx) => (
                            <span key={idx} style={{
                              ...styles.userBadge,
                              backgroundColor: 'var(--c-accent-soft)',
                              color: 'var(--c-accent-text)',
                              border: '1px dashed var(--c-accent-border)'
                            }} className={responsiveStyles.userBadge} title="Serien-Zuweisung">
                              {member.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={styles.noAssignments}>Nicht zugewiesen</span>
                      )
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
                    {!readOnly && (
                      <div style={styles.actions} className={responsiveStyles.actions}>
                        <div className={responsiveStyles.buttonGroup}>
                          <button
                            onClick={() => onAssignTask(task.id)}
                            style={styles.assignButton}
                            title="Mitarbeiter zuweisen"
                          >
                            Zuweisen
                          </button>
                          <button
                            onClick={() => onEditTask(task.id)}
                            style={styles.editButton}
                            title="Aufgabe bearbeiten"
                          >
                            Bearbeiten
                          </button>
                        </div>
                        <div style={{display: 'flex', gap: '0.25rem', justifyContent: 'center'}} className={responsiveStyles.moveButtonGroup}>
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
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Description Modal */}
      {descriptionModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'var(--c-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem'
          }}
          onClick={() => setDescriptionModal(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--c-surface)',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.25rem', fontWeight: '600' }}>
              {descriptionModal.title}
            </h3>
            <p style={{ marginBottom: '1.5rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {descriptionModal.description}
            </p>
            <button
              onClick={() => setDescriptionModal(null)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'var(--c-accent)',
                color: 'var(--c-text-inverse)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    // Keine eigene Card mehr: die Überschrift "Aufgaben-Übersicht", für die
    // dieser Rahmen mal gedacht war, gibt es nicht mehr, und die Listen-
    // ansicht hat auch keine. Der ganze Bereich liegt bereits in der Card
    // des Dashboards - die zweite Ebene hat nur Platz gekostet.
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: 'var(--c-text)',
  },
  headerButtons: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  csvGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  csvButton: {
    padding: '0.25rem 0.125rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text-muted)',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.8125rem',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    textDecorationColor: 'var(--c-border-strong)',
    transition: 'color 0.15s ease',
  },
  csvDivider: {
    width: '1px',
    height: '0.875rem',
    backgroundColor: 'var(--c-border)',
  },
  seriesButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  bulkActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--c-surface-muted)',
    borderRadius: '4px',
    marginBottom: '1rem',
  },
  bulkActionsText: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: 'var(--c-text)',
  },
  bulkDeleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-danger)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  bulkCancelButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-text-muted)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  selectedRow: {
    backgroundColor: 'var(--c-accent-soft)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    flexWrap: 'wrap',
    padding: '0.5rem 0.625rem',
    marginBottom: '1rem',
    backgroundColor: 'var(--c-surface-muted)',
    border: '1px solid var(--c-border)',
    borderRadius: '8px',
  },
  dayFilter: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    flexWrap: 'wrap',
  },
  dayChip: {
    minWidth: '2rem',
    padding: '0.25rem 0.5rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text-muted)',
    border: '1px solid transparent',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: '500',
    transition: 'all 0.12s ease',
  },
  dayChipActive: {
    minWidth: '2rem',
    padding: '0.25rem 0.5rem',
    backgroundColor: 'var(--c-surface)',
    color: 'var(--c-accent-text)',
    border: '1px solid var(--c-accent-border)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: '600',
    boxShadow: 'var(--shadow-sm)',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  resetChip: {
    padding: '0.25rem 0.625rem',
    backgroundColor: 'var(--c-surface)',
    color: 'var(--c-text-muted)',
    border: '1px solid var(--c-border)',
    borderRadius: '9999px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
    marginBottom: '1rem',
  },
  filterLabel: {
    fontSize: '0.75rem',
    fontWeight: '600',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--c-text-subtle)',
  },
  filterSelect: {
    padding: '0.3125rem 1.75rem 0.3125rem 0.625rem',
    border: '1px solid var(--c-border)',
    borderRadius: '6px',
    fontSize: '0.8125rem',
    fontWeight: '500',
    color: 'var(--c-text)',
    backgroundColor: 'var(--c-surface)',
    cursor: 'pointer',
  },
  sortNotice: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginLeft: 'auto',
  },
  sortNoticeText: {
    fontSize: '0.75rem',
    color: 'var(--c-text-subtle)',
  },
  sortResetButton: {
    padding: '0.3125rem 0.625rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text-muted)',
    border: '1px solid var(--c-border)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  loading: {
    padding: '2rem',
    textAlign: 'center',
    color: 'var(--c-text-muted)',
  },
  error: {
    padding: '1rem',
    backgroundColor: 'var(--c-danger-soft)',
    color: 'var(--c-danger-strong)',
    borderRadius: '4px',
  },
  successBanner: {
    padding: '1rem',
    backgroundColor: 'var(--c-success-soft)',
    color: 'var(--c-success-strong)',
    borderRadius: '4px',
    marginBottom: '1rem',
    textAlign: 'center',
    fontWeight: '500',
  },
  noTasks: {
    padding: '2rem',
    textAlign: 'center',
    color: 'var(--c-text-muted)',
  },
  tableWrapper: {
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  headerRow: {
    backgroundColor: 'var(--c-surface-muted)',
    borderBottom: '2px solid var(--c-border)',
  },
  th: {
    padding: '0.75rem',
    textAlign: 'left',
    fontSize: '0.875rem',
    fontWeight: '600',
    color: 'var(--c-text)',
  },
  row: {
    borderBottom: '1px solid var(--c-border)',
  },
  td: {
    padding: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--c-text)',
  },
  taskTitle: {
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  taskDescription: {
    fontSize: '0.75rem',
    color: 'var(--c-text-muted)',
    marginTop: '0.25rem',
  },
  publicBadge: {
    fontSize: '0.7rem',
    padding: '0.125rem 0.5rem',
    backgroundColor: 'var(--c-accent-soft)',
    color: 'var(--c-accent-text)',
    borderRadius: '9999px',
    fontWeight: '500',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '500',
    color: 'var(--c-text-inverse)',
  },
  noAssignments: {
    color: 'var(--c-text-subtle)',
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
    backgroundColor: 'var(--c-accent-soft)',
    color: 'var(--c-accent-strong)',
    border: 'none',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '500',
  },
  completedIcon: {
    color: 'var(--c-success-text)',
    fontWeight: 'bold',
  },
  unassignButton: {
    padding: '0',
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    color: 'var(--c-danger-text)',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.7rem',
    fontWeight: '600',
    borderRadius: '50%',
    transition: 'background-color 0.2s',
  },
  actions: {
    display: 'flex',
    gap: '0.5rem',
  },
  editButton: {
    padding: '0.3125rem 0.625rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text-muted)',
    border: '1px solid var(--c-border)',
    borderRadius: '6px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  assignButton: {
    padding: '0.3125rem 0.625rem',
    backgroundColor: 'transparent',
    color: 'var(--c-accent-text)',
    border: '1px solid var(--c-accent-border)',
    borderRadius: '6px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  deleteButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: 'var(--c-danger)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  deactivateButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: 'var(--c-warning)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  activateButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  moveButton: {
    padding: '0.25rem 0.375rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text-subtle)',
    border: '1px solid var(--c-border)',
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
    borderBottom: '2px solid var(--c-border)',
    paddingBottom: '0.5rem',
    overflowX: 'auto',
  },
  dayTab: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text-muted)',
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
    color: 'var(--c-accent-text)',
    border: 'none',
    borderBottom: '2px solid var(--c-accent)',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '600',
    whiteSpace: 'nowrap' as const,
  },
};
