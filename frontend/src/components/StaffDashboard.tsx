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
    const granted = await notifications.requestPermission();
    if (granted) {
      await notifications.subscribe();
      alert('Benachrichtigungen aktiviert!');
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

      {/* Benachrichtigungen */}
      {notifications.isSupported && !notifications.isSubscribed && (
        <div className={styles.notificationBanner}>
          <p>Aktiviere Benachrichtigungen um an deine Aufgaben erinnert zu werden!</p>
          <button onClick={handleEnableNotifications} className={styles.enableButton}>
            Benachrichtigungen aktivieren
          </button>
        </div>
      )}

      {notifications.isSubscribed && (
        <div className={styles.notificationActive}>
          Benachrichtigungen sind aktiv
          <button onClick={handleTestNotification} className={styles.testButton}>
            Test senden
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
                  <TaskCard key={task.assignment_id} task={task} onComplete={handleComplete} />
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
                  <TaskCard key={task.assignment_id} task={task} onComplete={handleComplete} />
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
                  <TaskCard key={task.assignment_id} task={task} onComplete={handleComplete} />
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
}> = ({ task, onComplete }) => {
  const getEventDate = () => {
    const startDate = new Date(task.instance_start_date);
    startDate.setDate(startDate.getDate() + task.day_number - 1);
    return startDate.toLocaleDateString('de-DE');
  };

  return (
    <div className={task.completed ? styles.taskCardCompleted : styles.taskCard}>
      <div className={styles.taskHeader}>
        <h3 className={styles.taskTitle}>{task.title}</h3>
        {task.scheduled_time && <span className={styles.taskTime}>{task.scheduled_time} Uhr</span>}
      </div>

      {task.description && <p className={styles.taskDescription}>{task.description}</p>}

      <div className={styles.taskMeta}>
        <span className={styles.taskEvent}>{task.event_name}</span>
        <span className={styles.taskDay}>
          Tag {task.day_number} ({getEventDate()})
        </span>
      </div>

      {!task.completed ? (
        <button onClick={() => onComplete(task.assignment_id)} className={styles.completeButton}>
          Als erledigt markieren
        </button>
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
      // Sortiere Tasks innerhalb jeder Gruppe nach Zeit
      acc[key] = grouped[key].sort((a, b) => {
        if (!a.scheduled_time) return 1;
        if (!b.scheduled_time) return -1;
        return a.scheduled_time.localeCompare(b.scheduled_time);
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

  // Sortiere nach Datum
  return Object.keys(grouped)
    .sort((a, b) => {
      const dateA = grouped[a][0].instance_start_date;
      const dateB = grouped[b][0].instance_start_date;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    })
    .reduce((acc, key) => {
      acc[key] = grouped[key].sort((a, b) => {
        if (!a.scheduled_time) return 1;
        if (!b.scheduled_time) return -1;
        return a.scheduled_time.localeCompare(b.scheduled_time);
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

  return grouped;
}
