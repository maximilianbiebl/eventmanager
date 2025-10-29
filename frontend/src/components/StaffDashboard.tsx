import React, { useState, useEffect } from 'react';
import { tasksApi, TaskAssignment } from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { StaffSettings } from './StaffSettings';
import { ChangePasswordDialog } from './admin/ChangePasswordDialog';
import { DescriptionModal } from './DescriptionModal';
import client from '../api/client';
import styles from './StaffDashboard.module.css';

export const StaffDashboard: React.FC = () => {
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [groupBy, setGroupBy] = useState<'event-day' | 'event' | 'date'>('event-day');
  const [showSettings, setShowSettings] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [showEventFilter, setShowEventFilter] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { user, logout } = useAuth();
  const notifications = useNotifications();

  useEffect(() => {
    loadUserSettings();
    loadSelectedEventsFromStorage();
    loadTasks();

    // Auto-refresh alle 30 Sekunden für Status-Synchronisation
    const interval = setInterval(() => {
      loadTasks();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadSelectedEventsFromStorage = () => {
    try {
      const stored = localStorage.getItem('selectedEvents');
      if (stored) {
        const eventsArray = JSON.parse(stored);
        setSelectedEvents(new Set(eventsArray));
      }
    } catch (error) {
      console.error('Load selected events from storage error:', error);
    }
  };

  const saveSelectedEventsToStorage = (events: Set<string>) => {
    try {
      const eventsArray = Array.from(events);
      localStorage.setItem('selectedEvents', JSON.stringify(eventsArray));
    } catch (error) {
      console.error('Save selected events to storage error:', error);
    }
  };

  const loadUserSettings = async () => {
    try {
      const response = await client.get('/users/me/settings');
      if (response.data.default_view) {
        setViewMode(response.data.default_view);
      }
    } catch (error) {
      console.error('Load user settings error:', error);
    }
  };

  const loadTasks = async () => {
    try {
      const data = await tasksApi.getMyTasks();
      setTasks(data);

      // Get unique events from current tasks
      const currentUniqueEvents = new Set(data.map(t => `${t.event_name}#${t.instance_start_date}`));

      // Initialize selectedEvents with all unique events if not yet set AND not loaded from storage
      const stored = localStorage.getItem('selectedEvents');
      if (!stored && selectedEvents.size === 0 && data.length > 0) {
        setSelectedEvents(currentUniqueEvents);
        saveSelectedEventsToStorage(currentUniqueEvents);
      } else if (stored) {
        // Validate stored events against current tasks
        const storedEvents = new Set<string>(JSON.parse(stored));
        const validEvents = new Set<string>(
          Array.from(storedEvents).filter((key: string) => currentUniqueEvents.has(key))
        );

        // If no valid events remain, select all current events
        if (validEvents.size === 0 && currentUniqueEvents.size > 0) {
          setSelectedEvents(currentUniqueEvents);
          saveSelectedEventsToStorage(currentUniqueEvents);
        } else if (validEvents.size !== storedEvents.size) {
          // Update if some stored events are no longer valid
          setSelectedEvents(validEvents);
          saveSelectedEventsToStorage(validEvents);
        }
      }
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

  const handleCompletePublic = async (taskId: number) => {
    try {
      await tasksApi.completePublic(taskId);
      await loadTasks();
    } catch (error) {
      console.error('Complete public task error:', error);
      alert('Fehler beim Markieren der öffentlichen Aufgabe');
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

  const handleToggleEvent = (eventKey: string) => {
    const newSelected = new Set(selectedEvents);
    if (newSelected.has(eventKey)) {
      newSelected.delete(eventKey);
    } else {
      newSelected.add(eventKey);
    }
    setSelectedEvents(newSelected);
    saveSelectedEventsToStorage(newSelected);
  };

  const handleSelectAllEvents = () => {
    const allEvents = new Set(tasks.map(t => `${t.event_name}#${t.instance_start_date}`));
    setSelectedEvents(allEvents);
    saveSelectedEventsToStorage(allEvents);
  };

  const handleDeselectAllEvents = () => {
    const emptySet = new Set<string>();
    setSelectedEvents(emptySet);
    saveSelectedEventsToStorage(emptySet);
  };

  // Get unique events for the filter
  const uniqueEvents = Array.from(new Set(tasks.map(t => `${t.event_name}#${t.instance_start_date}`))).sort();

  // Create display names for events (show date only if multiple instances exist)
  const eventDisplayNames: { [key: string]: string } = {};
  const eventNameCounts: { [name: string]: number } = {};

  // Count how many instances of each event name exist
  uniqueEvents.forEach(key => {
    const name = key.split('#')[0];
    eventNameCounts[name] = (eventNameCounts[name] || 0) + 1;
  });

  // Create display names
  uniqueEvents.forEach(key => {
    const [name, date] = key.split('#');
    if (eventNameCounts[name] > 1) {
      // Multiple instances - show date
      const formattedDate = new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      eventDisplayNames[key] = `${name} (${formattedDate})`;
    } else {
      // Single instance - show only name
      eventDisplayNames[key] = name;
    }
  });

  // Filter tasks based on hideCompleted and selectedEvents
  const filteredTasks = React.useMemo(() => {
    return tasks.filter(t => {
      // Filter by completed status
      if (hideCompleted && (t.completed || t.status === 'completed')) {
        return false;
      }

      // Filter by selected events
      const eventKey = `${t.event_name}#${t.instance_start_date}`;
      if (selectedEvents.size > 0 && !selectedEvents.has(eventKey)) {
        return false;
      }

      return true;
    });
  }, [tasks, hideCompleted, selectedEvents]);

  const groupedTasks = groupTasksByDay(filteredTasks);
  const eventGroups = groupTasksByEvent(filteredTasks);
  const eventDayGroups = groupTasksByEventDay(filteredTasks);

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

        {/* Desktop buttons */}
        <div className={styles.headerButtons}>
          <button onClick={() => setShowSettings(true)} className={styles.settingsButton}>
            ⚙️ Einstellungen
          </button>
          <button onClick={() => setShowChangePassword(true)} className={styles.settingsButton}>
            🔒 Passwort ändern
          </button>
          <button onClick={logout} className={styles.logoutButton}>
            Abmelden
          </button>
        </div>

        {/* Mobile hamburger menu */}
        <div className={styles.mobileMenuContainer}>
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className={styles.hamburgerButton}
            aria-label="Menu"
          >
            <div className={styles.hamburgerIcon}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>

          {showMobileMenu && (
            <>
              <div
                className={styles.mobileMenuOverlay}
                onClick={() => setShowMobileMenu(false)}
              />
              <div className={styles.mobileMenu}>
                <button
                  onClick={() => {
                    setShowSettings(true);
                    setShowMobileMenu(false);
                  }}
                  className={styles.mobileMenuItem}
                >
                  ⚙️ Einstellungen
                </button>
                <button
                  onClick={() => {
                    setShowChangePassword(true);
                    setShowMobileMenu(false);
                  }}
                  className={styles.mobileMenuItem}
                >
                  🔒 Passwort ändern
                </button>
                <button
                  onClick={() => {
                    logout();
                    setShowMobileMenu(false);
                  }}
                  className={styles.mobileMenuItemLogout}
                >
                  Abmelden
                </button>
              </div>
            </>
          )}
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

      {/* Ansichtsmodus wählen */}
      <div className={styles.controls}>
        <button
          onClick={() => setViewMode('cards')}
          className={viewMode === 'cards' ? styles.activeTab : styles.tab}
        >
          📋 Karten
        </button>
        <button
          onClick={() => setViewMode('table')}
          className={viewMode === 'table' ? styles.activeTab : styles.tab}
        >
          📊 Tabelle
        </button>
      </div>

      {/* Gruppierung wählen - nur für Karten-Ansicht */}
      {viewMode === 'cards' && (
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
      )}

      {/* Tag-Tabs - nur für Tabellen-Ansicht */}
      {viewMode === 'table' && filteredTasks.length > 0 && (
        <div className={styles.dayTabsContainer}>
          <button
            onClick={() => setSelectedDay('all')}
            className={selectedDay === 'all' ? styles.dayTabActive : styles.dayTab}
          >
            Alle Tage
          </button>
          {Array.from(new Set(filteredTasks.map(t => t.day_number))).sort((a, b) => a - b).map(day => (
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

      {/* Filter für erledigte Aufgaben */}
      <div className={styles.filterSection}>
        <label className={styles.filterLabel}>
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(e) => setHideCompleted(e.target.checked)}
            className={styles.filterCheckbox}
          />
          <span>Erledigte Aufgaben ausblenden</span>
        </label>
      </div>

      {/* Filter für Veranstaltungen */}
      {uniqueEvents.length > 1 && (
        <div className={styles.filterSection}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <button
              onClick={() => setShowEventFilter(!showEventFilter)}
              className={styles.filterToggleButton}
            >
              📅 Veranstaltungen filtern ({selectedEvents.size}/{uniqueEvents.length})
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={handleSelectAllEvents} className={styles.filterActionButton}>
                Alle
              </button>
              <button onClick={handleDeselectAllEvents} className={styles.filterActionButton}>
                Keine
              </button>
            </div>
          </div>

          {showEventFilter && (
            <div className={styles.eventFilterList}>
              {uniqueEvents.map(eventKey => (
                <label key={eventKey} className={styles.filterLabel}>
                  <input
                    type="checkbox"
                    checked={selectedEvents.has(eventKey)}
                    onChange={() => handleToggleEvent(eventKey)}
                    className={styles.filterCheckbox}
                  />
                  <span>{eventDisplayNames[eventKey]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aufgabenliste */}
      {tasks.length === 0 ? (
        <div className={styles.empty}>Keine Aufgaben vorhanden</div>
      ) : viewMode === 'table' ? (
        <StaffTableView
          tasks={filteredTasks}
          allTasks={tasks}
          selectedDay={selectedDay}
          onComplete={handleComplete}
          onCompletePublic={handleCompletePublic}
          onReload={loadTasks}
        />
      ) : groupBy === 'event-day' ? (
        <div>
          {Object.entries(eventDayGroups).map(([groupKey, groupTasks]) => (
            <div key={groupKey} className={styles.group}>
              <h2 className={styles.groupTitle}>{groupKey}</h2>
              <div className={styles.taskList}>
                {groupTasks.map((task) => (
                  <TaskCard
                    key={task.assignment_id || task.id}
                    task={task}
                    onComplete={handleComplete}
                    onCompletePublic={handleCompletePublic}
                    onReminderUpdate={loadTasks}
                  />
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
                  <TaskCard
                    key={task.assignment_id || task.id}
                    task={task}
                    onComplete={handleComplete}
                    onCompletePublic={handleCompletePublic}
                    onReminderUpdate={loadTasks}
                  />
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
                  <TaskCard
                    key={task.assignment_id || task.id}
                    task={task}
                    onComplete={handleComplete}
                    onCompletePublic={handleCompletePublic}
                    onReminderUpdate={loadTasks}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showSettings && <StaffSettings onClose={() => setShowSettings(false)} />}
      {showChangePassword && <ChangePasswordDialog onClose={() => setShowChangePassword(false)} />}
    </div>
  );
};

const TaskCard: React.FC<{
  task: TaskAssignment;
  onComplete: (id: number) => void;
  onCompletePublic: (taskId: number) => void;
  onReminderUpdate: () => void;
}> = ({ task, onComplete, onCompletePublic, onReminderUpdate }) => {
  const [showReminderEdit, setShowReminderEdit] = React.useState(false);
  const [reminderMinutes, setReminderMinutes] = React.useState(task.reminder_minutes || 15);
  const [saving, setSaving] = React.useState(false);
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = React.useState(false);

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

  const handleStatusChange = async (newStatus: string) => {
    try {
      await tasksApi.updateStatus(task.id, newStatus);
      setShowStatusDropdown(false);
      onReminderUpdate(); // Reload tasks to get updated status
    } catch (error) {
      console.error('Status change error:', error);
      alert('Fehler beim Ändern des Status');
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

  // Check if task is completed (either assignment-specific or global status)
  const isCompleted = task.status === 'completed';

  return (
    <div className={isCompleted ? styles.taskCardCompleted : styles.taskCard}>
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
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {/* Nur Dropdown anzeigen wenn es Optionen gibt */}
          {task.status === 'not_started' || task.status === 'in_progress' ? (
            <>
              <span
                className={styles.taskStatus}
                style={{
                  backgroundColor: getStatusColor(task.status),
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              >
                {getStatusLabel(task.status)} ▼
              </span>
              {showStatusDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  marginTop: '4px',
                  minWidth: '180px',
                  zIndex: 9999
                }}>
                  {task.status === 'not_started' && (
                    <div
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                      onClick={() => handleStatusChange('in_progress')}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                      ▶ In Arbeit setzen
                    </div>
                  )}
                  {task.status === 'in_progress' && (
                    <div
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                      onClick={() => handleStatusChange('not_started')}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                      ↩ Zurück zu "Nicht gestartet"
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Kein Dropdown für completed/overdue - nur Badge */
            <span
              className={styles.taskStatus}
              style={{
                backgroundColor: getStatusColor(task.status),
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px'
              }}
            >
              {getStatusLabel(task.status)}
            </span>
          )}
        </div>
      </div>

      {/* Erinnerung bearbeiten - nur für zugewiesene Aufgaben */}
      {!isCompleted && task.assignment_id && (
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

      {!isCompleted ? (
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
            <button onClick={() => onCompletePublic(task.id)} className={styles.completeButton}>
              Als erledigt markieren (Öffentlich)
            </button>
          )}
        </div>
      ) : (
        <div className={styles.completedBadge}>Erledigt</div>
      )}
    </div>
  );
};

// Staff Table View Komponente
const StaffTableView: React.FC<{
  tasks: TaskAssignment[];
  allTasks: TaskAssignment[];
  selectedDay: number | 'all';
  onComplete: (id: number) => void;
  onCompletePublic: (taskId: number) => void;
  onReload: () => void;
}> = ({ tasks, allTasks, selectedDay, onComplete, onCompletePublic, onReload }) => {
  const [showStatusDropdown, setShowStatusDropdown] = React.useState<number | null>(null);
  const [sortColumn, setSortColumn] = React.useState<string>('day');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [descriptionModal, setDescriptionModal] = React.useState<{ title: string; description: string } | null>(null);

  // Filter tasks by selected day
  const dayFilteredTasks = selectedDay === 'all'
    ? tasks
    : tasks.filter(t => t.day_number === selectedDay);

  // Check if only one unique event in ALL tasks (not just filtered)
  const uniqueEventsInAll = new Set(allTasks.map(t => `${t.event_name}#${t.instance_start_date}`));
  const showEventColumn = uniqueEventsInAll.size > 1;

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort tasks based on selected column and direction
  const sortedTasks = [...dayFilteredTasks].sort((a, b) => {
    let compareResult = 0;

    switch (sortColumn) {
      case 'event':
        compareResult = a.event_name.localeCompare(b.event_name);
        break;
      case 'day':
        compareResult = a.day_number - b.day_number;
        break;
      case 'date':
        const dateA = new Date(a.instance_start_date);
        dateA.setDate(dateA.getDate() + a.day_number - 1);
        const dateB = new Date(b.instance_start_date);
        dateB.setDate(dateB.getDate() + b.day_number - 1);
        compareResult = dateA.getTime() - dateB.getTime();
        break;
      case 'title':
        compareResult = a.title.localeCompare(b.title);
        break;
      case 'scheduled':
        const schedA = a.scheduled_time || '99:99';
        const schedB = b.scheduled_time || '99:99';
        compareResult = schedA.localeCompare(schedB);
        break;
      case 'start':
        const startA = a.start_time || '99:99';
        const startB = b.start_time || '99:99';
        compareResult = startA.localeCompare(startB);
        break;
      case 'end':
        const endA = a.end_time || '99:99';
        const endB = b.end_time || '99:99';
        compareResult = endA.localeCompare(endB);
        break;
      case 'status':
        compareResult = a.status.localeCompare(b.status);
        break;
      default:
        compareResult = 0;
    }

    return sortDirection === 'asc' ? compareResult : -compareResult;
  });

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

  const getEventDate = (task: TaskAssignment) => {
    const startDate = new Date(task.instance_start_date);
    startDate.setDate(startDate.getDate() + task.day_number - 1);
    return startDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  };

  const handleStatusChange = async (task: TaskAssignment, newStatus: string) => {
    try {
      await tasksApi.updateStatus(task.id, newStatus);
      // Reload tasks to show updated status
      await onReload();
    } catch (error) {
      console.error('Status change error:', error);
      alert('Fehler beim Ändern des Status');
    }
    setShowStatusDropdown(null);
  };

  if (sortedTasks.length === 0) {
    return <div className={styles.empty}>Keine Aufgaben für den ausgewählten Tag</div>;
  }

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return ' ↕';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className={styles.tableContainer}>
      <table className={styles.taskTable}>
        <thead>
          <tr>
            {showEventColumn && (
              <th
                className={styles.hideOnMobile}
                onClick={() => handleSort('event')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Veranstaltung{getSortIcon('event')}
              </th>
            )}
            <th
              className={styles.hideOnMobile}
              onClick={() => handleSort('day')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Tag{getSortIcon('day')}
            </th>
            <th
              className={styles.hideOnMobile}
              onClick={() => handleSort('date')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Datum{getSortIcon('date')}
            </th>
            <th
              onClick={() => handleSort('title')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Aufgabe{getSortIcon('title')}
            </th>
            <th
              className={styles.hideOnMobile}
              onClick={() => handleSort('scheduled')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Geplante Zeit{getSortIcon('scheduled')}
            </th>
            <th
              className={styles.hideOnMobile}
              onClick={() => handleSort('start')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Start{getSortIcon('start')}
            </th>
            <th
              className={styles.hideOnMobile}
              onClick={() => handleSort('end')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Ende{getSortIcon('end')}
            </th>
            <th
              onClick={() => handleSort('status')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Status{getSortIcon('status')}
            </th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((task) => {
            const isCompleted = task.status === 'completed';
            const taskKey = task.assignment_id || task.id;
            return (
              <tr key={taskKey} className={isCompleted ? styles.completedRow : ''}>
                {showEventColumn && <td className={styles.hideOnMobile}>{task.event_name}</td>}
                <td className={styles.hideOnMobile}>{task.day_number}</td>
                <td className={styles.hideOnMobile}>{getEventDate(task)}</td>
                <td>
                  <div className={styles.taskTitleCell}>
                    <strong>{task.title}</strong>
                    {task.is_public && <span className={styles.publicBadge}>Öffentlich</span>}
                  </div>
                  {task.description && (
                    <div className={styles.taskDescCell}>
                      {task.description.length > 60 ? (
                        <>
                          {task.description.substring(0, 60)}...
                          <button
                            onClick={() => setDescriptionModal({ title: task.title, description: task.description! })}
                            style={{
                              marginLeft: '0.25rem',
                              padding: '0.125rem 0.375rem',
                              fontSize: '0.7rem',
                              backgroundColor: 'transparent',
                              border: '1px solid #d1d5db',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              color: '#6b7280'
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
                  <div className={styles.showOnMobile}>
                    <div className={styles.mobileMeta}>
                      {showEventColumn && <div>📅 {task.event_name}</div>}
                      <div>Tag {task.day_number} • {getEventDate(task)}</div>
                      {task.scheduled_time && <div>📅 {task.scheduled_time} Uhr</div>}
                      {task.start_time && <div>🚀 {task.start_time} Uhr</div>}
                      {task.end_time && <div>🏁 {task.end_time} Uhr</div>}
                    </div>
                  </div>
                </td>
                <td className={styles.hideOnMobile}>{task.scheduled_time || '-'}</td>
                <td className={styles.hideOnMobile}>{task.start_time || '-'}</td>
                <td className={styles.hideOnMobile}>{task.end_time || '-'}</td>
                <td>
                  <div className={styles.statusDropdownContainer}>
                    {/* Nur Dropdown anzeigen wenn es Optionen gibt */}
                    {task.status === 'not_started' || task.status === 'in_progress' ? (
                      <>
                        <span
                          className={styles.statusBadgeClickable}
                          style={{ backgroundColor: getStatusColor(task.status) }}
                          onClick={() => setShowStatusDropdown(showStatusDropdown === taskKey ? null : taskKey)}
                        >
                          {getStatusLabel(task.status)} ▼
                        </span>
                        {showStatusDropdown === taskKey && (
                          <div className={styles.statusDropdown}>
                            {task.status === 'not_started' && (
                              <div
                                className={styles.statusOption}
                                onClick={() => handleStatusChange(task, 'in_progress')}
                              >
                                ▶ In Arbeit setzen
                              </div>
                            )}
                            {task.status === 'in_progress' && (
                              <div
                                className={styles.statusOption}
                                onClick={() => handleStatusChange(task, 'not_started')}
                              >
                                ↩ Zurück zu "Nicht gestartet"
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      /* Kein Dropdown für completed/overdue - nur Badge */
                      <span
                        className={styles.statusBadge}
                        style={{ backgroundColor: getStatusColor(task.status) }}
                      >
                        {getStatusLabel(task.status)}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  {!isCompleted && (
                    task.assignment_id ? (
                      <button
                        onClick={() => onComplete(task.assignment_id)}
                        className={styles.tableCompleteButton}
                      >
                        Erledigt
                      </button>
                    ) : (
                      <button
                        onClick={() => onCompletePublic(task.id)}
                        className={styles.tableCompleteButton}
                      >
                        Erledigt
                      </button>
                    )
                  )}
                  {isCompleted && (
                    <span className={styles.completedText}>✓ Erledigt</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {descriptionModal && (
        <DescriptionModal
          title={descriptionModal.title}
          description={descriptionModal.description}
          onClose={() => setDescriptionModal(null)}
        />
      )}
    </div>
  );
};

// Helper Funktionen
function groupTasksByEventDay(tasks: TaskAssignment[]) {
  const grouped: { [key: string]: TaskAssignment[] } = {};

  tasks.forEach((task) => {
    // Gruppiere nach Event-Instanz und Tag
    const key = `${task.event_name} - Tag ${task.day_number}`;

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
      // Sortiere Tasks innerhalb jeder Gruppe nach frühester Zeit
      acc[key] = grouped[key].sort((a, b) => {
        // Use start_time if available, otherwise scheduled_time
        const timeA = a.start_time || a.scheduled_time || '99:99';
        const timeB = b.start_time || b.scheduled_time || '99:99';
        return timeA.localeCompare(timeB);
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
    const key = `${task.event_name}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(task);
  });

  // Sortiere Tasks innerhalb jeder Gruppe nach Tag und frühester Zeit
  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => {
      // Erst nach Tag sortieren
      const dayCompare = a.day_number - b.day_number;
      if (dayCompare !== 0) return dayCompare;

      // Dann nach frühester Zeit
      const timeA = a.start_time || a.scheduled_time || '99:99';
      const timeB = b.start_time || b.scheduled_time || '99:99';
      return timeA.localeCompare(timeB);
    });
  });

  return grouped;
}
