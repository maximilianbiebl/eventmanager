import React, { useState, useEffect } from 'react';
import { eventsApi } from '../../api/events';
import { tasksApi, Task } from '../../api/tasks';
import { usersApi, User } from '../../api/users';
import { programApi, ProgramItem } from '../../api/program';
import { useSSE } from '../../hooks/useSSE';
import { TaskFormModal } from './TaskFormModal';
import { TaskAssignmentModal } from './TaskAssignmentModal';
import { TaskTableView } from './TaskTableView';
import { DuplicateEventModal } from './DuplicateEventModal';
import { EventStaffPool } from './EventStaffPool';
import { Toast } from '../Toast';
import styles from './EventDetail.module.css';

interface Props {
  eventId: number;
  onBack: () => void;
}

export const EventDetail: React.FC<Props> = ({ eventId, onBack }) => {
  const [event, setEvent] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [_program, setProgram] = useState<ProgramItem[]>([]);
  const [_users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInstance, setSelectedInstance] = useState<number | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTaskId, setAssignTaskId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'table'>('table'); // Table ist jetzt Standard
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [manualRefreshTrigger, setManualRefreshTrigger] = useState(0);

  useEffect(() => {
    loadData();

    // SSE handles live updates, no need for polling fallback
    // The 30-second interval was causing unnecessary reloads
  }, [eventId]);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const [eventData, tasksData, programData, usersData] = await Promise.all([
        eventsApi.getById(eventId),
        tasksApi.getByEvent(eventId),
        programApi.getByEvent(eventId),
        usersApi.getAll(),
      ]);

      setEvent(eventData);
      setTasks(tasksData);
      setProgram(programData);
      setUsers(usersData);
      if (eventData.instances.length > 0 && !selectedInstance) {
        setSelectedInstance(eventData.instances[0].id);
      }
    } catch (error) {
      console.error('Load event detail error:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleCreateTask = () => {
    setEditTask(null);
    setShowTaskForm(true);
  };

  const handleEditTask = (taskOrId: Task | number) => {
    if (typeof taskOrId === 'number') {
      const task = tasks.find(t => t.id === taskOrId);
      if (task) {
        setEditTask(task);
        setShowTaskForm(true);
      }
    } else {
      setEditTask(taskOrId);
      setShowTaskForm(true);
    }
  };

  const handleAssignTask = (taskId: number) => {
    if (!selectedInstance) {
      alert('Bitte wähle eine Durchführung aus');
      return;
    }
    setAssignTaskId(taskId);
    setShowAssignModal(true);
  };

  const handleDayChange = (day: number) => {
    setSelectedDay(day);
    // No reload needed - filter client-side
  };

  if (loading) {
    return <div>Lade Details...</div>;
  }

  return (
    <div>
      <div className={styles.topBar}>
        <button onClick={onBack} className={styles.backButton}>
          ← Zurück
        </button>
        <button onClick={() => setShowDuplicateModal(true)} className={styles.duplicateButton}>
          📋 Event duplizieren
        </button>
      </div>

      <h2 className={styles.title}>{event.name}</h2>
      {event.description && <p className={styles.description}>{event.description}</p>}

      <div className={styles.section}>
        <h3>Durchführungen</h3>
        <div className={styles.instances}>
          {(event as any).instances.map((instance: any) => (
            <button
              key={instance.id}
              onClick={() => setSelectedInstance(instance.id)}
              className={selectedInstance === instance.id ? styles.instanceActive : styles.instance}
            >
              #{instance.instance_number} -{' '}
              {new Date(instance.start_date).toLocaleDateString('de-DE')}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <EventStaffPool eventId={eventId} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Aufgaben</h3>
          <div className={styles.headerActions}>
            <div className={styles.viewToggle}>
              <button
                onClick={() => {
                  setViewMode('list');
                  if (selectedDay === 'all') setSelectedDay(1);
                }}
                className={viewMode === 'list' ? styles.viewButtonActive : styles.viewButton}
                type="button"
              >
                📋 Liste
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={viewMode === 'table' ? styles.viewButtonActive : styles.viewButton}
                type="button"
              >
                📊 Tabelle
              </button>
              <button
                onClick={() => {
                  loadData(false);
                  setManualRefreshTrigger(prev => prev + 1);
                }}
                className={styles.viewButton}
                title="Daten aktualisieren"
                type="button"
              >
                🔄 Aktualisieren
              </button>
            </div>
            <button onClick={handleCreateTask} className={styles.addButton}>
              + Neue Aufgabe
            </button>
          </div>
        </div>

        {/* Tag-Tabs - nur für List-Ansicht */}
        {event && event.days > 0 && viewMode === 'list' && (
          <div className={styles.dayTabs}>
            {Array.from({ length: event.days }, (_, i) => i + 1).map((day) => (
              <button
                key={day}
                onClick={() => handleDayChange(day)}
                className={selectedDay === day ? styles.dayTabActive : styles.dayTab}
              >
                Tag {day}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: viewMode === 'list' ? 'block' : 'none' }}>
          <TaskListView
            selectedDay={selectedDay}
            selectedInstance={selectedInstance}
            onEditTask={handleEditTask}
            onAssignTask={handleAssignTask}
            event={event}
            manualRefreshTrigger={manualRefreshTrigger}
          />
        </div>
        {selectedInstance && (
          <div style={{ display: viewMode === 'table' ? 'block' : 'none' }}>
            <TaskTableView
              eventInstanceId={selectedInstance}
              onEditTask={handleEditTask}
              onAssignTask={handleAssignTask}
              eventDays={event?.days}
              selectedDay={selectedDay}
              onSelectedDayChange={setSelectedDay}
              instanceStartDate={(event as any)?.instances.find((i: any) => i.id === selectedInstance)?.start_date}
              manualRefreshTrigger={manualRefreshTrigger}
            />
          </div>
        )}
      </div>

      {showTaskForm && (
        <TaskFormModal
          eventId={eventId}
          task={editTask}
          eventInstances={(event as any)?.instances}
          defaultDay={typeof selectedDay === 'number' ? selectedDay : 1}
          onClose={() => {
            setShowTaskForm(false);
            setEditTask(null);
          }}
          onSuccess={() => {
            setShowTaskForm(false);
            setEditTask(null);
            loadData(false); // Update without loading indicator
          }}
        />
      )}

      {showAssignModal && assignTaskId && selectedInstance && (
        <TaskAssignmentModal
          taskId={assignTaskId}
          eventId={eventId}
          eventInstanceId={selectedInstance}
          onClose={() => {
            setShowAssignModal(false);
            setAssignTaskId(null);
          }}
          onSuccess={() => {
            setShowAssignModal(false);
            setAssignTaskId(null);
            loadData(false); // Update without loading indicator
          }}
        />
      )}

      {showDuplicateModal && (
        <DuplicateEventModal
          event={event}
          onClose={() => setShowDuplicateModal(false)}
          onSuccess={() => {
            setShowDuplicateModal(false);
            onBack(); // Zurück zur Event-Liste nach erfolgreichem Duplizieren
          }}
        />
      )}
    </div>
  );
};

// Erweiterte Listen-Ansicht mit Zeiten, MAs und Status
interface TaskListViewProps {
  selectedDay: number | 'all';
  selectedInstance: number | null;
  onEditTask: (task: Task) => void;
  onAssignTask: (taskId: number) => void;
  event?: any; // Für overdue check
  manualRefreshTrigger?: number;
}

const TaskListView: React.FC<TaskListViewProps> = ({
  selectedDay,
  selectedInstance,
  onEditTask,
  onAssignTask,
  event,
  manualRefreshTrigger,
}) => {
  const [assignments, setAssignments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [successMessage, setSuccessMessage] = React.useState('');
  const [sortBy, setSortBy] = React.useState<'manual' | 'time' | 'title' | 'status'>('manual');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [expandedDescriptions, setExpandedDescriptions] = React.useState<Set<number>>(new Set());

  // SSE for real-time updates
  useSSE({
    enabled: true,
    onTaskUpdate: (data) => {
      console.log('SSE: TaskListView update received', data);
      if (selectedInstance) {
        loadAssignments(false);
      }
    },
    onConnected: () => {
      console.log('SSE: TaskListView connected');
    },
    onError: (error) => {
      console.error('SSE: TaskListView error', error);
    }
  });

  React.useEffect(() => {
    if (selectedInstance) {
      loadAssignments();
    }
  }, [selectedInstance]);

  // React to manual refresh from parent
  React.useEffect(() => {
    if (manualRefreshTrigger !== undefined && manualRefreshTrigger > 0 && selectedInstance) {
      loadAssignments(false);
    }
  }, [manualRefreshTrigger]);

  const checkAndUpdateOverdueTasks = async (tasks: any[], instance: any) => {
    if (!instance) return;

    const now = new Date();
    const updates: Promise<void>[] = [];

    for (const task of tasks) {
      if (task.status !== 'completed' && task.status !== 'overdue' && task.end_time) {
        // Parse task date and time
        const taskDate = new Date(instance.start_date);
        taskDate.setDate(taskDate.getDate() + task.day_number - 1);

        // Parse end time (format: "HH:MM")
        const [hours, minutes] = task.end_time.split(':').map(Number);
        taskDate.setHours(hours, minutes, 0, 0);

        // Check if task is overdue
        if (now > taskDate) {
          const { tasksApi } = await import('../../api/tasks');
          updates.push(
            tasksApi.updateStatus(task.id, 'overdue').catch(err => {
              console.error('Failed to mark task as overdue:', err);
            })
          );
          task.status = 'overdue';
        }
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  };

  const loadAssignments = async (showLoading = true) => {
    if (!selectedInstance) return;

    try {
      if (showLoading) {
        setLoading(true);
      }
      const client = (await import('../../api/client')).default;
      const response = await client.get(`/tasks/instance/${selectedInstance}/assignments`);
      const data = response.data;

      // Get current instance for date calculation
      const currentInstance = event && (event as any).instances
        ? (event as any).instances.find((i: any) => i.id === selectedInstance)
        : null;

      // Check for overdue tasks
      if (currentInstance) {
        await checkAndUpdateOverdueTasks(data, currentInstance);
      }

      setAssignments(data);
    } catch (error) {
      console.error('Load assignments error:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const getAssignmentsForTask = (taskId: number) => {
    return assignments.filter(a => a.id === taskId && a.user_name);
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

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    try {
      // Optimistic update
      setAssignments(prevAssignments =>
        prevAssignments.map(a =>
          a.id === taskId ? { ...a, status: newStatus } : a
        )
      );

      const client = (await import('../../api/client')).default;
      await client.put(`/tasks/${taskId}`, { status: newStatus });
      setSuccessMessage(`Status wurde geändert`);
      setTimeout(() => setSuccessMessage(''), 3000);
      // SSE will sync the final state from server
    } catch (error) {
      console.error('Change status error:', error);
      // Reload to revert optimistic update
      loadAssignments(false);
      alert('Fehler beim Ändern des Status');
    }
  };

  const handleMoveUp = async (taskId: number) => {
    try {
      const { tasksApi } = await import('../../api/tasks');

      // Optimistic update
      const currentIndex = assignments.findIndex((a: any) => a.id === taskId);
      if (currentIndex > 0) {
        const newAssignments = [...assignments];
        [newAssignments[currentIndex], newAssignments[currentIndex - 1]] =
        [newAssignments[currentIndex - 1], newAssignments[currentIndex]];
        setAssignments(newAssignments);
      }

      await tasksApi.moveUp(taskId);
      setSuccessMessage('Aufgabe wurde nach oben verschoben');
      setTimeout(() => setSuccessMessage(''), 3000);
      // SSE will sync the final state from server
    } catch (error: any) {
      console.error('Move up error:', error);
      // Reload to revert optimistic update
      loadAssignments(false);
      alert(error.response?.data?.error || 'Fehler beim Verschieben der Aufgabe');
    }
  };

  const handleMoveDown = async (taskId: number) => {
    try {
      const { tasksApi } = await import('../../api/tasks');

      // Optimistic update
      const currentIndex = assignments.findIndex((a: any) => a.id === taskId);
      if (currentIndex < assignments.length - 1 && currentIndex !== -1) {
        const newAssignments = [...assignments];
        [newAssignments[currentIndex], newAssignments[currentIndex + 1]] =
        [newAssignments[currentIndex + 1], newAssignments[currentIndex]];
        setAssignments(newAssignments);
      }

      await tasksApi.moveDown(taskId);
      setSuccessMessage('Aufgabe wurde nach unten verschoben');
      setTimeout(() => setSuccessMessage(''), 3000);
      // SSE will sync the final state from server
    } catch (error: any) {
      console.error('Move down error:', error);
      // Reload to revert optimistic update
      loadAssignments(false);
      alert(error.response?.data?.error || 'Fehler beim Verschieben der Aufgabe');
    }
  };

  // Group assignments by task ID and get unique tasks
  const uniqueTasks = React.useMemo(() => {
    const taskMap = new Map<number, any>();
    assignments.forEach(a => {
      if (!taskMap.has(a.id)) {
        taskMap.set(a.id, a);
      }
    });
    return Array.from(taskMap.values());
  }, [assignments]);

  // Filter by selected day
  const filteredTasks = React.useMemo(() => {
    if (selectedDay === 'all') return uniqueTasks;
    return uniqueTasks.filter(t => t.day_number === selectedDay);
  }, [uniqueTasks, selectedDay]);

  const sortedTasks = React.useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      let compareResult = 0;

      switch (sortBy) {
        case 'manual':
          // Sort by sort_order if available
          const orderA = a.sort_order ?? 999999;
          const orderB = b.sort_order ?? 999999;
          compareResult = orderA - orderB;
          break;
        case 'time':
          const timeA = a.start_time || a.scheduled_time || '99:99';
          const timeB = b.start_time || b.scheduled_time || '99:99';
          compareResult = timeA.localeCompare(timeB);
          break;
        case 'title':
          compareResult = a.title.localeCompare(b.title);
          break;
        case 'status':
          compareResult = a.status.localeCompare(b.status);
          break;
      }

      return sortDirection === 'asc' ? compareResult : -compareResult;
    });
  }, [filteredTasks, sortBy, sortDirection]);

  if (uniqueTasks.length === 0 && !loading) {
    return (
      <div className={styles.tasksList}>
        <p>Keine Aufgaben vorhanden</p>
      </div>
    );
  }

  if (filteredTasks.length === 0 && !loading && uniqueTasks.length > 0) {
    return (
      <div className={styles.tasksList}>
        <p>Keine Aufgaben für Tag {selectedDay} vorhanden</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.tasksList}>
        <p>Lade Zuweisungen...</p>
      </div>
    );
  }

  return (
    <div className={styles.tasksList}>
      {successMessage && (
        <Toast message={successMessage} onClose={() => setSuccessMessage('')} />
      )}

      {/* Sort Controls */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        marginBottom: '1rem',
        padding: '0.75rem',
        backgroundColor: '#f9fafb',
        borderRadius: '4px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <span style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151' }}>Sortieren nach:</span>
        <button
          onClick={() => setSortBy('manual')}
          style={{
            padding: '0.375rem 0.75rem',
            backgroundColor: sortBy === 'manual' ? '#3b82f6' : 'white',
            color: sortBy === 'manual' ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '0.875rem',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          Manuell {sortBy === 'manual' ? '📌' : ''}
        </button>
        <button
          onClick={() => {
            if (sortBy === 'time') {
              setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
            } else {
              setSortBy('time');
              setSortDirection('asc');
            }
          }}
          style={{
            padding: '0.375rem 0.75rem',
            backgroundColor: sortBy === 'time' ? '#3b82f6' : 'white',
            color: sortBy === 'time' ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '0.875rem',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          Zeit {sortBy === 'time' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button
          onClick={() => {
            if (sortBy === 'title') {
              setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
            } else {
              setSortBy('title');
              setSortDirection('asc');
            }
          }}
          style={{
            padding: '0.375rem 0.75rem',
            backgroundColor: sortBy === 'title' ? '#3b82f6' : 'white',
            color: sortBy === 'title' ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '0.875rem',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          Titel {sortBy === 'title' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button
          onClick={() => {
            if (sortBy === 'status') {
              setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
            } else {
              setSortBy('status');
              setSortDirection('asc');
            }
          }}
          style={{
            padding: '0.375rem 0.75rem',
            backgroundColor: sortBy === 'status' ? '#3b82f6' : 'white',
            color: sortBy === 'status' ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '0.875rem',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          Status {sortBy === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </button>
      </div>

      {sortedTasks.map((task) => {
        const taskAssignments = getAssignmentsForTask(task.id);
        const maxLength = 100;
        const isExpanded = expandedDescriptions.has(task.id);
        const truncatedDesc = task.description && task.description.length > maxLength
          ? task.description.substring(0, maxLength) + '...'
          : task.description;

        const toggleDescription = () => {
          const newExpanded = new Set(expandedDescriptions);
          if (isExpanded) {
            newExpanded.delete(task.id);
          } else {
            newExpanded.add(task.id);
          }
          setExpandedDescriptions(newExpanded);
        };

        return (
          <div
            key={task.id}
            className={styles.taskItemExtended}
            style={{ borderLeft: `4px solid ${getStatusColor(task.status)}` }}
          >
            <div className={styles.taskMainInfo}>
              <div className={styles.taskHeader}>
                <div style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <strong className={styles.taskTitle}>{task.title}</strong>
                    {task.is_public && (
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.125rem 0.5rem',
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                        borderRadius: '9999px',
                        fontWeight: '500'
                      }}>Öffentlich</span>
                    )}
                    {task.is_active === false && (
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.125rem 0.5rem',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        borderRadius: '9999px',
                        fontWeight: '500'
                      }}>Deaktiviert</span>
                    )}
                  </div>
                </div>
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task.id, e.target.value)}
                  className={styles.statusSelect}
                  style={{
                    backgroundColor: getStatusColor(task.status),
                    fontSize: '0.75rem',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontWeight: '500',
                    color: 'white',
                    border: 'none'
                  }}
                >
                  <option value="not_started">Nicht gestartet</option>
                  <option value="in_progress">In Arbeit</option>
                  <option value="completed">Erledigt</option>
                  <option value="overdue">Überfällig</option>
                </select>
              </div>

              {task.description && (
                <div className={styles.taskDescription}>
                  <span>{isExpanded ? task.description : truncatedDesc}</span>
                  {task.description.length > maxLength && (
                    <button
                      onClick={toggleDescription}
                      style={{
                        marginLeft: '0.5rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.7rem',
                        backgroundColor: '#e0e7ff',
                        border: 'none',
                        borderRadius: '9999px',
                        cursor: 'pointer',
                        color: '#3730a3',
                        fontWeight: '500',
                        verticalAlign: 'baseline'
                      }}
                    >
                      {isExpanded ? 'weniger' : 'mehr'}
                    </button>
                  )}
                </div>
              )}

              <div className={styles.taskDetails}>
                <div className={styles.taskTimesGrid}>
                  {task.scheduled_time && (
                    <div className={styles.timeItem}>
                      <span className={styles.timeLabel}>⏰ Geplant:</span>
                      <span className={styles.timeValue}>{task.scheduled_time} Uhr</span>
                    </div>
                  )}
                  {task.start_time && (
                    <div className={styles.timeItem}>
                      <span className={styles.timeLabel}>🚀 Start:</span>
                      <span className={styles.timeValue}>{task.start_time} Uhr</span>
                    </div>
                  )}
                  {task.end_time && (
                    <div className={styles.timeItem}>
                      <span className={styles.timeLabel}>🏁 Ende:</span>
                      <span className={styles.timeValue}>{task.end_time} Uhr</span>
                    </div>
                  )}
                </div>

                {taskAssignments.length > 0 && (
                  <div className={styles.assignmentsSection}>
                    <span className={styles.assignmentsLabel}>👥 Zugewiesen an:</span>
                    <div className={styles.assignmentsList}>
                      {taskAssignments.map((assignment, idx) => (
                        <span key={idx} className={styles.assignmentBadge}>
                          {assignment.user_name}
                          {assignment.completed && <span className={styles.completedMark}>✓</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.taskActions}>
              <button onClick={() => onEditTask(task)} className={styles.editButton}>
                Bearbeiten
              </button>
              <button onClick={() => onAssignTask(task.id)} className={styles.assignButton}>
                Zuweisen
              </button>
              {sortBy === 'manual' && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
                  <button
                    onClick={() => handleMoveUp(task.id)}
                    style={{
                      padding: '0.25rem 0.375rem',
                      backgroundColor: 'transparent',
                      color: '#9ca3af',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 'normal',
                      lineHeight: '1',
                      transition: 'all 0.2s'
                    }}
                    title="Aufgabe nach oben verschieben"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleMoveDown(task.id)}
                    style={{
                      padding: '0.25rem 0.375rem',
                      backgroundColor: 'transparent',
                      color: '#9ca3af',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 'normal',
                      lineHeight: '1',
                      transition: 'all 0.2s'
                    }}
                    title="Aufgabe nach unten verschieben"
                  >
                    ▼
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
