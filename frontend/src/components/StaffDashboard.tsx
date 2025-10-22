import React, { useState, useEffect } from 'react';
import { tasksApi, TaskAssignment } from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';

export const StaffDashboard: React.FC = () => {
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<'event' | 'day'>('day');
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

  if (loading) {
    return <div style={styles.loading}>Lade Aufgaben...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Meine Aufgaben</h1>
          <p style={styles.subtitle}>Willkommen, {user?.name}!</p>
        </div>
        <button onClick={logout} style={styles.logoutButton}>
          Abmelden
        </button>
      </div>

      {/* Benachrichtigungen */}
      {notifications.isSupported && !notifications.isSubscribed && (
        <div style={styles.notificationBanner}>
          <p>Aktiviere Benachrichtigungen um an deine Aufgaben erinnert zu werden!</p>
          <button onClick={handleEnableNotifications} style={styles.enableButton}>
            Benachrichtigungen aktivieren
          </button>
        </div>
      )}

      {notifications.isSubscribed && (
        <div style={styles.notificationActive}>
          Benachrichtigungen sind aktiv
          <button onClick={handleTestNotification} style={styles.testButton}>
            Test senden
          </button>
        </div>
      )}

      {/* Gruppierung wählen */}
      <div style={styles.controls}>
        <button
          onClick={() => setGroupBy('day')}
          style={groupBy === 'day' ? styles.activeTab : styles.tab}
        >
          Nach Tag
        </button>
        <button
          onClick={() => setGroupBy('event')}
          style={groupBy === 'event' ? styles.activeTab : styles.tab}
        >
          Nach Veranstaltung
        </button>
      </div>

      {/* Aufgabenliste */}
      {tasks.length === 0 ? (
        <div style={styles.empty}>Keine Aufgaben vorhanden</div>
      ) : groupBy === 'day' ? (
        <div>
          {Object.entries(groupedTasks).map(([day, dayTasks]) => (
            <div key={day} style={styles.group}>
              <h2 style={styles.groupTitle}>{day}</h2>
              <div style={styles.taskList}>
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
            <div key={eventName} style={styles.group}>
              <h2 style={styles.groupTitle}>{eventName}</h2>
              <div style={styles.taskList}>
                {eventTasks.map((task) => (
                  <TaskCard key={task.assignment_id} task={task} onComplete={handleComplete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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
    <div style={task.completed ? styles.taskCardCompleted : styles.taskCard}>
      <div style={styles.taskHeader}>
        <h3 style={styles.taskTitle}>{task.title}</h3>
        {task.scheduled_time && <span style={styles.taskTime}>{task.scheduled_time} Uhr</span>}
      </div>

      {task.description && <p style={styles.taskDescription}>{task.description}</p>}

      <div style={styles.taskMeta}>
        <span style={styles.taskEvent}>{task.event_name}</span>
        <span style={styles.taskDay}>
          Tag {task.day_number} ({getEventDate()})
        </span>
      </div>

      {!task.completed ? (
        <button onClick={() => onComplete(task.assignment_id)} style={styles.completeButton}>
          Als erledigt markieren
        </button>
      ) : (
        <div style={styles.completedBadge}>Erledigt</div>
      )}
    </div>
  );
};

// Helper Funktionen
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

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    padding: '1rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    backgroundColor: 'white',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  title: {
    fontSize: '1.875rem',
    fontWeight: 'bold',
    color: '#111827',
    margin: 0,
  },
  subtitle: {
    color: '#6b7280',
    margin: '0.5rem 0 0 0',
  },
  logoutButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.125rem',
  },
  notificationBanner: {
    backgroundColor: '#dbeafe',
    padding: '1rem',
    borderRadius: '8px',
    marginBottom: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationActive: {
    backgroundColor: '#d1fae5',
    padding: '1rem',
    borderRadius: '8px',
    marginBottom: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  enableButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  testButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  controls: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  tab: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'white',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  activeTab: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#4f46e5',
    color: 'white',
    border: '1px solid #4f46e5',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem',
    backgroundColor: 'white',
    borderRadius: '8px',
    color: '#6b7280',
  },
  group: {
    marginBottom: '2rem',
  },
  groupTitle: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    marginBottom: '1rem',
    color: '#374151',
  },
  taskList: {
    display: 'grid',
    gap: '1rem',
  },
  taskCard: {
    backgroundColor: 'white',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    borderLeft: '4px solid #4f46e5',
  },
  taskCardCompleted: {
    backgroundColor: '#f9fafb',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    borderLeft: '4px solid #10b981',
    opacity: 0.7,
  },
  taskHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    marginBottom: '0.5rem',
  },
  taskTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    margin: 0,
    color: '#111827',
  },
  taskTime: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#4f46e5',
    backgroundColor: '#eef2ff',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
  },
  taskDescription: {
    color: '#6b7280',
    margin: '0.5rem 0',
  },
  taskMeta: {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.875rem',
    color: '#6b7280',
    marginBottom: '1rem',
  },
  taskEvent: {
    fontWeight: '500',
  },
  taskDay: {},
  completeButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    width: '100%',
  },
  completedBadge: {
    padding: '0.5rem 1rem',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    borderRadius: '4px',
    textAlign: 'center',
    fontWeight: '500',
  },
};
