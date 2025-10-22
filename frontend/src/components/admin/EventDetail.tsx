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
                onClick={() => setViewMode('list')}
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

        {/* Tag-Tabs */}
        {event && event.days > 0 && (
          <div className={styles.dayTabs}>
            {Array.from({ length: event.days }, (_, i) => i + 1).map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={selectedDay === day ? styles.dayTabActive : styles.dayTab}
              >
                Tag {day}
              </button>
            ))}
          </div>
        )}

        {viewMode === 'list' ? (
          <div className={styles.tasksList}>
            {tasks.filter(task => task.day_number === selectedDay).length === 0 ? (
              <p>Keine Aufgaben für Tag {selectedDay} vorhanden</p>
            ) : (
              tasks.filter(task => task.day_number === selectedDay).map((task) => (
                <div key={task.id} className={styles.taskItem}>
                  <div className={styles.taskInfo}>
                    <strong>{task.title}</strong>
                    <div className={styles.taskMeta}>
                      Tag {task.day_number}
                      {task.scheduled_time && ` - ${task.scheduled_time} Uhr`}
                    </div>
                  </div>
                  <div className={styles.taskActions}>
                    <button onClick={() => handleEditTask(task)} className={styles.editButton}>
                      Bearbeiten
                    </button>
                    <button onClick={() => handleAssignTask(task.id)} className={styles.assignButton}>
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
          eventInstances={event?.instances}
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
