import React, { useState, useEffect } from 'react';
import { eventsApi } from '../../api/events';
import { tasksApi, Task } from '../../api/tasks';
import { usersApi, User } from '../../api/users';
import { programApi, ProgramItem } from '../../api/program';
import { TaskFormModal } from './TaskFormModal';
import { TaskAssignmentModal } from './TaskAssignmentModal';
import { TaskTableView } from './TaskTableView';
import { DuplicateEventModal } from './DuplicateEventModal';
import { EventStaffPool } from './EventStaffPool';
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

  useEffect(() => {
    loadData();
  }, [eventId]);

  const loadData = async () => {
    try {
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
      if (eventData.instances.length > 0) {
        setSelectedInstance(eventData.instances[0].id);
      }
    } catch (error) {
      console.error('Load event detail error:', error);
    } finally {
      setLoading(false);
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

  const handleDayChange = async (day: number) => {
    setSelectedDay(day);
    await loadData(); // Reload data when switching days
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
          {event.instances.map((instance: any) => (
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
              >
                📋 Liste
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={viewMode === 'table' ? styles.viewButtonActive : styles.viewButton}
              >
                📊 Tabelle
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

        {viewMode === 'list' ? (
          <TaskListView
            tasks={tasks.filter(task => selectedDay === 'all' || task.day_number === selectedDay)}
            selectedDay={typeof selectedDay === 'number' ? selectedDay : 1}
            selectedInstance={selectedInstance}
            onEditTask={handleEditTask}
            onAssignTask={handleAssignTask}
          />
        ) : (
          selectedInstance && (
            <TaskTableView
              eventInstanceId={selectedInstance}
              onEditTask={handleEditTask}
              onAssignTask={handleAssignTask}
              eventDays={event?.days}
              selectedDay={selectedDay}
              onSelectedDayChange={setSelectedDay}
              instanceStartDate={event?.instances.find((i: any) => i.id === selectedInstance)?.start_date}
            />
          )
        )}
      </div>

      {showTaskForm && (
        <TaskFormModal
          eventId={eventId}
          task={editTask}
          eventInstances={event?.instances}
          defaultDay={typeof selectedDay === 'number' ? selectedDay : 1}
          onClose={() => {
            setShowTaskForm(false);
            setEditTask(null);
          }}
          onSuccess={() => {
            setShowTaskForm(false);
            setEditTask(null);
            loadData();
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
            loadData();
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
  tasks: Task[];
  selectedDay: number;
  selectedInstance: number | null;
  onEditTask: (task: Task) => void;
  onAssignTask: (taskId: number) => void;
}

const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  selectedDay,
  selectedInstance,
  onEditTask,
  onAssignTask,
}) => {
  const [assignments, setAssignments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (selectedInstance) {
      loadAssignments();
    }
  }, [selectedInstance, tasks]);

  const loadAssignments = async () => {
    if (!selectedInstance) return;

    try {
      setLoading(true);
      const client = (await import('../../api/client')).default;
      const response = await client.get(`/tasks/instance/${selectedInstance}/assignments`);
      setAssignments(response.data);
    } catch (error) {
      console.error('Load assignments error:', error);
    } finally {
      setLoading(false);
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

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      not_started: 'Nicht gestartet',
      in_progress: 'In Arbeit',
      completed: 'Erledigt',
      overdue: 'Überfällig',
    };
    return labels[status] || status;
  };

  if (tasks.length === 0) {
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
      {tasks.map((task) => {
        const taskAssignments = getAssignmentsForTask(task.id);

        return (
          <div key={task.id} className={styles.taskItemExtended}>
            <div className={styles.taskMainInfo}>
              <div className={styles.taskHeader}>
                <strong className={styles.taskTitle}>{task.title}</strong>
                <span
                  className={styles.statusBadge}
                  style={{ backgroundColor: getStatusColor(task.status) }}
                >
                  {getStatusLabel(task.status)}
                </span>
              </div>

              {task.description && (
                <div className={styles.taskDescription}>{task.description}</div>
              )}

              <div className={styles.taskDetails}>
                <div className={styles.taskTimesGrid}>
                  {task.scheduled_time && (
                    <div className={styles.timeItem}>
                      <span className={styles.timeLabel}>📅 Geplant:</span>
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

                {task.is_public && (
                  <div className={styles.publicIndicator}>
                    🌐 Öffentliche Aufgabe
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
            </div>
          </div>
        );
      })}
    </div>
  );
};
