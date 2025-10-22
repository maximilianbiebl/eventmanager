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
  const [viewMode, setViewMode] = useState<'list' | 'table'>('list');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(1);

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

  if (loading) {
    return <div>Lade Details...</div>;
  }

  return (
    <div>
      <div style={styles.topBar}>
        <button onClick={onBack} style={styles.backButton}>
          ← Zurück
        </button>
        <button onClick={() => setShowDuplicateModal(true)} style={styles.duplicateButton}>
          📋 Event duplizieren
        </button>
      </div>

      <h2 style={styles.title}>{event.name}</h2>
      {event.description && <p style={styles.description}>{event.description}</p>}

      <div style={styles.section}>
        <h3>Durchführungen</h3>
        <div style={styles.instances}>
          {event.instances.map((instance: any) => (
            <button
              key={instance.id}
              onClick={() => setSelectedInstance(instance.id)}
              style={selectedInstance === instance.id ? styles.instanceActive : styles.instance}
            >
              #{instance.instance_number} -{' '}
              {new Date(instance.start_date).toLocaleDateString('de-DE')}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <EventStaffPool eventId={eventId} />
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3>Aufgaben</h3>
          <div style={styles.headerActions}>
            <div style={styles.viewToggle}>
              <button
                onClick={() => setViewMode('list')}
                style={viewMode === 'list' ? styles.viewButtonActive : styles.viewButton}
              >
                📋 Liste
              </button>
              <button
                onClick={() => setViewMode('table')}
                style={viewMode === 'table' ? styles.viewButtonActive : styles.viewButton}
              >
                📊 Tabelle
              </button>
            </div>
            <button onClick={handleCreateTask} style={styles.addButton}>
              + Neue Aufgabe
            </button>
          </div>
        </div>

        {/* Tag-Tabs */}
        {event && event.days > 0 && (
          <div style={styles.dayTabs}>
            {Array.from({ length: event.days }, (_, i) => i + 1).map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                style={selectedDay === day ? styles.dayTabActive : styles.dayTab}
              >
                Tag {day}
              </button>
            ))}
          </div>
        )}

        {viewMode === 'list' ? (
          <div style={styles.tasksList}>
            {tasks.filter(task => task.day_number === selectedDay).length === 0 ? (
              <p>Keine Aufgaben für Tag {selectedDay} vorhanden</p>
            ) : (
              tasks.filter(task => task.day_number === selectedDay).map((task) => (
                <div key={task.id} style={styles.taskItem}>
                  <div>
                    <strong>{task.title}</strong>
                    <div style={styles.taskMeta}>
                      Tag {task.day_number}
                      {task.scheduled_time && ` - ${task.scheduled_time} Uhr`}
                    </div>
                  </div>
                  <div style={styles.taskActions}>
                    <button onClick={() => handleEditTask(task)} style={styles.editButton}>
                      Bearbeiten
                    </button>
                    <button onClick={() => handleAssignTask(task.id)} style={styles.assignButton}>
                      Zuweisen
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          selectedInstance && (
            <TaskTableView
              eventInstanceId={selectedInstance}
              onEditTask={handleEditTask}
              onAssignTask={handleAssignTask}
            />
          )
        )}
      </div>

      {showTaskForm && (
        <TaskFormModal
          eventId={eventId}
          task={editTask}
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

const styles: { [key: string]: React.CSSProperties } = {
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  backButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  duplicateButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  title: {
    fontSize: '1.875rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
  },
  description: {
    color: '#6b7280',
    marginBottom: '1.5rem',
  },
  section: {
    marginBottom: '2rem',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  headerActions: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  viewToggle: {
    display: 'flex',
    gap: '0.25rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  viewButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'white',
    color: '#374151',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  viewButtonActive: {
    padding: '0.5rem 1rem',
    backgroundColor: '#4f46e5',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  addButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  dayTabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '0.5rem',
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
  },
  instances: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  instance: {
    padding: '0.5rem 1rem',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  instanceActive: {
    padding: '0.5rem 1rem',
    backgroundColor: '#4f46e5',
    color: 'white',
    border: '1px solid #4f46e5',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  tasksList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  taskItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
  },
  taskMeta: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginTop: '0.25rem',
  },
  taskActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  editButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#f59e0b',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  assignButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#4f46e5',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};
