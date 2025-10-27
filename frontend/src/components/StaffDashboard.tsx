import React, { useState, useEffect } from 'react';
import { tasksApi, TaskAssignment } from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { StaffSettings } from './StaffSettings';
import styles from './StaffDashboard.module.css';

export const StaffDashboard: React.FC = () => {
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<'event-day' | 'event' | 'date'>('event-day');
  const [showSettings, setShowSettings] = useState(false);
  const { user, logout } = useAuth();
  const notifications = useNotifications();

  useEffect(() => {
    loadTasks();

    // Auto-refresh alle 30 Sekunden für Status-Synchronisation
    const interval = setInterval(() => {
      loadTasks();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadTasks = async () => {
    try {
      const data = await tasksApi.getMyTasks();
      setTasks(data);
    } catch (error) {
      console.error('Load tasks error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (assignmentId: number) => {
    try {
      await tasksApi.complete(assignmentId);
      await loadTasks();
    } catch (error) {
      console.error('Complete task error:', error);
      alert('Fehler beim Markieren der Aufgabe');
    }
  };

  const handleEnableNotifications = async () => {
    const success = await notifications.subscribe();
    if (success) {
      alert('Benachrichtigungen aktiviert!');
    } else {
      alert('Benachrichtigungen konnten nicht aktiviert werden. Bitte prüfen Sie die Browser-Einstellungen.');
    }
  };

  const handleTestNotification = async () => {
    await notifications.sendTestNotification();
  };

  const groupedTasks = groupTasksByDay(tasks);
  const eventGroups = groupTasksByEvent(tasks);
  const eventDayGroups = groupTasksByEventDay(tasks);

  if (loading) {
    return <div className={styles.loading}>Lade Aufgaben...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Meine Aufgaben</h1>
          <p className={styles.subtitle}>Willkommen, {user?.name}!</p>
        </div>
        <div className={styles.headerButtons}>
          <button onClick={() => setShowSettings(true)} className={styles.settingsButton}>
            ⚙️ Einstellungen
          </button>
          <button onClick={logout} className={styles.logoutButton}>
            Abmelden
          </button>
        </div>
      </div>

      {/* Benachrichtigungen - Banner nur wenn nicht aktiviert */}
      {notifications.isSupported && !notifications.isSubscribed && (
        <div className={styles.notificationBanner}>
          <p>Aktiviere Benachrichtigungen um an deine Aufgaben erinnert zu werden!</p>
          <button onClick={handleEnableNotifications} className={styles.enableButton}>
            Benachrichtigungen aktivieren
          </button>
        </div>
      )}

      {/* Gruppierung wählen */}
      <div className={styles.controls}>
        <button
          onClick={() => setGroupBy('event-day')}
          className={groupBy === 'event-day' ? styles.activeTab : styles.tab}
        >
          Nach Event-Tag
        </button>
        <button
          onClick={() => setGroupBy('event')}
          className={groupBy === 'event' ? styles.activeTab : styles.tab}
        >
          Nach Veranstaltung
        </button>
        <button
          onClick={() => setGroupBy('date')}
          className={groupBy === 'date' ? styles.activeTab : styles.tab}
        >
          Nach Datum
        </button>
      </div>

      {/* Aufgabenliste */}
      {tasks.length === 0 ? (
        <div className={styles.empty}>Keine Aufgaben vorhanden</div>
      ) : groupBy === 'event-day' ? (
        <div>
          {Object.entries(eventDayGroups).map(([groupKey, groupTasks]) => (
            <div key={groupKey} className={styles.group}>
              <h2 className={styles.groupTitle}>{groupKey}</h2>
              <div className={styles.taskList}>
                {groupTasks.map((task) => (
                  <TaskCard key={task.assignment_id} task={task} onComplete={handleComplete} onReminderUpdate={loadTasks} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : groupBy === 'date' ? (
        <div>
          {Object.entries(groupedTasks).map(([day, dayTasks]) => (
            <div key={day} className={styles.group}>
              <h2 className={styles.groupTitle}>{day}</h2>
              <div className={styles.taskList}>
                {dayTasks.map((task) => (
                  <TaskCard key={task.assignment_id} task={task} onComplete={handleComplete} onReminderUpdate={loadTasks} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {Object.entries(eventGroups).map(([eventName, eventTasks]) => (
            <div key={eventName} className={styles.group}>
              <h2 className={styles.groupTitle}>{eventName}</h2>
              <div className={styles.taskList}>
                {eventTasks.map((task) => (
                  <TaskCard key={task.assignment_id} task={task} onComplete={handleComplete} onReminderUpdate={loadTasks} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showSettings && <StaffSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
};

const TaskCard: React.FC<{
  task: TaskAssignment;
  onComplete: (id: number) => void;
  onReminderUpdate: () => void;
}> = ({ task, onComplete, onReminderUpdate }) => {
  const [showReminderEdit, setShowReminderEdit] = React.useState(false);
  const [reminderMinutes, setReminderMinutes] = React.useState(task.reminder_minutes || 15);
  const [saving, setSaving] = React.useState(false);
  const [updatingStatus, setUpdatingStatus] = React.useState(false);

  // Update reminder state when task prop changes
  React.useEffect(() => {
    setReminderMinutes(task.reminder_minutes || 15);
  }, [task.reminder_minutes]);

  const getEventDate = () => {
    const startDate = new Date(task.instance_start_date);
    startDate.setDate(startDate.getDate() + task.day_number - 1);
    return startDate.toLocaleDateString('de-DE');
  };

  const handleSaveReminder = async () => {
    setSaving(true);
    try {
      await tasksApi.updateReminder(task.assignment_id, reminderMinutes);
      setShowReminderEdit(false);
      onReminderUpdate(); // Reload tasks to get updated value
    } catch (error) {
      console.error('Update reminder error:', error);
      alert('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleSetInProgress = async () => {
    setUpdatingStatus(true);
    try {
      await tasksApi.updateStatus(task.id, 'in_progress');
      onReminderUpdate(); // Reload tasks to get updated status
    } catch (error) {
      console.error('Update status error:', error);
      alert('Fehler beim Aktualisieren des Status');
    } finally {
      setUpdatingStatus(false);
    }
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

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      not_started: '#6b7280',
      in_progress: '#3b82f6',
      completed: '#10b981',
      overdue: '#ef4444',
    };
    return colors[status] || '#6b7280';
  };

  return (
    <div className={task.completed ? styles.taskCardCompleted : styles.taskCard}>
      <div className={styles.taskHeader}>
        <h3 className={styles.taskTitle}>{task.title}</h3>
      </div>

      {/* Zeitinformationen */}
      <div style={{ marginBottom: '12px', fontSize: '14px', color: '#6b7280' }}>
        {task.scheduled_time && (
          <div>📅 Geplante Zeit: {task.scheduled_time} Uhr</div>
        )}
        {task.start_time && (
          <div>🚀 Startzeit: {task.start_time} Uhr</div>
        )}
        {task.end_time && (
          <div>🏁 Endzeit: {task.end_time} Uhr</div>
        )}
      </div>

      {task.description && <p className={styles.taskDescription}>{task.description}</p>}

      <div className={styles.taskMeta}>
        <span className={styles.taskEvent}>{task.event_name}</span>
        <span className={styles.taskDay}>
          Tag {task.day_number} ({getEventDate()})
        </span>
        <span
          className={styles.taskStatus}
          style={{ backgroundColor: getStatusColor(task.status), color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}
        >
          {getStatusLabel(task.status)}
        </span>
      </div>

      {/* Erinnerung bearbeiten - nur für zugewiesene Aufgaben */}
      {!task.completed && task.assignment_id && (
        <div className={styles.reminderSection}>
          {!showReminderEdit ? (
            <button
              onClick={() => setShowReminderEdit(true)}
              className={styles.reminderButton}
            >
              🔔 Erinnerung: {task.reminder_minutes || 15} Min. vorher
            </button>
          ) : (
            <div className={styles.reminderEdit}>
              <label className={styles.reminderLabel}>
                Erinnerungszeit (Minuten vorher):
              </label>
              <div className={styles.reminderControls}>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(parseInt(e.target.value))}
                  className={styles.reminderInput}
                />
                <button
                  onClick={handleSaveReminder}
                  disabled={saving}
                  className={styles.reminderSave}
                >
                  {saving ? '...' : '✓'}
                </button>
                <button
                  onClick={() => setShowReminderEdit(false)}
                  className={styles.reminderCancel}
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!task.completed ? (
        <div className={styles.taskActions}>
          {(task.status === 'not_started' || task.status === 'overdue') && (
            <button
              onClick={handleSetInProgress}
              disabled={updatingStatus}
              className={styles.inProgressButton}
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '10px 20px',
                border: 'none',
                borderRadius: '6px',
                cursor: updatingStatus ? 'not-allowed' : 'pointer',
                opacity: updatingStatus ? 0.6 : 1,
                marginBottom: '8px',
                width: '100%',
              }}
            >
              {updatingStatus ? 'Wird aktualisiert...' : '▶️ In Arbeit setzen'}
            </button>
          )}
          {task.assignment_id ? (
            <button onClick={() => onComplete(task.assignment_id)} className={styles.completeButton}>
              Als erledigt markieren
            </button>
          ) : (
            <div style={{ padding: '10px', textAlign: 'center', color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>
              Öffentliche Aufgabe
            </div>
          )}
        </div>
      ) : (
        <div className={styles.completedBadge}>Erledigt</div>
      )}
    </div>
  );
};

// Helper Funktionen
function groupTasksByEventDay(tasks: TaskAssignment[]) {
  const grouped: { [key: string]: TaskAssignment[] } = {};

  tasks.forEach((task) => {
    // Gruppiere nach Event-Instanz und Tag
    const key = `${task.event_name} #${task.instance_number} - Tag ${task.day_number}`;

    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(task);
  });

  // Sortiere Gruppen nach Event und Tag
  return Object.keys(grouped)
    .sort((a, b) => {
      const taskA = grouped[a][0];
      const taskB = grouped[b][0];

      // Erst nach Event-Namen sortieren
      const eventCompare = taskA.event_name.localeCompare(taskB.event_name);
      if (eventCompare !== 0) return eventCompare;

      // Dann nach Instanz-Nummer
      const instanceCompare = (taskA.instance_number || 0) - (taskB.instance_number || 0);
      if (instanceCompare !== 0) return instanceCompare;

      // Dann nach Tag-Nummer
      return taskA.day_number - taskB.day_number;
    })
    .reduce((acc, key) => {
      // Sortiere Tasks innerhalb jeder Gruppe nach Startzeit (ohne Startzeit zuerst)
      acc[key] = grouped[key].sort((a, b) => {
        const hasStartA = !!a.start_time;
        const hasStartB = !!b.start_time;

        // Tasks ohne Startzeit zuerst
        if (!hasStartA && !hasStartB) {
          // Beide ohne Startzeit: nach scheduled_time sortieren
          const timeA = a.scheduled_time || '23:59';
          const timeB = b.scheduled_time || '23:59';
          return timeA.localeCompare(timeB);
        }
        if (!hasStartA) return -1; // A hat keine Startzeit, kommt zuerst
        if (!hasStartB) return 1;  // B hat keine Startzeit, kommt zuerst

        // Beide haben Startzeit: normal sortieren
        return a.start_time!.localeCompare(b.start_time!);
      });
      return acc;
    }, {} as { [key: string]: TaskAssignment[] });
}

function groupTasksByDay(tasks: TaskAssignment[]) {
  const grouped: { [key: string]: TaskAssignment[] } = {};

  tasks.forEach((task) => {
    const startDate = new Date(task.instance_start_date);
    startDate.setDate(startDate.getDate() + task.day_number - 1);
    const dateStr = startDate.toLocaleDateString('de-DE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    if (!grouped[dateStr]) {
      grouped[dateStr] = [];
    }
    grouped[dateStr].push(task);
  });

  // Sortiere nach tatsächlichem Datum (Start-Datum + Tag-Nummer)
  return Object.keys(grouped)
    .sort((a, b) => {
      const taskA = grouped[a][0];
      const taskB = grouped[b][0];

      // Berechne tatsächliches Datum für jede Task
      const dateA = new Date(taskA.instance_start_date);
      dateA.setDate(dateA.getDate() + taskA.day_number - 1);

      const dateB = new Date(taskB.instance_start_date);
      dateB.setDate(dateB.getDate() + taskB.day_number - 1);

      return dateA.getTime() - dateB.getTime();
    })
    .reduce((acc, key) => {
      // Sortiere nach Startzeit (ohne Startzeit zuerst)
      acc[key] = grouped[key].sort((a, b) => {
        const hasStartA = !!a.start_time;
        const hasStartB = !!b.start_time;

        if (!hasStartA && !hasStartB) {
          const timeA = a.scheduled_time || '23:59';
          const timeB = b.scheduled_time || '23:59';
          return timeA.localeCompare(timeB);
        }
        if (!hasStartA) return -1;
        if (!hasStartB) return 1;
        return a.start_time!.localeCompare(b.start_time!);
      });
      return acc;
    }, {} as { [key: string]: TaskAssignment[] });
}

function groupTasksByEvent(tasks: TaskAssignment[]) {
  const grouped: { [key: string]: TaskAssignment[] } = {};

  tasks.forEach((task) => {
    const key = `${task.event_name} #${task.instance_number}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(task);
  });

  // Sortiere Tasks innerhalb jeder Gruppe nach Startzeit (ohne Startzeit zuerst)
  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => {
      // Erst nach Tag sortieren
      const dayCompare = a.day_number - b.day_number;
      if (dayCompare !== 0) return dayCompare;

      // Dann nach Startzeit (ohne Startzeit zuerst)
      const hasStartA = !!a.start_time;
      const hasStartB = !!b.start_time;

      if (!hasStartA && !hasStartB) {
        const timeA = a.scheduled_time || '23:59';
        const timeB = b.scheduled_time || '23:59';
        return timeA.localeCompare(timeB);
      }
      if (!hasStartA) return -1;
      if (!hasStartB) return 1;
      return a.start_time!.localeCompare(b.start_time!);
    });
  });

  return grouped;
}
